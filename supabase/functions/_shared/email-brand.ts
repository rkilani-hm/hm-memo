// Al Hamra brand-compliant email shell, used by ALL outbound emails
// (both client-side `src/lib/email-notifications.ts` and the server-side
// edge functions: submit-memo, reminder-overdue-approvals, etc.).
//
// Brand identity (from Al Hamra Identity Guidelines):
//   Primary red:    #CD1719
//   Mid grey:       #B2B2B2
//   Black:          #1D1D1B
//   Light grey:     #EDEDED
//   Typography:     Century Gothic Bold (headings), Regular (body)
//                   Email-safe fallbacks: 'Trebuchet MS', Arial, sans-serif

export const BRAND = {
  red: '#CD1719',
  black: '#1D1D1B',
  greyMid: '#B2B2B2',
  greyLight: '#EDEDED',
  white: '#FFFFFF',
  fontStack: "'Century Gothic', 'Trebuchet MS', Arial, sans-serif",
  logoUrl:
    'https://ndoyllcsqaxskcxmdxjc.supabase.co/storage/v1/object/public/branding/al-hamra-logo.jpg',
};

export interface EmailShellOptions {
  greetingName: string;
  intro: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Override accent (CTA + side-bars). Defaults to brand red. */
  accentColor?: string;
  /** Sub-title shown under the logo. Defaults to "Internal Memo System". */
  subtitle?: string;
  /** Footer disclaimer; falls back to standard automated-notice text. */
  footerNote?: string;
}

/**
 * Wraps the provided body HTML in a brand-compliant shell:
 * white background, Al Hamra logo header, red accent CTA, grey footer.
 */
export function brandedEmailShell(opts: EmailShellOptions): string {
  const accent = opts.accentColor || BRAND.red;
  const subtitle = opts.subtitle ?? 'Internal Memo System';
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<a href="${opts.ctaUrl}" style="display:inline-block;background:${accent};color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:4px;font-weight:bold;letter-spacing:0.5px;margin-top:16px;font-family:${BRAND.fontStack};">${opts.ctaLabel}</a>`
      : '';
  const note = opts.footerNote
    ? opts.footerNote
    : 'This is an automated notification from the Al Hamra Memo System.';

  return `
  <div style="background:${BRAND.greyLight};padding:24px 0;font-family:${BRAND.fontStack};">
    <div style="max-width:620px;margin:0 auto;background:${BRAND.white};border:1px solid ${BRAND.greyLight};border-top:4px solid ${BRAND.red};box-shadow:0 1px 3px rgba(0,0,0,0.04);">

      <!-- Logo header -->
      <div style="background:${BRAND.white};padding:24px 24px 16px;text-align:center;border-bottom:1px solid ${BRAND.greyLight};">
        <img src="${BRAND.logoUrl}" alt="Al Hamra Real Estate" width="140" height="auto" style="display:inline-block;max-width:140px;height:auto;border:0;" />
        <p style="color:${BRAND.greyMid};margin:10px 0 0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-family:${BRAND.fontStack};">${subtitle}</p>
      </div>

      <!-- Body -->
      <div style="padding:28px 28px 24px;background:${BRAND.white};color:${BRAND.black};font-size:14px;line-height:1.6;">
        <p style="margin:0 0 12px;font-size:15px;">Dear <strong style="color:${BRAND.black};">${opts.greetingName}</strong>,</p>
        <p style="margin:0 0 16px;color:${BRAND.black};">${opts.intro}</p>
        ${opts.bodyHtml}
        ${cta}
      </div>

      <!-- Footer -->
      <div style="padding:18px 24px;background:${BRAND.greyLight};text-align:center;font-size:11px;color:#5A5A5A;font-family:${BRAND.fontStack};line-height:1.5;">
        <p style="margin:0 0 6px;font-weight:bold;color:${BRAND.black};letter-spacing:0.5px;">AL HAMRA REAL ESTATE</p>
        <p style="margin:0;">${note}</p>
      </div>
    </div>
  </div>`;
}

export function memoFactsTable(rows: { label: string; value: string }[]): string {
  return `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;font-family:${BRAND.fontStack};">
      ${rows
        .map(
          (r) =>
            `<tr><td style="padding:10px;border:1px solid ${BRAND.greyLight};font-weight:bold;width:160px;background:#FAFAFA;color:${BRAND.black};">${r.label}</td><td style="padding:10px;border:1px solid ${BRAND.greyLight};color:${BRAND.black};">${r.value}</td></tr>`,
        )
        .join('')}
    </table>`;
}
