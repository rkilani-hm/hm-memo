// =====================================================================
// Password reset email — bilingual EN+AR with prominent OTP code
// =====================================================================
//
// The code is the entire payload. We display it once, large, with the
// validity window clearly stated. No clickable links anywhere in the
// email — that's the whole point of switching off magic links.
// =====================================================================

import { brandedEmailShell, BRAND } from './email-brand.ts';

function ar(html: string): string {
  return `<div dir="rtl" style="text-align:right;font-family:${BRAND.fontStack};">${html}</div>`;
}

const divider = `<div style="margin:24px 0;border-top:1px solid ${BRAND.greyLight};height:1px;"></div>`;

export interface PasswordResetCodeEmail {
  subject: string;
  html: string;
}

/**
 * Builds the password-reset email containing a 6-digit code and the
 * validity window. The code is displayed prominently in monospace
 * font, large enough to read at a glance.
 *
 * The email contains NO clickable links to the reset page — links
 * get pre-fetched by Microsoft Safe Links / corporate email scanners
 * which is exactly the problem we're solving by moving to OTP codes.
 * The user must navigate to the password-reset page themselves.
 */
export function emailPasswordResetCode(opts: {
  recipientName: string;        // best-effort display name; falls back to "there"
  code: string;                 // the 6-digit code to embed
  validForMinutes: number;      // how long the code stays valid
}): PasswordResetCodeEmail {
  const { recipientName, code, validForMinutes } = opts;
  const subject = `Your password reset code: ${code} | رمز إعادة تعيين كلمة المرور: ${code}`;

  // The code block — same markup in both EN and AR halves so it
  // reads identically regardless of language. Letter-spacing
  // intentionally wide so the digits don't visually clump.
  const codeBlock = `
    <div style="margin:18px 0;text-align:center;">
      <div style="display:inline-block;background:${BRAND.greyLight};border:1px solid ${BRAND.greyMid};border-radius:6px;padding:18px 28px;font-family:'Courier New', monospace;font-size:32px;font-weight:bold;color:${BRAND.black};letter-spacing:8px;">
        ${code}
      </div>
    </div>
  `;

  const enBody = `
    <p>Hello ${recipientName || 'there'},</p>
    <p>Use the following code to reset your password:</p>
    ${codeBlock}
    <p>This code is valid for <strong>${validForMinutes} minutes</strong>.</p>
    <p style="font-size:12px;color:${BRAND.greyMid};">
      If you didn't request a password reset, you can ignore this email — your password won't change unless someone enters this code.
      Never share this code with anyone, including IT support.
    </p>
  `;

  const arBody = ar(`
    <p>مرحباً ${recipientName || ''}،</p>
    <p>استخدم الرمز التالي لإعادة تعيين كلمة المرور الخاصة بك:</p>
    ${codeBlock}
    <p>هذا الرمز صالح لمدة <strong>${validForMinutes} دقائق</strong>.</p>
    <p style="font-size:12px;color:${BRAND.greyMid};">
      إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذا البريد الإلكتروني — لن تتغير كلمة المرور الخاصة بك ما لم يدخل شخص ما هذا الرمز.
      لا تشارك هذا الرمز مع أي شخص، بما في ذلك دعم تكنولوجيا المعلومات.
    </p>
  `);

  const html = brandedEmailShell({
    greetingName: recipientName || 'there',
    intro: 'Password reset code',
    bodyHtml: enBody + divider + arBody,
    subtitle: 'Account Security',
    // No CTA — the whole point is no clickable links in this email.
  });

  return { subject, html };
}
