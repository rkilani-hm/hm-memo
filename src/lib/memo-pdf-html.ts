import type { Tables } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import { MEMO_TYPE_OPTIONS } from '@/components/memo/TransmittedForGrid';
import type { MemoData, PrintPreferences } from './memo-pdf';

type Profile = Tables<'profiles'>;

interface PreparedData {
  sigDataUrls: Record<string, string | null>;
  registeredByProfiles: Record<string, Profile | undefined>;
  senderSigDataUrl: string | null;
}

function getProfile(profiles: Profile[], userId: string) {
  return profiles.find((p) => p.user_id === userId);
}

function buildApprovalStepHtml(
  step: Tables<'approval_steps'>,
  approver: Profile | undefined,
  sigImageDataUrl: string | null,
  registeredByProfile: Profile | undefined
): string {
  const sat = (step as any).action_type || 'signature';
  const isManual = (step as any).signing_method === 'manual_paper';
  const methodBadge = isManual
    ? '<span style="display:inline-block;background:#C8952E20;color:#C8952E;padding:1px 6px;border-radius:3px;font-size:8px;font-weight:bold;">📄 Manual</span>'
    : step.status === 'approved'
    ? '<span style="display:inline-block;background:#1B3A5C20;color:#1B3A5C;padding:1px 6px;border-radius:3px;font-size:8px;font-weight:bold;">🔐 Digital</span>'
    : '';

  let sigArea = '';
  if (isManual && step.status === 'approved') {
    sigArea = `
      <div style="text-align:center;padding:8px 0;">
        <p style="font-weight:bold;color:#C8952E;font-size:11px;margin:0;">📄 SIGNED ON PAPER</p>
        ${registeredByProfile ? `<p style="font-size:8px;color:#666;margin:2px 0 0;">Registered by: ${registeredByProfile.full_name}</p>` : ''}
        ${methodBadge}
      </div>`;
  } else if ((sat === 'signature' || sat === 'initial') && sigImageDataUrl && step.status === 'approved') {
    const imgH = sat === 'initial' ? '35px' : '50px';
    sigArea = `
      <div style="text-align:center;padding:8px 0;">
        <img src="${sigImageDataUrl}" style="height:${imgH};object-fit:contain;margin:0 auto;" />
        <br/>${methodBadge}
      </div>`;
  } else if (sat === 'initial' && step.status === 'approved') {
    sigArea = `<div style="text-align:center;padding:12px 0;font-size:18px;font-weight:bold;font-style:italic;color:#1B3A5C;">${approver?.initials || '✓'}</div>`;
  } else if (step.status === 'approved') {
    sigArea = `<div style="text-align:center;padding:12px 0;font-size:10px;font-style:italic;color:#666;">[Digitally Approved]</div>`;
  } else {
    sigArea = `<div style="height:50px;"></div>`;
  }

  const actionLabel = sat === 'signature' ? 'SIGNATURE' : sat === 'initial' ? 'INITIALS' : sat === 'review' ? 'REVIEW' : 'ACKNOWLEDGED';
  const dateStr = step.signed_at ? format(new Date(step.signed_at), 'dd/MM/yyyy') : '';
  const paperDate = isManual && (step as any).date_of_physical_signing
    ? `<p style="font-size:8px;color:#666;margin:0;">Paper signed: ${format(new Date((step as any).date_of_physical_signing), 'dd/MM/yyyy')}</p>`
    : '';

  return `
    <td style="border:1px solid #333;padding:8px;vertical-align:top;min-width:140px;width:33%;word-wrap:break-word;overflow-wrap:break-word;white-space:normal;">
      ${sigArea}
      <div style="border-top:1px solid #ccc;padding-top:4px;margin-top:4px;">
        <p style="font-size:10px;font-weight:bold;margin:0;line-height:1.3;white-space:normal;word-wrap:break-word;overflow-wrap:break-word;">
          ${approver?.full_name || 'Unknown'}${approver?.job_title ? ` –\n${approver.job_title}` : ''}
        </p>
        <p style="font-size:9px;color:#666;font-weight:bold;text-transform:uppercase;margin:0;">– ${actionLabel}</p>
        <p style="font-size:10px;margin:2px 0 0;"><strong>Date:</strong> ${dateStr}</p>
        ${paperDate}
      </div>
    </td>`;
}

