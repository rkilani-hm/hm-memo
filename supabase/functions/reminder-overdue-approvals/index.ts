import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Find pending approval steps that are overdue (past deadline) or pending > 2 days
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    // Get pending steps with memo + approver info
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

    // Filter to overdue steps: past deadline OR pending > 2 days
    const now = new Date();
    const overdueSteps = pendingSteps.filter((step) => {
      if (step.deadline && new Date(step.deadline) < now) return true;
      if (new Date(step.created_at) < new Date(twoDaysAgo)) return true;
      return false;
    });

    if (overdueSteps.length === 0) {
      return new Response(JSON.stringify({ reminders_sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let remindersSent = 0;
    const appUrl = Deno.env.get("APP_URL") || "https://hm-memo.lovable.app";

    for (const step of overdueSteps) {
      // Get memo details
      const { data: memo } = await adminClient
        .from("memos")
        .select("subject, transmittal_no, from_user_id, status")
        .eq("id", step.memo_id)
        .single();

      if (!memo || memo.status !== "in_review") continue;

      // Get approver profile
      const { data: approver } = await adminClient
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", step.approver_user_id)
        .single();

      if (!approver?.email) continue;

      // Get sender name
      const { data: sender } = await adminClient
        .from("profiles")
        .select("full_name")
        .eq("user_id", memo.from_user_id)
        .single();

      // Calculate days pending
      const daysPending = Math.floor(
        (now.getTime() - new Date(step.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      const isOverdueDeadline = step.deadline && new Date(step.deadline) < now;
      const urgencyNote = isOverdueDeadline
        ? `<p style="color: #dc2626; font-weight: bold;">⚠️ This approval is past its deadline.</p>`
        : "";

      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1B3A5C; padding: 20px; text-align: center;">
            <h2 style="color: #C8952E; margin: 0;">Al Hamra Real Estate</h2>
            <p style="color: #ffffff; margin: 4px 0 0; font-size: 12px;">Internal Memo System — Reminder</p>
          </div>
          <div style="padding: 24px; background: #ffffff; border: 1px solid #e5e7eb;">
            <p>Dear <strong>${approver.full_name}</strong>,</p>
            <p>This is a reminder that the following memo has been pending your approval for <strong>${daysPending} day(s)</strong>:</p>
            ${urgencyNote}
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold; width: 140px;">Transmittal No</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${memo.transmittal_no}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Subject</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${memo.subject}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">From</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${sender?.full_name || "Unknown"}</td></tr>
            </table>
            <a href="${appUrl}/memos/${step.memo_id}" style="display: inline-block; background: #C8952E; color: #ffffff; padding: 10px 24px; text-decoration: none; border-radius: 4px; margin-top: 8px;">Review Now</a>
          </div>
          <div style="padding: 12px; text-align: center; font-size: 11px; color: #6b7280;">
            This is an automated reminder from the Al Hamra Memo System.
          </div>
        </div>
      `;

      // Send email via send-email function
      try {
        const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: [approver.email],
            subject: `[Reminder] Pending Approval (${daysPending}d): ${memo.transmittal_no} — ${memo.subject}`,
            body: emailBody,
            isHtml: true,
          }),
        });

        if (emailRes.ok) {
          remindersSent++;

          // Also create in-app notification
          await adminClient.from("notifications").insert({
            user_id: step.approver_user_id,
            memo_id: step.memo_id,
            type: "approval_reminder",
            message: `Reminder: Memo ${memo.transmittal_no} — "${memo.subject}" has been pending your approval for ${daysPending} day(s).`,
          });
        } else {
          console.warn("Reminder email failed:", await emailRes.text());
        }
      } catch (emailErr) {
        console.warn("Reminder email error:", emailErr);
      }
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
