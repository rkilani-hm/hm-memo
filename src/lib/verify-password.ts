import { supabase } from '@/integrations/supabase/client';

export type VerifyPasswordResult =
  | { ok: true }
  | {
      ok: false;
      category: 'wrong_password' | 'rate_limited' | 'email_not_confirmed' | 'user_disabled' | 'unknown';
      message?: string;
    };

/**
 * Verifies the currently logged-in user's password without creating
 * a fresh client-side session. Calls the verify-password edge
 * function which does a server-side signInWithPassword (different
 * rate-limit pool, doesn't swap the client's token).
 *
 * Returns { ok: true } on success or { ok: false, category, message }
 * on failure. The category is useful for showing the right message
 * to the user — 'rate_limited' should suggest waiting, while
 * 'wrong_password' means try again.
 *
 * Use this anywhere the user needs to re-confirm their identity for
 * a sensitive action — e.g., signing an approval.
 */
export async function verifyOwnPassword(password: string): Promise<VerifyPasswordResult> {
  if (!password) return { ok: false, category: 'wrong_password' };

  try {
    const { data, error } = await supabase.functions.invoke('verify-password', {
      body: { password },
    });
    if (error) {
      // Network / function-invocation error — distinct from a verified
      // wrong password. Caller should treat as transient.
      return { ok: false, category: 'unknown', message: error.message };
    }
    if (data?.ok === true) return { ok: true };
    return {
      ok: false,
      category: data?.category || 'unknown',
      message: data?.message,
    };
  } catch (e: any) {
    return { ok: false, category: 'unknown', message: e?.message };
  }
}

/** User-facing message for each verification failure category. */
export function passwordErrorMessage(result: VerifyPasswordResult): string {
  if (result.ok) return '';
  switch (result.category) {
    case 'wrong_password':
      return 'Incorrect password. Please try again.';
    case 'rate_limited':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'email_not_confirmed':
      return 'Your email is not confirmed. Please check your inbox or contact your administrator.';
    case 'user_disabled':
      return 'Your account is disabled. Please contact your administrator.';
    case 'unknown':
    default:
      return 'Could not verify password. Please try again or contact your administrator.';
  }
}
