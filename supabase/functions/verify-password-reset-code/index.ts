// =====================================================================
// verify-password-reset-code
// =====================================================================
//
// Step 2 of the OTP-based password reset flow. Takes { email, code },
// looks up the code's hash, marks it consumed, issues a single-use
// nonce that the client passes to step 3 (complete-password-reset).
//
// Responses
// =========
//   { ok: true, nonce: '...' }       — code matched; client uses
//                                      the nonce to set new password
//   { ok: false, reason: 'invalid' } — wrong code (also used for
//                                      expired and not-found cases
//                                      to avoid distinguishing them)
//   { ok: false, reason: 'locked' }  — too many failed attempts
//
// Brute-force protection
// ======================
// Each row has an attempts counter. After 5 failed verifies on the
// SAME code, the row is invalidated and further verify attempts
// against any code for that email are rejected for 15 minutes.
// Combined with the 5-minute code TTL and the per-email rate limit
// on requesting new codes, brute-forcing a 6-digit code requires
// either compromising email or out-of-band guessing.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ATTEMPTS_PER_CODE = 5;
const LOCKOUT_MINUTES = 15;
const NONCE_TTL_MINUTES = 10;

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
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!email || !code || !/^\d{4,8}$/.test(code)) {
      return jsonOk({ ok: false, reason: "invalid" });
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ---- Lockout check ----------------------------------------------
    // If any recent code for this email reached MAX_ATTEMPTS_PER_CODE
    // failures within the lockout window, refuse all verify attempts
    // for this email.
    const lockoutCutoff = new Date(Date.now() - LOCKOUT_MINUTES * 60_000).toISOString();
    const { count: lockedRecent } = await adminClient
      .from("password_reset_codes")
      .select("*", { count: "exact", head: true })
      .eq("email", email)
      .gte("attempts", MAX_ATTEMPTS_PER_CODE)
      .gte("created_at", lockoutCutoff);

    if ((lockedRecent || 0) > 0) {
      console.warn(`verify-password-reset-code locked for ${email}`);
      return jsonOk({ ok: false, reason: "locked" });
    }

    // ---- Look up matching unconsumed unexpired code -----------------
    const codeHash = await sha256Hex(code);
    const nowIso = new Date().toISOString();
    const { data: rows } = await adminClient
      .from("password_reset_codes")
      .select("id, user_id, code_hash, expires_at, attempts")
      .eq("email", email)
      .is("consumed_at", null)
      .gte("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(5);

    // Find row whose hash matches. We compare in JS rather than via
    // SQL WHERE code_hash = $1 so we can also count failed attempts
    // on the most recent code (the one the user is presumably trying).
    const match = (rows || []).find((r: any) => r.code_hash === codeHash);

    if (!match) {
      // Failed attempt — increment the counter on the most recent
      // unconsumed code so the lockout logic can trip.
      const target = (rows || [])[0];
      if (target) {
        await adminClient
          .from("password_reset_codes")
          .update({ attempts: ((target as any).attempts || 0) + 1 })
          .eq("id", (target as any).id);
      }
      return jsonOk({ ok: false, reason: "invalid" });
    }

    // ---- Issue nonce -------------------------------------------------
    const nonce = generateNonce();
    const nonceExpiresAt = new Date(Date.now() + NONCE_TTL_MINUTES * 60_000).toISOString();

    const { error: updErr } = await adminClient
      .from("password_reset_codes")
      .update({
        consumed_at: nowIso,
        nonce,
        nonce_expires_at: nonceExpiresAt,
      })
      .eq("id", (match as any).id);

    if (updErr) {
      console.error("verify-password-reset-code update error:", updErr);
      return jsonOk({ ok: false, reason: "invalid" });
    }

    return jsonOk({ ok: true, nonce, valid_for_minutes: NONCE_TTL_MINUTES });
  } catch (e: any) {
    console.error("verify-password-reset-code error:", e);
    return jsonOk({ ok: false, reason: "invalid" });
  }
});

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/** 32-byte random nonce, base64url-encoded. ~256 bits of entropy. */
function generateNonce(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return base64urlEncode(buf);
}

function base64urlEncode(buf: Uint8Array): string {
  let binary = "";
  for (const b of buf) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
