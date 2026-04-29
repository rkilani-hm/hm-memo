import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WorkflowStep {
  approver_user_id: string;
  label: string;
  action_type?: string;
  is_required?: boolean;
  parallel_group?: number | null;
  deadline?: string | null;
  stage_level?: string | null;
  // Finance-dispatch templates: when is_dispatcher is true the step's
  // approver_user_id is resolved at submit time from the role specified
  // in dispatcher_pool_role (typically 'finance_dispatcher'). Honors
  // active time-bounded delegations via the
  // effective_finance_dispatcher() RPC.
  is_dispatcher?: boolean;
  dispatcher_pool_role?: string;
  // Tag identifying which finance route this step belongs to
  // ('AP' | 'AR' | 'Budget'). Used by the dispatch UI to pre-suggest
  // reviewers and by reporting.
  route_tag?: string;
}

// Resolve IP to city/country via ip-api.com (non-blocking, best-effort)
async function resolveIpGeolocation(ip: string): Promise<{ city: string | null; country: string | null }> {
  if (!ip || ip === "unknown") return { city: null, country: null };
  try {
    const cleanIp = ip.split(",")[0].trim(); // take first IP if multiple (x-forwarded-for)
    if (cleanIp === "127.0.0.1" || cleanIp === "::1" || cleanIp.startsWith("10.") || cleanIp.startsWith("192.168.")) {
      return { city: "Internal Network", country: "Internal" };
    }
    const res = await fetch(`http://ip-api.com/json/${cleanIp}?fields=status,city,country`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { city: null, country: null };
    const data = await res.json();
    if (data.status === "success") {
      return { city: data.city || null, country: data.country || null };
    }
    return { city: null, country: null };
  } catch {
    console.warn("IP geolocation lookup failed for:", ip);
    return { city: null, country: null };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract client IP from request headers
    const clientIp = req.headers.get("x-forwarded-for")
      || req.headers.get("cf-connecting-ip")
      || req.headers.get("x-real-ip")
      || "unknown";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { memo_id, workflow_template_id, custom_steps, pdf_layout } = await req.json();
    if (!memo_id) {
      return new Response(JSON.stringify({ error: "memo_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify access via user's RLS permissions (not just owner check)
    const { data: memoAccess, error: accessErr } = await userClient
      .from("memos")
      .select("id")
      .eq("id", memo_id)
      .maybeSingle();

    if (accessErr || !memoAccess) {
      return new Response(JSON.stringify({ error: "Not authorized for this memo" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch full memo data with admin client
    const { data: memo, error: memoErr } = await adminClient
      .from("memos")
      .select("*")
      .eq("id", memo_id)
      .single();
    if (memoErr || !memo) {
      return new Response(JSON.stringify({ error: "Memo not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let steps: WorkflowStep[] = [];
    let workflowSource = "none";
    let workflow: any = null;

    // Priority 1: Custom dynamic steps from the client
    if (custom_steps && Array.isArray(custom_steps) && custom_steps.length > 0) {
      steps = custom_steps;
      workflowSource = "dynamic";

      // Create an ad-hoc workflow template to persist the dynamic layout
      const { data: dynTemplate } = await adminClient
        .from("workflow_templates")
        .insert({
          name: `Dynamic — ${memo.transmittal_no}`,
          department_id: memo.department_id,
          steps: steps as any,
          pdf_layout: pdf_layout || { grid: [[null,null,null],[null,null,null]], signoff_step: null },
          is_default: false,
        })
        .select("id")
        .single();
      if (dynTemplate) {
        workflow = { id: dynTemplate.id, name: `Dynamic — ${memo.transmittal_no}` };
      }
    } else {
      // Priority 2: Specified template
      if (workflow_template_id) {
        const { data } = await adminClient
          .from("workflow_templates")
          .select("*")
          .eq("id", workflow_template_id)
          .maybeSingle();
        workflow = data;
      }

      // Priority 3: Auto-match
      if (!workflow) {
        const memoTypes: string[] = memo.memo_types || [];
        if (memoTypes.length > 0) {
          const { data } = await adminClient
            .from("workflow_templates")
            .select("*")
            .eq("department_id", memo.department_id)
            .eq("memo_type", memoTypes[0])
            .limit(1)
            .maybeSingle();
          workflow = data;
        }
        if (!workflow) {
          const { data } = await adminClient
            .from("workflow_templates")
            .select("*")
            .eq("department_id", memo.department_id)
            .eq("is_default", true)
            .limit(1)
            .maybeSingle();
          workflow = data;
        }
        if (!workflow) {
          const { data } = await adminClient
            .from("workflow_templates")
            .select("*")
            .eq("is_default", true)
            .is("department_id", null)
            .limit(1)
            .maybeSingle();
          workflow = data;
        }
      }

      steps = (workflow?.steps as WorkflowStep[]) || [];
      workflowSource = workflow ? "template" : "none";
    }

    if (steps.length === 0) {
      await adminClient
        .from("memos")
        .update({ status: "submitted", current_step: 0 })
        .eq("id", memo_id);

      return new Response(
        JSON.stringify({ success: true, approval_steps_created: 0, message: "No workflow. Memo submitted without approval steps." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Remove any previous workflow instances (for edit & resubmit)
    await adminClient
      .from("approval_steps")
      .delete()
      .eq("memo_id", memo_id);

    // -------------------------------------------------------------------
    // Role-based dispatcher detection (replaces previous template-flag
    // detection). Any approval step whose approver holds the
    // finance_dispatcher role automatically becomes a dispatch step at
    // runtime. This means free-form workflows (creator picks Mohammed)
    // and admin-saved presets (template includes Mohammed) both trigger
    // dispatch behavior identically — the trigger is the ROLE, not the
    // template.
    //
    // Time-bounded delegation: if Mohammed has an active delegation
    // when the memo is submitted, the dispatch step's approver_user_id
    // is rewritten to point at the delegate so the memo lands in the
    // delegate's queue instead of Mohammed's. After the delegation
    // window ends, NEW memos go back to Mohammed; in-flight memos
    // already routed to the delegate stay there (the delegate's
    // implicit dispatcher rights persist for the specific memos they
    // were entrusted with).
    // -------------------------------------------------------------------

    // Collect distinct approver IDs from all steps (skip template
    // dispatcher placeholder steps that don't yet have an approver
    // assigned — those are LEGACY and will be filtered out by the
    // resolution code below)
    const candidateApproverIds = [
      ...new Set(
        steps
          .map((s) => s.approver_user_id)
          .filter((v): v is string => !!v),
      ),
    ];

    // Find which of these approvers are finance dispatchers
    const dispatcherIds = new Set<string>();
    if (candidateApproverIds.length > 0) {
      const { data: dispatcherRows, error: dispErr } = await adminClient
        .from("user_roles")
        .select("user_id")
        .eq("role", "finance_dispatcher")
        .in("user_id", candidateApproverIds);
      if (dispErr) {
        console.warn("user_roles dispatcher lookup error:", dispErr);
      } else {
        for (const r of dispatcherRows || []) dispatcherIds.add((r as any).user_id);
      }
    }

    // -------------------------------------------------------------------
    // Per-principal delegation lookup
    // -------------------------------------------------------------------
    // CRITICAL FIX (2026-04-29): the previous implementation called
    // effective_finance_dispatcher() ONCE and applied its result to
    // every step that had a dispatcher-role approver. That was wrong
    // for two reasons:
    //
    //   1. effective_finance_dispatcher() returns the FIRST dispatcher
    //      in the table (by created_at). If multiple users hold the
    //      role (intentionally or by accident — e.g. Rami had it
    //      assigned by mistake), every other dispatcher in the chain
    //      got rewritten to that first one. Result: the wrong user
    //      appeared multiple times in the chain, and legitimate
    //      approvers disappeared.
    //
    //   2. Even with only one principal, the rewrite fired regardless
    //      of whether a delegation was actually active. Mohammed's
    //      step would correctly stay as Mohammed (no delegation = no
    //      change), but the rewrite pattern was fragile.
    //
    // New behavior: for each step whose approver holds the
    // finance_dispatcher role, look up delegations specifically for
    // THAT approver (as principal). If an active in-window delegation
    // exists, rewrite to the delegate. Otherwise, leave the step
    // pointing at the original approver.
    //
    // This means:
    //   - Mohammed (real principal, no delegation) → step stays as Mohammed.
    //   - Mohammed (real principal, active delegation to Sara) → step rewrites to Sara.
    //   - Rami (stray role, not a real dispatcher) → no delegation exists for him, step stays as Rami.
    //   - Future second principal with their own delegation → resolved independently of others.

    const delegationByPrincipal = new Map<string, string>(); // principal_id -> delegate_id
    if (dispatcherIds.size > 0) {
      const principalIds = [...dispatcherIds];
      const nowIso = new Date().toISOString();
      const { data: delegations, error: delErr } = await adminClient
        .from("delegate_assignments")
        .select("principal_user_id, delegate_user_id, valid_from, valid_to, is_active, revoked_at")
        .in("principal_user_id", principalIds)
        .eq("scope", "finance_dispatcher")
        .eq("is_active", true)
        .is("revoked_at", null);
      if (delErr) {
        console.warn("delegate_assignments lookup error:", delErr);
      } else {
        for (const d of delegations || []) {
          const row = d as any;
          // Filter for active window in JS (handles null bounds)
          const fromOk = !row.valid_from || row.valid_from <= nowIso;
          const toOk = !row.valid_to || row.valid_to >= nowIso;
          if (fromOk && toOk && !delegationByPrincipal.has(row.principal_user_id)) {
            // First active delegation per principal wins (table-order arbitrary
            // but consistent; ideally only one active delegation per principal exists)
            delegationByPrincipal.set(row.principal_user_id, row.delegate_user_id);
          }
        }
      }
    }

    // -------------------------------------------------------------------
    // Build the final approval_steps rows
    // -------------------------------------------------------------------
    // For each template step:
    //   - If approver holds the finance_dispatcher role:
    //       - mark is_dispatcher = true (so MemoView shows the
    //         "Dispatch Reviewers" button instead of "Approve")
    //       - if there's an active delegation for THIS specific
    //         approver, rewrite approver_user_id to the delegate
    //       - otherwise, leave approver_user_id as is
    //   - Otherwise → standard step, approver untouched.
    //
    // Legacy template handling: steps that were marked is_dispatcher
    // in the template (from the old pre-redesign templates we just
    // deleted) but have no approver_user_id set are skipped silently.
    const approvalSteps = steps
      .filter((s) => !!s.approver_user_id) // skip approverless legacy steps
      .map((step, index) => {
        const approverIsDispatcher = dispatcherIds.has(step.approver_user_id);
        const delegate = approverIsDispatcher
          ? delegationByPrincipal.get(step.approver_user_id) || null
          : null;
        const approverId = delegate || step.approver_user_id;
        return {
          memo_id,
          approver_user_id: approverId,
          step_order: index + 1,
          status: "pending" as const,
          action_type: step.action_type || "signature",
          parallel_group: step.parallel_group ?? null,
          is_required: step.is_required !== false,
          deadline: step.deadline || null,
          stage_level: step.stage_level || null,
          is_dispatcher: approverIsDispatcher,
        };
      });

    if (approvalSteps.length === 0) {
      // All template steps were approverless legacy dispatcher steps
      // and got filtered out. Treat as no-workflow.
      await adminClient
        .from("memos")
        .update({ status: "submitted", current_step: 0 })
        .eq("id", memo_id);
      return new Response(
        JSON.stringify({
          success: true,
          approval_steps_created: 0,
          message: "Workflow has no concrete approvers; memo submitted without approval steps.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: stepsErr } = await adminClient
      .from("approval_steps")
      .insert(approvalSteps);
    if (stepsErr) throw stepsErr;

    // -------------------------------------------------------------------
    // Diagnostic: log any workflow rewrites to audit_log
    // -------------------------------------------------------------------
    // When a step's effective approver differs from what the template
    // originally specified (e.g. delegation kicked in), record a single
    // 'workflow_rewrite' audit_log entry with the before/after diff.
    // Makes future debugging of 'why is this person in the chain?' a
    // 5-second query on audit_log instead of an hour of tracing code.
    //
    // Best-effort: failure to write the audit log doesn't fail the
    // memo submission, just logs a warning.
    try {
      const templateSteps = steps.filter((s) => !!s.approver_user_id);
      const rewrites: Array<{
        step_order: number;
        template_approver_id: string;
        effective_approver_id: string;
        is_dispatcher: boolean;
        reason: string;
      }> = [];

      for (let i = 0; i < approvalSteps.length; i++) {
        const finalRow = approvalSteps[i];
        const templateRow = templateSteps[i];
        if (!templateRow) continue;
        if (finalRow.approver_user_id !== templateRow.approver_user_id) {
          rewrites.push({
            step_order: finalRow.step_order,
            template_approver_id: templateRow.approver_user_id,
            effective_approver_id: finalRow.approver_user_id,
            is_dispatcher: finalRow.is_dispatcher,
            reason: finalRow.is_dispatcher
              ? "Active finance_dispatcher delegation rewrote approver"
              : "Approver rewritten (no known reason — investigate)",
          });
        }
      }

      if (rewrites.length > 0) {
        await adminClient.from("audit_log").insert({
          memo_id,
          user_id: user.id,
          action: "workflow_rewrite",
          action_detail: "submit_memo_rewrite",
          previous_status: "draft",
          new_status: "in_review",
          notes: `submit-memo rewrote ${rewrites.length} step approver(s) at submission time.`,
          details: {
            workflow_template_id: workflow?.id || null,
            workflow_template_name: workflow?.name || null,
            rewrites,
          },
        } as any);
      }
    } catch (auditErr) {
      console.warn("workflow_rewrite audit log failed:", auditErr);
    }

    // Update memo status + store workflow template id
    await adminClient
      .from("memos")
      .update({
        status: "in_review",
        current_step: 1,
        workflow_template_id: workflow?.id || null,
      })
      .eq("id", memo_id);

    // Notify first approver(s) — could be parallel group
    const firstGroup = approvalSteps[0].parallel_group;
    const firstSteps = firstGroup !== null
      ? approvalSteps.filter((s) => s.parallel_group === firstGroup)
      : [approvalSteps[0]];

    const { data: senderProfile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .single();

    const actionTypeLabels: Record<string, string> = {
      signature: "approval (signature required)",
      initial: "endorsement (initials required)",
    };

    for (const firstStep of firstSteps) {
      const { data: approverProfile } = await adminClient
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", firstStep.approver_user_id)
        .single();

      if (approverProfile) {
        const actionLabel = actionTypeLabels[firstStep.action_type] || "approval";

        await adminClient.from("notifications").insert({
          user_id: firstStep.approver_user_id,
          memo_id,
          type: "approval_request",
          message: `Memo ${memo.transmittal_no} — "${memo.subject}" requires your ${actionLabel}.`,
        });

        // Send email
        try {
          const appUrl = Deno.env.get("APP_URL") || "https://hm-memo.lovable.app";
          const emailBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #1B3A5C; padding: 20px; text-align: center;">
                <h2 style="color: #C8952E; margin: 0;">Al Hamra Real Estate</h2>
                <p style="color: #ffffff; margin: 4px 0 0; font-size: 12px;">Internal Memo System</p>
              </div>
              <div style="padding: 24px; background: #ffffff; border: 1px solid #e5e7eb;">
                <p>Dear <strong>${approverProfile.full_name}</strong>,</p>
                <p>A memo requires your <strong>${actionLabel}</strong>:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                  <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold; width: 140px;">Transmittal No</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${memo.transmittal_no}</td></tr>
                  <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Subject</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${memo.subject}</td></tr>
                  <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">From</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${senderProfile?.full_name || "Unknown"}</td></tr>
                  <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Action</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${actionLabel}</td></tr>
                </table>
                <a href="${appUrl}/memos/${memo_id}" style="display: inline-block; background: #1B3A5C; color: #ffffff; padding: 10px 24px; text-decoration: none; border-radius: 4px; margin-top: 8px;">Review Memo</a>
              </div>
              <div style="padding: 12px; text-align: center; font-size: 11px; color: #6b7280;">
                This is an automated notification from the Al Hamra Memo System.
              </div>
            </div>
          `;

          const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: { Authorization: authHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
              to: [approverProfile.email],
              subject: `[Action Required] Memo ${actionLabel}: ${memo.transmittal_no} — ${memo.subject}`,
              body: emailBody,
              isHtml: true,
            }),
          });
          if (!emailRes.ok) console.warn("Email send failed:", await emailRes.text());
        } catch (emailErr) {
          console.warn("Email notification failed (non-blocking):", emailErr);
        }
      }
    }

    // Notify copies_to users via email
    const copiesToUsers: string[] = memo.copies_to || [];
    if (copiesToUsers.length > 0) {
      for (const ccUserId of copiesToUsers) {
        const { data: ccProfile } = await adminClient
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", ccUserId)
          .single();

        if (ccProfile) {
          // In-app notification
          await adminClient.from("notifications").insert({
            user_id: ccUserId,
            memo_id,
            type: "cc_notification",
            message: `You have been copied on memo ${memo.transmittal_no} — "${memo.subject}".`,
          });

          // Email notification
          try {
            const appUrl = Deno.env.get("APP_URL") || "https://hm-memo.lovable.app";
            const ccEmailBody = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #1B3A5C; padding: 20px; text-align: center;">
                  <h2 style="color: #C8952E; margin: 0;">Al Hamra Real Estate</h2>
                  <p style="color: #ffffff; margin: 4px 0 0; font-size: 12px;">Internal Memo System</p>
                </div>
                <div style="padding: 24px; background: #ffffff; border: 1px solid #e5e7eb;">
                  <p>Dear <strong>${ccProfile.full_name}</strong>,</p>
                  <p>You have been copied on the following memo:</p>
                  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                    <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold; width: 140px;">Transmittal No</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${memo.transmittal_no}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Subject</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${memo.subject}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">From</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${senderProfile?.full_name || "Unknown"}</td></tr>
                  </table>
                  <a href="${appUrl}/memos/${memo_id}" style="display: inline-block; background: #1B3A5C; color: #ffffff; padding: 10px 24px; text-decoration: none; border-radius: 4px; margin-top: 8px;">View Memo</a>
                </div>
                <div style="padding: 12px; text-align: center; font-size: 11px; color: #6b7280;">
                  This is an automated notification from the Al Hamra Memo System.
                </div>
              </div>
            `;

            await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: "POST",
              headers: { Authorization: authHeader, "Content-Type": "application/json" },
              body: JSON.stringify({
                to: [ccProfile.email],
                subject: `[CC] Memo ${memo.transmittal_no} — ${memo.subject}`,
                body: ccEmailBody,
                isHtml: true,
              }),
            });
          } catch (emailErr) {
            console.warn("CC email notification failed (non-blocking):", emailErr);
          }
        }
      }
    }

    const geo = await resolveIpGeolocation(clientIp);

    // Notify memo creator: submission confirmation
    await adminClient.from("notifications").insert({
      user_id: user.id,
      memo_id,
      type: "step_update",
      message: `Your memo ${memo.transmittal_no} — "${memo.subject}" has been submitted successfully and is now in the approval workflow (${steps.length} step(s)).`,
    });

    // Audit log with IP + geolocation
    await adminClient.from("audit_log").insert({
      memo_id,
      user_id: user.id,
      action: "workflow_started",
      ip_address: clientIp !== "unknown" ? clientIp.split(",")[0].trim() : null,
      ip_geolocation_city: geo.city,
      ip_geolocation_country: geo.country,
      details: {
        workflow_template_id: workflow?.id || null,
        workflow_source: workflowSource,
        workflow_name: workflow?.name || "Dynamic workflow",
        total_steps: steps.length,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        approval_steps_created: steps.length,
        workflow_source: workflowSource,
        workflow_name: workflow?.name || "Dynamic workflow",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("submit-memo error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
