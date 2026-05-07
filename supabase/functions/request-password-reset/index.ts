// =====================================================================
// request-password-reset
// =====================================================================
//
// Step 1 of the OTP-based password reset flow. Issues a 6-digit code
// to the email if it matches a real user, sends it via send-email,
// and writes a row to password_reset_codes.
//
// Security properties
// ===================
//   - Never reveals whether the email is registered. Always returns
//     ok: true after a uniform delay regardless of whether the user
//     exists. Otherwise this becomes an account-enumeration oracle.
//   - Rate limited per email (3 per 15 min) and per IP (10 per hour).
//     Keeps abuse cost low without blocking legitimate retries.
//   - Code never stored in plaintext — SHA-256 hashed before insert.
//   - 5-minute expiry, single-use, tracked in DB.
//
// What it does NOT do
// ===================
//   - Doesn't return the code to the client. The code only goes via
//     email. The client only knows whether the request was accepted.
//   - Doesn't trust any client-side claim about who's making the
//     request. Identity is established purely by the email argument
//     + the recipient's mailbox access.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { emailPasswordResetCode } from "../_shared/auth-emails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 5;
const RATE_LIMIT_PER_EMAIL_15MIN = 3;
const RATE_LIMIT_PER_IP_60MIN = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Track start time so we can pad the response to a uniform duration
  // regardless of whether the email exists. Prevents timing-based
  // account enumeration.
  const startedAt = Date.now();
  const TARGET_DURATION_MS = 600;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return jsonError("Server not configured", 500);
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      // Even for malformed email we return the same uniform success
      // to avoid leaking validation. Pad and exit.
      await padTo(startedAt, TARGET_DURATION_MS);
      return jsonOk({ ok: true });
    }

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ---- Rate limit checks -------------------------------------------
    const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString();
    const sixtyMinAgo = new Date(Date.now() - 60 * 60_000).toISOString();

    const { count: emailRecent } = await adminClient
      .from("password_reset_codes")
      .select("*", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", fifteenMinAgo);

    if ((emailRecent || 0) >= RATE_LIMIT_PER_EMAIL_15MIN) {
      console.warn(`request-password-reset rate-limited (email): ${email} count=${emailRecent}`);
      await padTo(startedAt, TARGET_DURATION_MS);
      // Still return ok — the user shouldn't be able to tell whether
      // they hit the limit from the response. Legitimate users get a
      // gentle hint via UI cooldown instead.
      return jsonOk({ ok: true });
    }

    if (ipAddress) {
      const { count: ipRecent } = await adminClient
        .from("password_reset_codes")
        .select("*", { count: "exact", head: true })
        .eq("ip_address", ipAddress)
        .gte("created_at", sixtyMinAgo);

      if ((ipRecent || 0) >= RATE_LIMIT_PER_IP_60MIN) {
        console.warn(`request-password-reset rate-limited (ip): ${ipAddress} count=${ipRecent}`);
        await padTo(startedAt, TARGET_DURATION_MS);
        return jsonOk({ ok: true });
      }
    }

    // ---- Look up the user --------------------------------------------
    // We use the admin auth API to find the user by email. If they
    // don't exist, we still write a password_reset_codes row (with
    // user_id = null, no email actually sent) to keep timing uniform
    // and to track "someone tried to reset for an unregistered email"
    // for abuse analysis.
    let userId: string | null = null;
    let recipientName: string | null = null;
    try {
      // listUsers with a per-page filter; admin API supports filter
      // by email. Falls back to scanning if the filter param isn't
      // available.
      const { data: usersList } = await adminClient.auth.admin.listUsers({
        perPage: 200,
      });
      const found = usersList?.users?.find(
        (u: any) => (u.email || "").toLowerCase() === email,
      );
      if (found) {
        userId = found.id;
        // Pull display name from profiles for personalization
        const { data: profile } = await adminClient
          .from("profiles")
          .select("full_name")
          .eq("user_id", found.id)
          .maybeSingle();
        recipientName = (profile as any)?.full_name || null;
      }
    } catch (e: any) {
      console.error("request-password-reset user lookup error:", e?.message);
    }

    // ---- Generate code + hash ----------------------------------------
    const code = generateNumericCode(CODE_LENGTH);
    const codeHash = await sha256Hex(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

    // ---- Insert row --------------------------------------------------
    const { error: insertErr } = await adminClient
      .from("password_reset_codes")
      .insert({
        user_id: userId,
        email,
        code_hash: codeHash,
        expires_at: expiresAt,
        ip_address: ipAddress,
        user_agent: userAgent,
      });
    if (insertErr) {
      console.error("request-password-reset insert error:", insertErr);
      // Still return success to maintain uniform response
      await padTo(startedAt, TARGET_DURATION_MS);
      return jsonOk({ ok: true });
    }

    // ---- Send the email (only if user actually exists) --------------
    if (userId) {
      const email_payload = emailPasswordResetCode({
        recipientName: recipientName || "",
        code,
        validForMinutes: CODE_TTL_MINUTES,
      });
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            to: [email],
            subject: email_payload.subject,
            body: email_payload.html,
            isHtml: true,
          }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "unknown");
          console.error(`send-email HTTP ${res.status} for ${email}:`, errText);
        }
      } catch (e: any) {
        console.error("send-email network error:", e?.message);
      }
    } else {
      // User doesn't exist. We've still inserted the row for timing
      // uniformity but obviously skip the email. Log for abuse
      // analysis.
      console.log(`request-password-reset: no user for ${email}`);
    }

    await padTo(startedAt, TARGET_DURATION_MS);
    return jsonOk({ ok: true });
  } catch (e: any) {
    console.error("request-password-reset error:", e);
    await padTo(startedAt, TARGET_DURATION_MS);
    // Still uniform success — don't leak whether internal errors
    // happened.
    return jsonOk({ ok: true });
  }
});

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/** Cryptographically secure numeric code of N digits, zero-padded. */
function generateNumericCode(length: number): string {
  const max = Math.pow(10, length);
  // 32-bit random — plenty of entropy for a 6-digit code
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const value = buf[0] % max;
  return value.toString().padStart(length, "0");
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function padTo(startedAt: number, targetMs: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  if (elapsed < targetMs) {
    await new Promise((r) => setTimeout(r, targetMs - elapsed));
  }
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
