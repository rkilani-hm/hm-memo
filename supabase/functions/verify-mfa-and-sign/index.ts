// verify-mfa-and-sign
//
// Phase 2 of the fraud-prevention work: step-up MFA via Microsoft Authenticator
// (Entra ID / Azure AD) before a payment-memo approval signature is applied.
//
// Flow:
//   1. Frontend acquires a fresh id_token via MSAL.js with claims that force
//      MFA (acr=c1 / authentication_strength). User taps approve in MS
//      Authenticator on their phone.
//   2. Frontend POSTs { id_token, memo_id, step_id, ... } to this function.
//   3. This function:
//        - Validates the id_token JWT signature against Microsoft's public keys
//        - Checks `aud`, `iss`, `tid`, `amr` (must contain "mfa"), `auth_time`
//          freshness (≤ 5 minutes), and that `oid` maps to the same user as
//          the approval step's approver_user_id (via profiles.azure_ad_oid).
//        - Records mfa_* columns on the approval_steps row.
//        - Defends replay using `jti`.
//
// Required runtime secrets (set in Supabase project):
//   AZURE_TENANT_ID    e.g. "contoso.onmicrosoft.com" or a GUID
//   AZURE_CLIENT_ID    the App Registration's Application (client) ID
//
// (These can also be sourced from the `fraud_settings` table — useful when
// tenant/client values are configured in the admin UI rather than via env.)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  buildSupabase,
  authenticateUser,
} from "../_shared/edge-utils.ts";

