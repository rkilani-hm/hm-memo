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

    const { memo_id, workflow_template_id, custom_steps } = await req.json();
    if (!memo_id) {
      return new Response(JSON.stringify({ error: "memo_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the memo
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

    if (memo.from_user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not authorized for this memo" }), {
        status: 403,
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

    // Create approval steps with action_type, parallel_group, is_required, deadline
    const approvalSteps = steps.map((step, index) => ({
      memo_id,
      approver_user_id: step.approver_user_id,
      step_order: index + 1,
      status: "pending" as const,
      action_type: step.action_type || "signature",
      parallel_group: step.parallel_group ?? null,
      is_required: step.is_required !== false,
      deadline: step.deadline || null,
    }));

    const { error: stepsErr } = await adminClient
      .from("approval_steps")
      .insert(approvalSteps);
    if (stepsErr) throw stepsErr;

    // Update memo status
    await adminClient
      .from("memos")
      .update({ status: "in_review", current_step: 1 })
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
      review: "review (comments requested)",
      acknowledge: "acknowledgement",
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

    // Resolve IP geolocation (non-blocking)
    const geo = await resolveIpGeolocation(clientIp);

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