export function buildMemoHtml(data: MemoData, prepared: PreparedData, prefs: PrintPreferences): string {
  const { memo, fromProfile, toProfile, department, approvalSteps, attachments, profiles, logoDataUrl } = data;
  const { sigDataUrls, registeredByProfiles, senderSigDataUrl } = prepared;

  // Sender signature
  let senderSigHtml = '<p style="border-bottom:1px solid #000;width:200px;padding-bottom:4px;margin-bottom:4px;">&nbsp;</p>';
  if (senderSigDataUrl) {
    senderSigHtml = `<img src="${senderSigDataUrl}" style="height:60px;object-fit:contain;margin-bottom:4px;" />`;
  }

  // Transmitted for grid
  const transmittedForHtml = MEMO_TYPE_OPTIONS.map(opt => {
    const checked = memo.memo_types.includes(opt.value as any);
    return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;text-transform:uppercase;width:33%;box-sizing:border-box;">
      <span style="display:inline-block;width:12px;height:12px;border:1px solid ${checked ? '#000' : '#999'};text-align:center;line-height:12px;font-size:9px;">${checked ? '✕' : ''}</span>
      ${opt.label}
    </span>`;
  }).join('');

  // Approval steps HTML (rows of 3)
  let approvalsHtml = '';
  if (approvalSteps.length > 0) {
    const rows: string[] = [];
    for (let i = 0; i < approvalSteps.length; i += 3) {
      const rowSteps = approvalSteps.slice(i, i + 3);
      const cells = rowSteps.map(step => {
        const approver = getProfile(profiles, step.approver_user_id);
        return buildApprovalStepHtml(step, approver, sigDataUrls[step.id] || null, registeredByProfiles[step.id]);
      }).join('');
      const emptyCells = Array(3 - rowSteps.length).fill('<td style="border:1px solid #333;padding:8px;"></td>').join('');
      rows.push(`<tr>${cells}${emptyCells}</tr>`);
    }
    approvalsHtml = `
      <div style="margin:16px 0;page-break-inside:avoid;">
        <div style="background:#c00;color:#fff;text-align:center;padding:8px;font-weight:bold;font-size:14px;letter-spacing:3px;text-transform:uppercase;">
          Approvals
        </div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">${rows.join('')}</table>
      </div>`;
  }

  // Comments
  const commentsHtml = approvalSteps
    .filter(s => s.comments)
    .map(s => {
      const approver = getProfile(profiles, s.approver_user_id);
      return `<p style="font-size:10px;margin:2px 0;"><strong>${approver?.full_name || 'Unknown'}:</strong> ${s.comments}</p>`;
    }).join('');

  // Confidentiality line
  const confidentialityHtml = prefs.confidentialityLine
    ? `<p style="font-size:8px;color:#999;text-align:center;margin-top:4px;">${prefs.confidentialityLine}</p>`
    : '';

  // Page number style
  const pageNumberCss = prefs.pageNumberStyle !== 'none' ? `
    @page { 
      @bottom-${prefs.pageNumberStyle === 'bottom_right' ? 'right' : 'center'} {
        content: counter(page) " of " counter(pages);
        font-size: 8pt;
        color: #999;
      }
    }` : '';

  // Duplex margins: 25mm inner (binding), 15mm outer
  const marginCss = prefs.duplexMode !== 'simplex' ? `
    @page :left  { margin: 15mm 25mm 15mm 15mm; }
    @page :right { margin: 15mm 15mm 15mm 25mm; }
  ` : `
    @page { margin: 15mm 15mm 15mm 15mm; }
  `;

  // Grayscale filter
  const grayscaleCss = prefs.colorMode === 'grayscale' ? 'filter: grayscale(100%);' : '';

  // Blank back page for single-page memos
  const blankBackPageHtml = prefs.blankBackPages ? `
    <div style="page-break-before:always;height:100vh;"></div>
  ` : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Memo ${memo.transmittal_no}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Century Gothic', 'Arial', sans-serif; font-size: 12px; color: #1a1a1a; ${grayscaleCss} }

    /* A4 portrait: 210mm × 297mm */
    @page { size: A4 portrait; }
    ${marginCss}
    ${pageNumberCss}

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }

    /* Page break rules */
    .memo-header-table { page-break-inside: avoid; }
    .memo-subject     { page-break-inside: avoid; }
    .memo-signature-block { page-break-inside: avoid; }
    .memo-footer-counts { page-break-inside: avoid; }
    .memo-copies-to   { page-break-inside: avoid; }
    .memo-approvals   { page-break-inside: avoid; }
    .memo-approval-card { page-break-inside: avoid; }
    .memo-action-comments { page-break-inside: avoid; }

    /* Orphan / Widow control */
    p, div { orphans: 3; widows: 3; }

    /* Embedded table rows */
    tr { page-break-inside: avoid; }

    table { border-collapse: collapse; }
    .header-table td { border: 1px solid #333; }
  </style>
</head>
<body>
  <div style="max-width:700px;margin:0 auto;border:1px solid #333;">
    
    <!-- HEADER -->
    <div class="memo-header-table" style="display:flex;align-items:flex-end;justify-content:space-between;padding:20px 24px 16px;">
      <img src="${logoDataUrl}" style="height:100px;object-fit:contain;" />
      <div style="text-align:right;">
        <h1 style="font-size:24px;font-weight:bold;letter-spacing:2px;margin:0;">INTERNAL MEMO</h1>
        <div style="height:3px;background:#c00;margin-top:4px;"></div>
      </div>
    </div>

    <!-- TO / TRANSMITTAL / DATE / FROM -->
    <table class="memo-header-table header-table" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:50%;padding:8px 12px;vertical-align:top;">
          <p style="font-size:10px;color:#666;">TO:</p>
          <p style="font-weight:bold;margin-top:4px;">${toProfile?.full_name || '—'}</p>
          ${toProfile?.job_title ? `<p style="font-size:11px;">${toProfile.job_title}</p>` : ''}
        </td>
        <td style="width:50%;padding:0;vertical-align:top;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="background:#fff;color:#c00;padding:8px 12px;font-size:10px;font-weight:bold;width:120px;border:1px solid #333;">TRANSMITTAL NO:</td>
              <td style="padding:8px 12px;font-weight:bold;font-family:monospace;border:none;">${memo.transmittal_no}</td>
            </tr>
            <tr>
              <td style="background:#fff;color:#c00;padding:8px 12px;font-size:10px;font-weight:bold;border-top:1px solid #333;border-left:1px solid #333;border-bottom:none;border-right:none;">DATE:</td>
              <td style="padding:8px 12px;border-top:1px solid #333;border-left:none;border-bottom:none;border-right:none;">${format(new Date(memo.date), "do MMMM yyyy")}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 12px;vertical-align:top;">
          <p style="font-size:10px;color:#666;">FROM:</p>
          <p style="font-weight:bold;margin-top:4px;">${fromProfile?.full_name || '—'}</p>
          ${fromProfile?.job_title ? `<p style="font-size:11px;">${fromProfile.job_title}</p>` : ''}
          ${department ? `<p style="font-size:10px;color:#666;">${department.name}</p>` : ''}
        </td>
        <td style="padding:8px 12px;vertical-align:top;">
          <p style="font-size:10px;font-weight:bold;text-align:center;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Transmitted For</p>
          <div style="display:flex;flex-wrap:wrap;">${transmittedForHtml}</div>
        </td>
      </tr>
    </table>

    <!-- SUBJECT -->
    <div class="memo-subject" style="border-top:1px solid #333;padding:8px 16px;">
      <p><strong>Subject:</strong> <strong>${memo.subject}</strong></p>
    </div>

    <!-- DESCRIPTION -->
    <div style="border-top:1px solid #333;padding:12px 16px;">
      <p style="font-size:10px;font-weight:bold;text-transform:uppercase;margin-bottom:8px;">Description:</p>
      <div style="font-size:11px;line-height:1.6;">${memo.description || '<p>No description.</p>'}</div>

      <!-- Sender Signature -->
      <div class="memo-signature-block" style="text-align:right;margin-top:32px;margin-bottom:16px;page-break-inside:avoid;">
        <div style="display:inline-block;text-align:center;">
          ${senderSigHtml}
          <p style="font-weight:bold;font-size:11px;">${fromProfile?.full_name || '—'}, ${fromProfile?.job_title || ''}</p>
        </div>
      </div>

      <!-- Footer counts -->
      <div class="memo-footer-counts" style="border-top:1px solid #ccc;padding-top:8px;text-align:center;font-size:10px;display:flex;justify-content:center;gap:24px;page-break-inside:avoid;">
        <span>No. of Continuation Pages: <strong>${String(memo.continuation_pages || 0).padStart(2, '0')}</strong></span>
        <span>No. of Attachments: <strong>${String(attachments.length).padStart(2, '0')}</strong></span>
        <span style="font-weight:bold;">${memo.initials || ''}</span>
      </div>
    </div>

    <!-- COPIES TO -->
    <table class="memo-copies-to" style="width:100%;border-collapse:collapse;page-break-inside:avoid;">
      <tr>
        <td style="width:120px;border:1px solid #333;padding:6px 12px;font-size:10px;font-weight:bold;">COPIES TO:</td>
        <td style="border:1px solid #333;padding:6px 12px;font-size:11px;">${memo.copies_to?.join(', ') || ''}</td>
      </tr>
    </table>

    <!-- ACTION REQUIRED / COMMENTS -->
    <table class="memo-action-comments" style="width:100%;border-collapse:collapse;page-break-inside:avoid;">
      <tr>
        <td style="width:120px;border:1px solid #333;padding:6px 12px;font-size:10px;font-weight:bold;vertical-align:top;">
          <p>ACTION REQUIRED:</p>
          <p style="margin-top:4px;">COMMENTS IF ANY:</p>
        </td>
        <td style="border:1px solid #333;padding:6px 12px;">${commentsHtml}</td>
      </tr>
    </table>

    <!-- APPROVALS -->
    <div class="memo-approvals">
      ${approvalsHtml}
    </div>

    <!-- Footer -->
    <div style="padding:8px 16px;font-size:8px;color:#999;border-top:1px solid #ddd;page-break-inside:avoid;">
      <p>HRA 09/00/T/I/01 &nbsp;&bull;&nbsp; Version 1.3 &nbsp;&bull;&nbsp; For Internal Use</p>
      ${confidentialityHtml}
    </div>
  </div>

  <!-- Blank back page for duplex single-page memos -->
  ${blankBackPageHtml}
</body>
</html>`;

  return html;
}
