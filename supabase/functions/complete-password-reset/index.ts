// =====================================================================
// complete-password-reset
// =====================================================================
//
// Step 3 of the OTP-based password reset flow. Takes { email, nonce,
// new_password }, validates the nonce against a row issued by step 2,
// and uses the Supabase admin API to set the user's new password.
//
// Why nonce instead of just trusting the email?
// =============================================
// Without a nonce, anyone who knew an email could call this function
// and set a new password — there'd be no proof the caller had access
// to the email. The nonce is issued only after the OTP code has been
// verified (which proves email access). The nonce is single-use and
// short-lived.
//
// Why not just sign the user in here automatically?
// =================================================
// We deliberately leave the user signed-out and redirect them to the
// login page. Standard enterprise pattern: the user types their new
// password TWICE (once here, once on login) which catches typos and
// confirms their memory. Auto-login skips that confirmation.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 1024;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return jsonError("Server not configured", 500);
    }

    const body = await req.json().catch(() => ({}));
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const nonce = typeof body?.nonce === "string" ? body.nonce : "";
    const newPassword =
      typeof body?.new_password === "string" ? body.new_password : "";

    if (!email || !nonce) {
      return jsonOk({ ok: false, reason: "invalid_nonce" });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return jsonOk({
        ok: false,
        reason: "password_too_short",
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      return jsonOk({ ok: false, reason: "password_too_long" });
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ---- Validate nonce ---------------------------------------------
    // Look up the row that issued this nonce. Must be:
    //   - matching nonce
    //   - matching email (defense in depth — even if the nonce leaks,
    //     it can only be used with the correct email)
    //   - not yet used (nonce_consumed_at IS NULL)
    //   - not expired
    //   - have a real user_id (we only emailed codes to real users,
    //     so a non-null user_id confirms this row is for an actual
    //     account)
    const nowIso = new Date().toISOString();
    const { data: row } = await adminClient
      .from("password_reset_codes")
      .select("id, user_id, email, nonce_expires_at, nonce_consumed_at")
      .eq("nonce", nonce)
      .eq("email", email)
      .is("nonce_consumed_at", null)
      .maybeSingle();

    if (!row || !(row as any).user_id) {
      console.warn("complete-password-reset: nonce not found or no user", { email });
      return jsonOk({ ok: false, reason: "invalid_nonce" });
    }
    if (
      (row as any).nonce_expires_at &&
      (row as any).nonce_expires_at < nowIso
    ) {
      console.warn("complete-password-reset: nonce expired", { email });
      return jsonOk({ ok: false, reason: "nonce_expired" });
    }

    // ---- Update the password via admin API --------------------------
    const userId = (row as any).user_id as string;
    const { error: updErr } = await adminClient.auth.admin.updateUserById(
      userId,
      { password: newPassword },
    );
    if (updErr) {
      console.error("complete-password-reset admin update error:", updErr);
      // Common cause: password fails Supabase's strength rules
      // (too common, on a leaked-password list, etc.). Bubble the
      // message up so the user sees what's wrong.
      return jsonOk({
        ok: false,
        reason: "password_rejected",
        message: updErr.message || "Could not set the new password.",
      });
    }

    // ---- Mark nonce consumed ----------------------------------------
    await adminClient
      .from("password_reset_codes")
      .update({ nonce_consumed_at: nowIso })
      .eq("id", (row as any).id);

    // ---- Audit log entry --------------------------------------------
    // Best-effort — record that a password was changed via OTP reset.
    // If this fails for any reason, we don't want to roll back the
    // password change.
    try {
      await adminClient.from("audit_log").insert({
        action: "password_reset_completed",
        user_id: userId,
        action_detail: `Reset via OTP code for ${email}`,
        metadata: { method: "otp_code", email },
      });
    } catch (e: any) {
      console.error("complete-password-reset audit log error:", e?.message);
    }

    return jsonOk({ ok: true });
  } catch (e: any) {
    console.error("complete-password-reset error:", e);
    return jsonError(e?.message || "Unknown error", 500);
  }
});

function jsonOk(data: any): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
