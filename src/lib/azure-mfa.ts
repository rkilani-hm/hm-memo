// Microsoft Entra ID (Azure AD) MFA step-up.
//
// Loads tenant/client values from the `fraud_settings` row written by an
// admin in the Fraud & MFA settings page, lazily initialises an MSAL
// PublicClientApplication, and exposes a hook that requests a fresh
// MFA-asserted id_token using `acquireTokenPopup`.
//
// We force a fresh MFA challenge on every approval action by combining:
//   - prompt: 'login' (re-prompt rather than silent SSO)
//   - claims with acr=c1                                      (older policies)
//   - extraQueryParameters.acr_values=urn:microsoft:policies:mfa  (fallback)
//   - max_age = 0  (force re-auth regardless of session cookie)

import { PublicClientApplication, type Configuration, type AuthenticationResult } from '@azure/msal-browser';
import { supabase } from '@/integrations/supabase/client';

interface FraudSettingsRow {
  azure_tenant_id: string | null;
  azure_client_id: string | null;
  azure_authority_url: string | null;
  mfa_required_for_payments: boolean;
  mfa_required_for_high_risk: boolean;
}

let cachedSettings: FraudSettingsRow | null = null;
let cachedPca: PublicClientApplication | null = null;

export async function getFraudSettings(forceReload = false): Promise<FraudSettingsRow | null> {
  if (cachedSettings && !forceReload) return cachedSettings;
  const { data } = await supabase
    .from('fraud_settings' as any)
    .select('azure_tenant_id, azure_client_id, azure_authority_url, mfa_required_for_payments, mfa_required_for_high_risk')
    .eq('id', 1)
    .maybeSingle();
  cachedSettings = (data as any) || null;
  return cachedSettings;
}

export async function getMsalInstance(): Promise<PublicClientApplication | null> {
  const s = await getFraudSettings();
  if (!s?.azure_tenant_id || !s.azure_client_id) return null;
  if (cachedPca) return cachedPca;

  const authority = s.azure_authority_url || `https://login.microsoftonline.com/${s.azure_tenant_id}`;
  const config: Configuration = {
    auth: {
      clientId: s.azure_client_id,
      authority,
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
    system: {
      // Avoid blocking the UI for a long time waiting for popup
      windowHashTimeout: 10_000,
      iframeHashTimeout: 10_000,
    },
  };
  cachedPca = new PublicClientApplication(config);
  await cachedPca.initialize();
  return cachedPca;
}

export interface MfaProof {
  idToken: string;
  account: { username?: string; name?: string; tenantId?: string };
  authority: string;
}

/**
 * Triggers a fresh MFA challenge via Microsoft Authenticator and returns the
 * resulting id_token. The token is bound to *this* approval action — its
 * `auth_time` claim should be within ~5 minutes when the backend validates.
 */
export async function performMfaStepUp(opts: {
  loginHint?: string;
  forceFresh?: boolean;
}): Promise<MfaProof> {
  const pca = await getMsalInstance();
  if (!pca) {
    throw new Error('Microsoft Authenticator MFA is not configured for this tenant.');
  }

  // Force fresh interactive flow with MFA assertion
  const claims = JSON.stringify({
    id_token: {
      acr: { essential: true, value: 'c1' },
      auth_time: { essential: true },
    },
  });

  const result: AuthenticationResult = await pca.acquireTokenPopup({
    scopes: ['openid', 'profile', 'email'],
    prompt: 'login',
    loginHint: opts.loginHint,
    claims,
    extraQueryParameters: {
      acr_values: 'urn:microsoft:policies:mfa',
      max_age: '0',
    },
  });

  if (!result.idToken) {
    throw new Error('No id_token returned from Microsoft Entra ID');
  }

  return {
    idToken: result.idToken,
    account: {
      username: result.account?.username,
      name: result.account?.name || undefined,
      tenantId: result.account?.tenantId,
    },
    authority: result.authority,
  };
}
