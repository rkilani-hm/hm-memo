// Helpers to record which authentication factors an approver used when
// applying a decision to an approval step. Stored both as structured
// `auth_factors` JSON inside audit_log.details (machine-readable) and as
// a one-line human-readable summary inside audit_log.notes.

export interface AuthFactorInputs {
  /** Drawn signature image was applied to the step (digital flow). */
  signatureApplied: boolean;
  /** User re-entered their login password and it was verified. */
  passwordVerified: boolean;
  /** A fresh Microsoft Authenticator step-up was completed for this step. */
  mfaVerified: boolean;
  mfaMethod?: string | null;
  mfaProvider?: string | null;
  mfaVerifiedAt?: string | null;
  mfaUpn?: string | null;
  /** Manual paper registration on behalf of an approver. */
  manualPaper?: boolean;
  /** When manual: name of the registrar (the staff who entered it). */
  registeredByName?: string | null;
}

export interface AuthFactorsDetail {
  signature: { applied: boolean };
  password: { verified: boolean };
  mfa: {
    verified: boolean;
    method?: string | null;
    provider?: string | null;
    verified_at?: string | null;
    upn?: string | null;
  };
  manual_paper?: { registered_by_name?: string | null };
}

export function buildAuthFactors(input: AuthFactorInputs): {
  details: AuthFactorsDetail;
  notes: string;
} {
  const details: AuthFactorsDetail = {
    signature: { applied: !!input.signatureApplied },
    password: { verified: !!input.passwordVerified },
    mfa: {
      verified: !!input.mfaVerified,
      method: input.mfaMethod || null,
      provider: input.mfaProvider || null,
      verified_at: input.mfaVerifiedAt || null,
      upn: input.mfaUpn || null,
    },
  };
  if (input.manualPaper) {
    details.manual_paper = { registered_by_name: input.registeredByName || null };
  }

  const parts: string[] = [];
  if (input.manualPaper) {
    parts.push(
      input.registeredByName
        ? `Manual paper registration by ${input.registeredByName}`
        : 'Manual paper registration',
    );
  } else {
    if (input.signatureApplied) parts.push('Signature applied');
    if (input.passwordVerified) parts.push('Login password verified');
    if (input.mfaVerified) {
      const m = input.mfaMethod ? input.mfaMethod.replace(/_/g, ' ') : 'MFA';
      const upn = input.mfaUpn ? ` (${input.mfaUpn})` : '';
      const at = input.mfaVerifiedAt
        ? ` at ${new Date(input.mfaVerifiedAt).toISOString().slice(11, 16)} UTC`
        : '';
      parts.push(`${m}${upn}${at}`);
    } else {
      parts.push('MFA not required');
    }
  }
  return { details, notes: `Signed with: ${parts.join(' · ')}` };
}
