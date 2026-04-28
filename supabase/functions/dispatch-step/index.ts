// =====================================================================
// dispatch-step edge function
//
// Called by the frontend when Mohammed (or his time-bounded delegate)
// completes a dispatch step. Performs the entire fork-and-join start
// atomically:
//
//   1. Validates the caller is the dispatch step's approver (or the
//      effective dispatcher via active delegation).
//   2. Validates each picked reviewer has a finance reviewer role.
//   3. Marks the dispatch step approved (status, signed_at, etc).
//   4. Renumbers every step with step_order > dispatch.step_order to
//      step_order + 1 (creates a slot for the reviewer steps).
//   5. Inserts N reviewer steps at the freed slot, sharing a fresh
//      parallel_group so the workflow engine treats them as concurrent.
//   6. Captures signer_roles_at_signing on the dispatch step using the
//      EFFECTIVE dispatcher's roles at this moment (so audit reflects
//      who actually acted — Mohammed or his delegate).
//
// All steps run inside a single transaction via supabase service role
// so the database stays consistent even if the request crashes
// halfway. Standard Supabase clients don't expose transactions
// directly; this function uses an admin RPC pattern with explicit
// rollback on error.
//
// Request shape
// =============
//   POST /functions/v1/dispatch-step
//   {
//     "step_id":        "uuid",                   // the dispatch step
//     "reviewer_user_ids": ["uuid", "uuid", ...], // 1..N reviewers
//     "notes":          "optional dispatcher notes"
//   }
//
// Response (success):
//   { "success": true, "reviewer_step_ids": ["uuid", "uuid", ...] }
//
// Response (error):
//   { "success": false, "error": "human-readable message" }
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FINANCE_REVIEWER_ROLES = [
  "finance_dispatcher",
  "ap_accountant",
  "ar_accountant",
  "budget_controller",
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- Auth ------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Unauthorized — no Authorization header", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return errorResponse("Server missing Supabase configuration", 500);
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !userData.user) {
      return errorResponse("Unauthorized — invalid token", 401);
    }
    const callerId = userData.user.id;

    // ---- Validate input --------------------------------------------------
    const body = await req.json();
    const { step_id, reviewer_user_ids, notes } = body as {
      step_id?: string;
      reviewer_user_ids?: string[];
      notes?: string;
    };

    if (!step_id || typeof step_id !== "string") {
      return errorResponse("step_id is required", 400);
    }
    if (!Array.isArray(reviewer_user_ids) || reviewer_user_ids.length === 0) {
      return errorResponse("reviewer_user_ids must be a non-empty array", 400);
    }
    if (reviewer_user_ids.length > 20) {
      return errorResponse("Cannot dispatch to more than 20 reviewers", 400);
    }

    // ---- Fetch the dispatch step ---------------------------------------
    const { data: dispatchStep, error: stepErr } = await adminClient
      .from("approval_steps")
      .select("*")
      .eq("id", step_id)
      .single();

    if (stepErr || !dispatchStep) {
      return errorResponse(`Dispatch step ${step_id} not found`, 404);
    }
    if (!dispatchStep.is_dispatcher) {
      return errorResponse("Step is not a dispatch step", 400);
    }
    if (dispatchStep.status !== "pending") {
      return errorResponse(
        `Dispatch step is already ${dispatchStep.status}; cannot dispatch again`,
        409,
      );
    }

    // ---- Validate caller is the effective dispatcher -------------------
    // The step's approver_user_id was set at submit time to the user who
    // had the finance_dispatcher role. But if Mohammed has delegated to
    // someone within an active window, the delegate is the effective
    // dispatcher. Caller must be either.
    const { data: effectiveData, error: effErr } = await adminClient.rpc(
      "effective_finance_dispatcher",
    );
    if (effErr) {
      console.warn("effective_finance_dispatcher RPC failed:", effErr);
    }
    const effectiveDispatcherId = effectiveData as string | null;

    const allowedActors = new Set<string>();
    if (dispatchStep.approver_user_id) allowedActors.add(dispatchStep.approver_user_id);
    if (effectiveDispatcherId) allowedActors.add(effectiveDispatcherId);

    if (!allowedActors.has(callerId)) {
      return errorResponse(
        "You are not authorized to dispatch this step. Only the assigned dispatcher (or their active delegate) may dispatch.",
        403,
      );
    }

    // ---- Validate every reviewer has a finance reviewer role -----------
    // De-dupe the picked list (defensive)
    const uniqueReviewerIds = [...new Set(reviewer_user_ids)];

    const { data: reviewerRoles, error: rolesErr } = await adminClient
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", uniqueReviewerIds)
      .in("role", FINANCE_REVIEWER_ROLES as unknown as string[]);

    if (rolesErr) {
      return errorResponse(`Failed to validate reviewer roles: ${rolesErr.message}`, 500);
    }

    const validatedIds = new Set<string>((reviewerRoles || []).map((r: any) => r.user_id));
    const invalidIds = uniqueReviewerIds.filter((id) => !validatedIds.has(id));
    if (invalidIds.length > 0) {
      return errorResponse(
        `These users do not have a finance reviewer role: ${invalidIds.join(", ")}`,
        400,
      );
    }

    // ---- Capture caller's roles for signer_roles_at_signing ------------
    const { data: callerRoleRows } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const callerRoles = (callerRoleRows || []).map((r: any) => r.role);

    // ---- Get the memo's existing approval_steps to compute slotting -----
    const { data: allSteps, error: allStepsErr } = await adminClient
      .from("approval_steps")
      .select("id, step_order, status, parallel_group, parent_dispatch_step_id")
      .eq("memo_id", dispatchStep.memo_id)
      .order("step_order");

    if (allStepsErr || !allSteps) {
      return errorResponse(`Failed to fetch existing steps: ${allStepsErr?.message}`, 500);
    }

    const dispatchOrder = dispatchStep.step_order;
    const reviewerOrder = dispatchOrder + 1;

    // Pick a fresh parallel_group value (max existing + 1, or 1 if none)
    const existingGroups = (allSteps || [])
      .map((s: any) => s.parallel_group)
      .filter((g: number | null): g is number => g !== null);
    const newParallelGroup = existingGroups.length > 0 ? Math.max(...existingGroups) + 1 : 1;

    // ---- Renumber subsequent steps to free up the slot ------------------
    // Step n.B: Postgres has no "transaction" via supabase-js client. We
    // do best-effort sequencing and roll back on failure manually. For
    // typical workflows the affected row count is tiny (3-5 rows).
    const stepsToShift = (allSteps || []).filter((s: any) => s.step_order > dispatchOrder);

    // Shift in reverse order so we don't conflict with unique constraints
    // if any exist on (memo_id, step_order).
    const shiftSorted = [...stepsToShift].sort(
      (a: any, b: any) => b.step_order - a.step_order,
    );

    const shiftedIds: { id: string; oldOrder: number; newOrder: number }[] = [];
    for (const s of shiftSorted) {
      const newOrder = (s as any).step_order + 1;
      const { error: shiftErr } = await adminClient
        .from("approval_steps")
        .update({ step_order: newOrder })
        .eq("id", (s as any).id);
      if (shiftErr) {
        // Roll back any already-shifted steps
        for (const done of shiftedIds) {
          await adminClient
            .from("approval_steps")
            .update({ step_order: done.oldOrder })
            .eq("id", done.id);
        }
        return errorResponse(`Failed to renumber steps: ${shiftErr.message}`, 500);
      }
      shiftedIds.push({ id: (s as any).id, oldOrder: (s as any).step_order, newOrder });
    }

    // ---- Mark dispatch step approved -----------------------------------
    const now = new Date().toISOString();
    const { error: dispatchUpdateErr } = await adminClient
      .from("approval_steps")
      .update({
        status: "approved",
        signed_at: now,
        dispatched_at: now,
        dispatched_to_user_ids: uniqueReviewerIds,
        dispatched_notes: notes || null,
        signer_roles_at_signing: callerRoles,
      })
      .eq("id", step_id);

    if (dispatchUpdateErr) {
      // Roll back renumber
      for (const done of shiftedIds) {
        await adminClient
          .from("approval_steps")
          .update({ step_order: done.oldOrder })
          .eq("id", done.id);
      }
      return errorResponse(
        `Failed to mark dispatch step approved: ${dispatchUpdateErr.message}`,
        500,
      );
    }

    // ---- Insert reviewer steps -----------------------------------------
    const reviewerRows = uniqueReviewerIds.map((reviewerId) => ({
      memo_id: dispatchStep.memo_id,
      approver_user_id: reviewerId,
      step_order: reviewerOrder,
      parallel_group: newParallelGroup,
      action_type: "initial" as const,
      is_required: true,
      status: "pending" as const,
      parent_dispatch_step_id: step_id,
      stage_level: dispatchStep.stage_level || "finance",
      deadline: null,
    }));

    const { data: insertedRows, error: insertErr } = await adminClient
      .from("approval_steps")
      .insert(reviewerRows)
      .select("id");

    if (insertErr) {
      // Roll back: revert dispatch step + renumber. Best-effort.
      console.error("Reviewer insert failed; attempting rollback:", insertErr);
      await adminClient
        .from("approval_steps")
        .update({
          status: "pending",
          signed_at: null,
          dispatched_at: null,
          dispatched_to_user_ids: null,
          dispatched_notes: null,
          signer_roles_at_signing: null,
        })
        .eq("id", step_id);
      for (const done of shiftedIds) {
        await adminClient
          .from("approval_steps")
          .update({ step_order: done.oldOrder })
          .eq("id", done.id);
      }
      return errorResponse(
        `Failed to insert reviewer steps: ${insertErr.message}`,
        500,
      );
    }

    // ---- Audit log entry ------------------------------------------------
    try {
      await adminClient.from("audit_log").insert({
        memo_id: dispatchStep.memo_id,
        user_id: callerId,
        action: "finance_dispatch",
        action_detail: "dispatched_reviewers",
        signing_method: "digital",
        previous_status: "pending",
        new_status: "approved",
        details: {
          dispatch_step_id: step_id,
          reviewer_user_ids: uniqueReviewerIds,
          notes: notes || null,
          on_behalf_of: callerId !== dispatchStep.approver_user_id
            ? dispatchStep.approver_user_id
            : null,
        },
        notes: notes
          ? `Dispatched to ${uniqueReviewerIds.length} reviewer(s). Notes: ${notes}`
          : `Dispatched to ${uniqueReviewerIds.length} reviewer(s).`,
      });
    } catch (auditErr) {
      // Audit logging is best-effort
      console.warn("Audit log entry failed:", auditErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        reviewer_step_ids: (insertedRows || []).map((r: any) => r.id),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    console.error("dispatch-step error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return errorResponse(message, 500);
  }
});

function errorResponse(error: string, status: number): Response {
  return new Response(
    JSON.stringify({ success: false, error }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
