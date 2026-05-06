// =====================================================================
// verify-password
// =====================================================================
//
// Verifies the caller's password without creating a fresh session on
// the client. Used by the approval-signing dialog where we need to
// re-confirm the user's identity at the moment of signing, but we
// DON'T want to swap out their existing session token.
//
// Why this exists
// ===============
// The previous client-side approach was:
//   await supabase.auth.signInWithPassword({ email, password })
// That call has two side effects we don't want:
//   1. Creates a fresh session, replacing the user's current JWT.
//      If their existing JWT had MFA-claims or other context, those
//      may be lost.
//   2. Counts against rate limits per email/IP. A user who logs in,
//      navigates to a memo, and then signs three approvals in a row
//      can trip the rate limit and start getting "invalid credentials"
//      errors even with the correct password — looks like a wrong-
//      password bug to the user. This was the actual symptom that
//      caused this function to exist.
//
// What this does instead
// ======================
//   1. Authenticates the caller via their existing JWT (the
//      Authorization header on this function call). This identifies
//      who's verifying their password and pulls their current
//      auth.users.email — the source of truth, not the profiles
//      cache.
//   2. Makes a SERVER-SIDE signInWithPassword call against Supabase
//      Auth using the user's actual email and the password they
//      submitted. Server-side calls have different rate-limit pools
//      from client-side ones, so this doesn't conflict with their
//      ongoing session.
//   3. If the server-side call returns a session, the password is
//      correct — we discard the session immediately (signOut) and
//      return { ok: true }. If it returns an error, we return the
//      error category so the frontend can render a useful message.
//
// Security notes
// ==============
//   - The password never lives anywhere persistent — it's only in
//     the request body, used once, then discarded.
//   - We never log the password.
//   - We do log the failure category (wrong_password vs rate_limited
//     vs disabled vs unknown) at the server side for diagnostics.
//   - The function refuses unauthenticated calls — only an already-
//     logged-in user can verify their own password via this path.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return jsonError("Server not configured", 500);
    }

    const { password } = await req.json();
    if (typeof password !== "string" || password.length === 0) {
      return jsonError("password is required", 400);
    }
    if (password.length > 1024) {
      // Defensive — Supabase's auth API has its own limits but we
      // don't want unbounded payloads either.
      return jsonError("password too long", 400);
    }

    // 1. Identify caller via their existing JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError("Authentication required", 401);
    const token = authHeader.replace(/^Bearer\s+/i, "");

    // Use the SERVICE-ROLE client to read auth.users (bypasses RLS).
    // This is the source of truth for the user's email — profiles
    // table can drift if it wasn't updated when the email changed
    // in auth.users.
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user: authUser },
      error: getUserErr,
    } = await adminClient.auth.getUser(token);
    if (getUserErr || !authUser?.email) {
      return jsonError("Could not identify caller", 401);
    }

    // 2. Server-side signInWithPassword via the ANON client. Each
    // request creates an isolated client, so the session it produces
    // doesn't persist past this function call. Different rate-limit
    // bucket from the user's browser-side calls.
    const verifyClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: signInData, error: signInErr } =
      await verifyClient.auth.signInWithPassword({
        email: authUser.email,
        password,
      });

    if (signInErr || !signInData?.session) {
      // Categorise the error so the frontend can show useful copy.
      // Supabase's error.code / status / message vary slightly across
      // versions. We do our best to bucket it.
      const status = (signInErr as any)?.status;
      const code = (signInErr as any)?.code;
      const msg = signInErr?.message || "";
      let category = "unknown";
      if (status === 400 || /invalid login credentials/i.test(msg)) {
        category = "wrong_password";
      } else if (status === 429 || /too many requests|rate/i.test(msg)) {
        category = "rate_limited";
      } else if (/email not confirmed/i.test(msg)) {
        category = "email_not_confirmed";
      } else if (/user.*disabled|banned/i.test(msg)) {
        category = "user_disabled";
      }
      console.warn("verify-password failed:", {
        userId: authUser.id,
        email: authUser.email,
        status,
        code,
        message: msg,
        category,
      });
      return jsonOk({ ok: false, category, message: msg });
    }

    // 3. Discard the temporary session immediately. Best-effort;
    // even without an explicit signOut, the verifyClient instance
    // is short-lived and the session won't persist past this
    // function's lifetime. signOut also revokes the refresh token
    // server-side which is the cleaner outcome.
    try {
      await verifyClient.auth.signOut();
    } catch {
      // ignore — non-blocking
    }

    return jsonOk({ ok: true });
  } catch (e: any) {
    console.error("verify-password error:", e);
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
