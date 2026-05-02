import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { brandedEmailShell, memoFactsTable } from "../_shared/email-brand.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const appUrl = Deno.env.get("APP_URL") || "https://hm-memo.lovable.app";

    // Get all pending approval steps
    const { data: pendingSteps, error: stepsErr } = await adminClient
      .from("approval_steps")
      .select("id, memo_id, approver_user_id, step_order, deadline, created_at, action_type")
      .eq("status", "pending");

    if (stepsErr) throw stepsErr;
    if (!pendingSteps || pendingSteps.length === 0) {
      return new Response(JSON.stringify({ reminders_sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get SLA settings
    const { data: slaRow } = await adminClient
      .from("kpi_sla_settings")
      .select("sla_hours")
      .limit(1)
      .maybeSingle();
    const slaHours = (slaRow as any)?.sla_hours ?? 48;
    const slaMs = slaHours * 60 * 60 * 1000;

    const now = new Date();

    // Filter to steps that are past SLA or past deadline
    const overdueSteps = pendingSteps.filter((step) => {
      if (step.deadline && new Date(step.deadline) < now) return true;
      if (now.getTime() - new Date(step.created_at).getTime() > slaMs) return true;
      return false;
    });

    if (overdueSteps.length === 0) {
      return new Response(JSON.stringify({ reminders_sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by approver for consolidated reminders
    const approverGroups = new Map<string, typeof overdueSteps>();
    for (const step of overdueSteps) {
      const arr = approverGroups.get(step.approver_user_id) || [];
      arr.push(step);
      approverGroups.set(step.approver_user_id, arr);
    }

    let remindersSent = 0;

    for (const [approverId, steps] of approverGroups) {
      // Get approver profile
      const { data: approver } = await adminClient
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", approverId)
        .single();

      if (!approver?.email) continue;

      // Get memo details for all steps
      const memoIds = [...new Set(steps.map(s => s.memo_id))];
      const { data: memos } = await adminClient
        .from("memos")
        .select("id, subject, transmittal_no, from_user_id, status, created_at")
        .in("id", memoIds);

      const activeMemos = (memos || []).filter(m => m.status === "in_review" || m.status === "submitted");
      if (activeMemos.length === 0) continue;

      // Build memo table rows
      const memoRows = await Promise.all(activeMemos.map(async (memo) => {
        const { data: sender } = await adminClient
          .from("profiles")
          .select("full_name")
          .eq("user_id", memo.from_user_id)
          .single();

        const daysPending = Math.floor(
          (now.getTime() - new Date(memo.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        return `<tr>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${memo.transmittal_no}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${memo.subject}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${sender?.full_name || "Unknown"}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${daysPending}d</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;"><a href="${appUrl}/memos/${memo.id}" style="color: #1B3A5C; text-decoration: underline;">View</a></td>
        </tr>`;
      }));

      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1B3A5C; padding: 20px; text-align: center;">
            <h2 style="color: #C8952E; margin: 0;">Al Hamra Real Estate</h2>
            <p style="color: #ffffff; margin: 4px 0 0; font-size: 12px;">Internal Memo System — Daily Reminder</p>
          </div>
          <div style="padding: 24px; background: #ffffff; border: 1px solid #e5e7eb;">
            <p>Dear <strong>${approver.full_name}</strong>,</p>
            <p>You have <strong>${activeMemos.length} memo(s)</strong> pending your approval:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
              <tr style="background: #f3f4f6;">
                <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Memo No</th>
                <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Subject</th>
                <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">From</th>
                <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">Waiting</th>
                <th style="padding: 8px; border: 1px solid #e5e7eb;">Link</th>
              </tr>
              ${memoRows.join("")}
            </table>
            <a href="${appUrl}/approvals" style="display: inline-block; background: #C8952E; color: #ffffff; padding: 10px 24px; text-decoration: none; border-radius: 4px; margin-top: 8px;">Review Pending Memos</a>
          </div>
          <div style="padding: 12px; text-align: center; font-size: 11px; color: #6b7280;">
            This is an automated daily reminder from the Al Hamra Memo System.
          </div>
        </div>
      `;

      // Send email
      try {
        const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: [approver.email],
            subject: `[Daily Reminder] ${activeMemos.length} Pending Approval(s) Awaiting Your Action`,
            body: emailBody,
            isHtml: true,
          }),
        });

        if (!emailRes.ok) {
          console.warn("Reminder email failed:", await emailRes.text());
        }
      } catch (emailErr) {
        console.warn("Reminder email error:", emailErr);
      }

      // In-app notification (consolidated)
      const memoList = activeMemos.map(m => m.transmittal_no).join(", ");
      await adminClient.from("notifications").insert({
        user_id: approverId,
        memo_id: activeMemos[0].id,
        type: "approval_reminder",
        message: `Daily Reminder: You have ${activeMemos.length} memo(s) pending your approval: ${memoList}. Please review them at your earliest convenience.`,
      });

      // Log the reminder
      await adminClient.from("reminders_log").insert({
        approver_user_id: approverId,
        memo_ids: activeMemos.map(m => m.id),
        delivery_method: "email_and_in_app",
      });

      remindersSent++;
    }

    return new Response(
      JSON.stringify({ reminders_sent: remindersSent, overdue_count: overdueSteps.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("reminder-overdue-approvals error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