const MS_DISCOVERY = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/v2.0/.well-known/openid-configuration`;

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  use?: string;
  alg?: string;
}

let JWKS_CACHE: { tenant: string; keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1h

async function getMsKeys(tenant: string): Promise<Jwk[]> {
  if (JWKS_CACHE && JWKS_CACHE.tenant === tenant && Date.now() - JWKS_CACHE.fetchedAt < JWKS_TTL_MS) {
    return JWKS_CACHE.keys;
  }
  const discoveryRes = await fetch(MS_DISCOVERY(tenant));
  if (!discoveryRes.ok) throw new Error(`OIDC discovery failed (${discoveryRes.status})`);
  const discovery = await discoveryRes.json();
  const jwksRes = await fetch(discovery.jwks_uri);
  if (!jwksRes.ok) throw new Error(`JWKS fetch failed (${jwksRes.status})`);
  const jwks = await jwksRes.json();
  JWKS_CACHE = { tenant, keys: jwks.keys || [], fetchedAt: Date.now() };
  return JWKS_CACHE.keys;
}

function base64UrlDecode(input: string): Uint8Array {
  const pad = (s: string) => s + "===".slice((s.length + 3) % 4);
  const b64 = pad(input).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64UrlDecodeText(input: string): string {
  return new TextDecoder().decode(base64UrlDecode(input));
}

async function jwkToCryptoKey(jwk: Jwk): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "jwk",
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: jwk.alg || "RS256",
      ext: true,
    },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

interface VerifiedToken {
  header: any;
  payload: any;
}

async function verifyJwt(token: string, tenantId: string): Promise<VerifiedToken> {
  const [hPart, pPart, sPart] = token.split(".");
  if (!hPart || !pPart || !sPart) throw new Error("Malformed JWT");

  const header = JSON.parse(base64UrlDecodeText(hPart));
  const payload = JSON.parse(base64UrlDecodeText(pPart));
  if (header.alg !== "RS256") throw new Error(`Unsupported alg: ${header.alg}`);

  const keys = await getMsKeys(tenantId);
  const key = keys.find((k) => k.kid === header.kid);
  if (!key) throw new Error(`Signing key kid=${header.kid} not found in JWKS`);

  const cryptoKey = await jwkToCryptoKey(key);
  const data = new TextEncoder().encode(`${hPart}.${pPart}`);
  const sig = base64UrlDecode(sPart);

  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    sig,
    data,
  );
  if (!ok) throw new Error("Signature verification failed");
  return { header, payload };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { service: supabase, anon } = buildSupabase();
    const user = await authenticateUser(req, anon);

    const body = await req.json();
    const { id_token, memo_id, step_id } = body;
    if (!id_token) throw new Error("id_token is required");
    if (!memo_id) throw new Error("memo_id is required");
    if (!step_id) throw new Error("step_id is required");

    // Pull settings (tenant/client + policy)
    const { data: settings } = await supabase
      .from("fraud_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    const tenantId = Deno.env.get("AZURE_TENANT_ID") || settings?.azure_tenant_id;
    const clientId = Deno.env.get("AZURE_CLIENT_ID") || settings?.azure_client_id;
    if (!tenantId || !clientId) {
      throw new Error("Microsoft Entra ID is not configured (AZURE_TENANT_ID/AZURE_CLIENT_ID)");
    }

    const { header, payload } = await verifyJwt(id_token, tenantId);

    // ---- Standard JWT claim checks ----------------------------------------
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) throw new Error("Token expired");
    if (typeof payload.nbf === "number" && payload.nbf > now + 60) throw new Error("Token not yet valid");
    if (typeof payload.iat === "number" && payload.iat > now + 60) throw new Error("Token issued in the future");

    // aud must equal our client id
    if (payload.aud !== clientId) {
      throw new Error(`Audience mismatch: expected ${clientId}, got ${payload.aud}`);
    }

    // iss must be Microsoft's issuer for this tenant
    const expectedIssuers = [
      `https://login.microsoftonline.com/${tenantId}/v2.0`,
      `https://sts.windows.net/${tenantId}/`,
    ];
    if (!expectedIssuers.includes(payload.iss)) {
      // tid may be a GUID even when tenantId in URL is a domain
      if (!payload.tid || !expectedIssuers.some((i) => i.includes(payload.tid))) {
        throw new Error(`Issuer mismatch: ${payload.iss}`);
      }
    }

    // ---- MFA proof: amr must contain "mfa" --------------------------------
    const amr: string[] = Array.isArray(payload.amr) ? payload.amr : [];
    if (!amr.includes("mfa")) {
      throw new Error("Token does not assert MFA was performed (amr does not contain 'mfa')");
    }

    // ---- Freshness: auth_time within 5 minutes ---------------------------
    const FIVE_MIN = 5 * 60;
    const authTime = typeof payload.auth_time === "number" ? payload.auth_time : null;
    if (!authTime) throw new Error("Token missing auth_time claim");
    if (now - authTime > FIVE_MIN) {
      throw new Error("MFA proof is stale; please re-authenticate before approving");
    }

    // ---- Replay defence: jti not previously used --------------------------
    const jti: string | undefined = payload.jti;
    if (jti) {
      const { data: replayHit } = await supabase
        .from("approval_steps")
        .select("id")
        .eq("mfa_token_jti", jti)
        .limit(1)
        .maybeSingle();
      if (replayHit) throw new Error("MFA token has already been used (replay)");
    }

    // ---- Identity binding: oid must match approver's azure_ad_oid --------
    const oid: string | undefined = payload.oid;
    if (!oid) throw new Error("Token missing oid claim");

    // Fetch the approval step and verify it belongs to the calling user and is pending
    const { data: step, error: stepErr } = await supabase
      .from("approval_steps")
      .select("id, memo_id, approver_user_id, status")
      .eq("id", step_id)
      .single();
    if (stepErr || !step) throw new Error("Approval step not found");
    if (step.memo_id !== memo_id) throw new Error("Memo / step mismatch");
    if (step.approver_user_id !== user.id) throw new Error("This step is not assigned to you");
    if (step.status !== "pending") throw new Error(`Step is not pending (status=${step.status})`);

    // Verify the approver's Supabase identity is linked to this Azure oid
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("user_id, azure_ad_oid, azure_ad_upn, full_name")
      .eq("user_id", user.id)
      .single();
    if (profErr || !profile) throw new Error("Approver profile not found");

    if (!profile.azure_ad_oid) {
      // First-time link: bind oid+upn now (still safe — we already validated the token)
      await supabase
        .from("profiles")
        .update({
          azure_ad_oid: oid,
          azure_ad_upn: payload.preferred_username || payload.upn || null,
        })
        .eq("user_id", user.id);
    } else if (profile.azure_ad_oid !== oid) {
      throw new Error("Microsoft account does not match the approver's linked identity");
    }

    // ---- Record the proof on the step ------------------------------------
    const { error: updErr } = await supabase
      .from("approval_steps")
      .update({
        mfa_verified: true,
        mfa_verified_at: new Date().toISOString(),
        mfa_method: amr.includes("rsa") ? "rsa_token" : amr.includes("fido") ? "fido2" : "microsoft_authenticator",
        mfa_provider: "azure_ad",
        mfa_token_jti: jti || null,
        mfa_auth_time: new Date(authTime * 1000).toISOString(),
      })
      .eq("id", step_id);
    if (updErr) throw new Error(`Failed to persist MFA proof: ${updErr.message}`);

    // Audit-log the event
    await supabase.from("audit_log").insert({
      user_id: user.id,
      action: "mfa_verified_for_approval",
      resource_type: "approval_step",
      resource_id: step_id,
      metadata: {
        memo_id,
        amr,
        auth_time: authTime,
        upn: payload.preferred_username || payload.upn || null,
      } as any,
    } as any).then(() => {}).catch((e) => console.error("audit log failed:", e));

    return new Response(
      JSON.stringify({
        ok: true,
        verified_at: new Date().toISOString(),
        method: amr.includes("fido") ? "fido2" : "microsoft_authenticator",
        upn: payload.preferred_username || payload.upn,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("verify-mfa-and-sign error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
