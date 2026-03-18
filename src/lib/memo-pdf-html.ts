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

/** Normalize stage labels from workflow data (L1/L2a/L2b/L3/L4/gm, 1/2a/2b/3/4/gm, etc.) */
function normalizeStageLevel(stage: string | null | undefined): string {
  const raw = String(stage ?? '').trim().toLowerCase().replace(/[\s_-]/g, '');
  if (raw === '1' || raw === 'l1' || raw === 'stage1') return 'l1';
  if (raw === '2a' || raw === 'l2a' || raw === 'stage2a') return 'l2a';
  if (raw === '2b' || raw === 'l2b' || raw === 'stage2b') return 'l2b';
  if (raw === '3' || raw === 'l3' || raw === 'stage3') return 'l3';
  if (raw === '4' || raw === 'l4' || raw === 'stage4') return 'l4';
  if (raw === 'gm' || raw === 'lgm') return 'gm';
  return raw;
}

/** Find an approval step by normalized stage_level */
function findStepByStage(steps: Tables<'approval_steps'>[], stage: string) {
  const target = normalizeStageLevel(stage);
  return steps.find((s) => normalizeStageLevel((s as any).stage_level) === target);
}

function isL1Stage(step: Tables<'approval_steps'>) {
  return normalizeStageLevel((step as any).stage_level) === 'l1';
}

/** Build the inner HTML content of one approval cell */
function buildApprovalCellContent(
  step: Tables<'approval_steps'> | undefined,
  profiles: Profile[],
  sigDataUrls: Record<string, string | null>,
  registeredByProfiles: Record<string, Profile | undefined>,
  actionLabel: string
): string {
  if (!step) {
    return `
      <div style="padding:6pt;">
        <div style="width:100pt;height:40pt;border:1px dashed #ccc;margin-bottom:4pt;"></div>
        <div style="border-bottom:0.5pt solid #ccc;width:80%;margin-bottom:4pt;"></div>
        <p style="font-size:8pt;color:#999;font-style:italic;margin:0;">Awaiting approval</p>
        <p style="font-size:7pt;color:#999;margin:0;">– ${actionLabel}</p>
        <p style="font-size:7pt;color:#999;margin:0;">Date:</p>
      </div>`;
  }

  const approver = getProfile(profiles, step.approver_user_id);
  const sigUrl = sigDataUrls[step.id] || null;
  const isManual = step.signing_method === 'manual_paper';
  const regBy = registeredByProfiles[step.id];

  let sigHtml = '';
  if (step.status === 'approved') {
    if (isManual) {
      sigHtml = `<p style="font-weight:bold;color:#C8952E;font-size:9pt;margin:0;">📄 SIGNED ON PAPER</p>
        ${regBy ? `<p style="font-size:7pt;color:#666;margin:2pt 0 0;">Registered by: ${regBy.full_name}</p>` : ''}`;
    } else if (sigUrl) {
      const imgH = step.action_type === 'initial' ? '35pt' : '40pt';
      sigHtml = `<img src="${sigUrl}" style="max-width:100pt;height:${imgH};object-fit:contain;display:block;" />`;
    } else if (step.action_type === 'initial') {
      sigHtml = `<span style="font-size:16pt;font-weight:bold;font-style:italic;color:#1B3A5C;">${approver?.initials || '✓'}</span>`;
    } else {
      sigHtml = `<span style="font-size:8pt;font-style:italic;color:#666;">[Digitally Approved]</span>`;
    }
  } else {
    sigHtml = `<div style="width:100pt;height:40pt;border:1px dashed #ccc;"></div>`;
  }

  const dateStr = step.signed_at ? format(new Date(step.signed_at), 'dd MMMM yyyy') : '';
  const nameTitle = `${approver?.full_name || 'Unknown'}${approver?.job_title ? ' – ' + approver.job_title : ''}`;

  return `
    <div style="padding:6pt;">
      ${sigHtml}
      <div style="border-bottom:0.5pt solid #000;width:80%;margin:4pt 0;"></div>
      <p style="font-size:8pt;font-weight:bold;margin:0;line-height:1.3;word-wrap:break-word;">${nameTitle}</p>
      <p style="font-size:7pt;color:#666;margin:0;">– ${actionLabel}</p>
      <p style="font-size:7pt;margin:0;">Date: ${dateStr}</p>
    </div>`;
}

/** Build the L1 sign-off block (right-aligned, in the memo body) */
function buildL1SignOffHtml(
  step: Tables<'approval_steps'> | undefined,
  profiles: Profile[],
  sigDataUrls: Record<string, string | null>,
  senderSigDataUrl: string | null,
  fromProfile: Profile | undefined
): string {
  // If there's an L1 step, use that approver
  if (step) {
    const approver = getProfile(profiles, step.approver_user_id);
    const sigUrl = sigDataUrls[step.id] || null;
    let sigImgHtml = '<p style="border-bottom:0.5pt solid #000;width:200pt;padding-bottom:4pt;margin-bottom:4pt;">&nbsp;</p>';
    if (step.status === 'approved' && sigUrl) {
      sigImgHtml = `<img src="${sigUrl}" style="max-width:160pt;max-height:50pt;object-fit:contain;margin-bottom:4pt;display:block;margin-left:auto;" />
        <div style="border-bottom:0.5pt solid #000;width:200pt;margin-left:auto;margin-bottom:4pt;"></div>`;
    } else if (step.status !== 'approved') {
      sigImgHtml = `<div style="border-bottom:0.5pt solid #ccc;width:200pt;margin-left:auto;padding-bottom:4pt;margin-bottom:4pt;">&nbsp;</div>`;
    }
    const name = approver?.full_name || fromProfile?.full_name || '—';
    const title = approver?.job_title || fromProfile?.job_title || '';
    return `
      <div class="memo-signature-block" style="text-align:right;margin-top:32px;margin-bottom:16px;page-break-inside:avoid;">
        <div style="display:inline-block;text-align:center;">
          ${sigImgHtml}
          <p style="font-weight:bold;font-size:11px;margin:0;">${name}${title ? ', ' + title : ''}</p>
        </div>
      </div>`;
  }

  // Fallback: use sender signature (original behavior)
  let senderSigHtml = '<p style="border-bottom:1px solid #000;width:200px;padding-bottom:4px;margin-bottom:4px;">&nbsp;</p>';
  if (senderSigDataUrl) {
    senderSigHtml = `<img src="${senderSigDataUrl}" style="height:60px;object-fit:contain;margin-bottom:4px;" />`;
  }
  return `
    <div class="memo-signature-block" style="text-align:right;margin-top:32px;margin-bottom:16px;page-break-inside:avoid;">
      <div style="display:inline-block;text-align:center;">
        ${senderSigHtml}
        <p style="font-weight:bold;font-size:11px;margin:0;">${fromProfile?.full_name || '—'}${fromProfile?.job_title ? ', ' + fromProfile.job_title : ''}</p>
      </div>
    </div>`;
}

/** Build the staged approvals table (L2A/L2B, L3, L4, GM) */
function buildStagedApprovalsHtml(
  approvalSteps: Tables<'approval_steps'>[],
  profiles: Profile[],
  sigDataUrls: Record<string, string | null>,
  registeredByProfiles: Record<string, Profile | undefined>
): string {
  const l2a = findStepByStage(approvalSteps, 'l2a');
  const l2b = findStepByStage(approvalSteps, 'l2b');
  const l3 = findStepByStage(approvalSteps, 'l3');
  const l4 = findStepByStage(approvalSteps, 'l4');
  const gm = findStepByStage(approvalSteps, 'gm');

  const hasAnyStaged = l2a || l2b || l3 || l4 || gm;

  // If no staged steps exist, fall back to generic 3-column grid
  if (!hasAnyStaged) {
    return buildGenericApprovalsHtml(approvalSteps, profiles, sigDataUrls, registeredByProfiles);
  }

  // Left column top: L2A + L2B stacked
  const l2aContent = buildApprovalCellContent(l2a, profiles, sigDataUrls, registeredByProfiles, 'INITIALS');
  const l2bContent = buildApprovalCellContent(l2b, profiles, sigDataUrls, registeredByProfiles, 'APPROVE');
  const leftTopCell = `
    <td style="border:0.5pt solid #000;vertical-align:top;width:33.33%;min-height:110pt;">
      ${l2aContent}
      <hr style="border:none;border-top:0.3pt solid #ccc;margin:2pt 6pt;" />
      ${l2bContent}
    </td>`;

  // Middle top: L3
  const middleTopCell = `
    <td style="border:0.5pt solid #000;vertical-align:top;width:33.33%;min-height:110pt;">
      ${buildApprovalCellContent(l3, profiles, sigDataUrls, registeredByProfiles, 'INITIALS')}
    </td>`;

  // Right top: L4
  const rightTopCell = `
    <td style="border:0.5pt solid #000;vertical-align:top;width:33.33%;min-height:110pt;">
      ${buildApprovalCellContent(l4, profiles, sigDataUrls, registeredByProfiles, 'APPROVE')}
    </td>`;

  // Bottom row: GM left, empty middle, empty right
  const gmCell = `
    <td style="border:0.5pt solid #000;vertical-align:top;min-height:90pt;">
      ${buildApprovalCellContent(gm, profiles, sigDataUrls, registeredByProfiles, 'APPROVE')}
    </td>`;
  const emptyCell = `<td style="border:0.5pt solid #000;min-height:90pt;"></td>`;

  return `
    <div style="margin:16px 0;page-break-inside:avoid;">
      <div style="background:#CC0000;color:#fff;text-align:center;padding:8px;font-weight:bold;font-size:11pt;letter-spacing:2px;text-transform:uppercase;">
        Approvals
      </div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <tr>${leftTopCell}${middleTopCell}${rightTopCell}</tr>
        <tr>${gmCell}${emptyCell}${emptyCell}</tr>
      </table>
    </div>`;
}

/** Fallback: generic rows-of-3 grid when no stage_level is set */
function buildGenericApprovalsHtml(
  approvalSteps: Tables<'approval_steps'>[],
  profiles: Profile[],
  sigDataUrls: Record<string, string | null>,
  registeredByProfiles: Record<string, Profile | undefined>
): string {
  if (approvalSteps.length === 0) return '';

  const rows: string[] = [];
  for (let i = 0; i < approvalSteps.length; i += 3) {
    const rowSteps = approvalSteps.slice(i, i + 3);
    const cells = rowSteps.map(step => {
      const approver = getProfile(profiles, step.approver_user_id);
      const sigUrl = sigDataUrls[step.id] || null;
      const regBy = registeredByProfiles[step.id];
      const isManual = step.signing_method === 'manual_paper';
      const sat = step.action_type || 'signature';
      const actionLabel = sat === 'initial' ? 'INITIALS' : 'APPROVE';

      let sigArea = '';
      if (isManual && step.status === 'approved') {
        sigArea = `<div style="text-align:center;padding:8px 0;">
          <p style="font-weight:bold;color:#C8952E;font-size:11px;margin:0;">📄 SIGNED ON PAPER</p>
          ${regBy ? `<p style="font-size:8px;color:#666;margin:2px 0 0;">Registered by: ${regBy.full_name}</p>` : ''}
        </div>`;
      } else if (sigUrl && step.status === 'approved') {
        const imgH = sat === 'initial' ? '35px' : '50px';
        sigArea = `<div style="text-align:center;padding:8px 0;"><img src="${sigUrl}" style="height:${imgH};object-fit:contain;margin:0 auto;" /></div>`;
      } else if (sat === 'initial' && step.status === 'approved') {
        sigArea = `<div style="text-align:center;padding:12px 0;font-size:18px;font-weight:bold;font-style:italic;color:#1B3A5C;">${approver?.initials || '✓'}</div>`;
      } else if (step.status === 'approved') {
        sigArea = `<div style="text-align:center;padding:12px 0;font-size:10px;font-style:italic;color:#666;">[Digitally Approved]</div>`;
      } else {
        sigArea = `<div style="height:50px;"></div>`;
      }

      const dateStr = step.signed_at ? format(new Date(step.signed_at), 'dd/MM/yyyy') : '';

      return `
        <td style="border:1px solid #000;padding:8px;vertical-align:top;min-width:140px;width:33%;word-wrap:break-word;">
          ${sigArea}
          <div style="border-top:1px solid #ccc;padding-top:4px;margin-top:4px;">
            <p style="font-size:10px;font-weight:bold;margin:0;line-height:1.3;word-wrap:break-word;">
              ${approver?.full_name || 'Unknown'}${approver?.job_title ? ' – ' + approver.job_title : ''}
            </p>
            <p style="font-size:9px;color:#666;font-weight:bold;text-transform:uppercase;margin:0;">– ${actionLabel}</p>
            <p style="font-size:10px;margin:2px 0 0;"><strong>Date:</strong> ${dateStr}</p>
          </div>
        </td>`;
    }).join('');
    const emptyCells = Array(3 - rowSteps.length).fill('<td style="border:1px solid #000;padding:8px;"></td>').join('');
    rows.push(`<tr>${cells}${emptyCells}</tr>`);
  }

  return `
    <div style="margin:16px 0;page-break-inside:avoid;">
      <div style="background:#CC0000;color:#fff;text-align:center;padding:8px;font-weight:bold;font-size:11pt;letter-spacing:2px;text-transform:uppercase;">
        Approvals
      </div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">${rows.join('')}</table>
    </div>`;
}

export function buildMemoHtml(data: MemoData, prepared: PreparedData, prefs: PrintPreferences): string {
  const { memo, fromProfile, toProfile, department, approvalSteps, attachments, profiles, logoDataUrl } = data;
  const { sigDataUrls, registeredByProfiles, senderSigDataUrl } = prepared;

  // L1 step for the sign-off block
  const l1Step = findStepByStage(approvalSteps, 'l1');

  // L1 sign-off block
  const signOffHtml = buildL1SignOffHtml(l1Step, profiles, sigDataUrls, senderSigDataUrl, fromProfile);

  // Transmitted for grid
  const transmittedForHtml = MEMO_TYPE_OPTIONS.map(opt => {
    const checked = memo.memo_types.includes(opt.value as any);
    return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;text-transform:uppercase;width:33%;box-sizing:border-box;">
      <span style="display:inline-block;width:12px;height:12px;border:1px solid ${checked ? '#000' : '#999'};text-align:center;line-height:12px;font-size:9px;">${checked ? '✕' : ''}</span>
      ${opt.label}
    </span>`;
  }).join('');

  // Approvals HTML (excluding L1 which is the sign-off)
  const nonL1Steps = approvalSteps.filter((s) => !isL1Stage(s));
  const approvalsHtml = buildStagedApprovalsHtml(nonL1Steps, profiles, sigDataUrls, registeredByProfiles);

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

  // Duplex margins
  const marginCss = prefs.duplexMode !== 'simplex' ? `
    @page :left  { margin: 15mm 25mm 15mm 15mm; }
    @page :right { margin: 15mm 15mm 15mm 25mm; }
  ` : `
    @page { margin: 15mm 15mm 15mm 15mm; }
  `;

  const grayscaleCss = prefs.colorMode === 'grayscale' ? 'filter: grayscale(100%);' : '';

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
    body { font-family: 'Century Gothic', 'Calibri', 'Arial', sans-serif; font-size: 12px; color: #1a1a1a; ${grayscaleCss} }

    @page { size: A4 portrait; margin: 20mm 15mm 20mm 15mm; }
    @page :first { margin-top: 10mm; }
    ${marginCss}
    ${pageNumberCss}

    @media print {
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
        box-shadow: none !important;
        text-shadow: none !important;
      }
      body { margin: 0; padding: 0; background: white !important; }
      nav, header, footer, aside,
      .toolbar, .sidebar, .action-buttons,
      .print-hide, .no-print,
      button, .toast, .modal-backdrop,
      .workflow-panel, .attachment-upload-area {
        display: none !important;
        visibility: hidden !important;
      }
    }

    .memo-header-table, .memo-subject, .memo-signature-block,
    .memo-footer-counts, .memo-copies-to, .memo-approvals,
    .memo-approval-card, .memo-action-comments, .memo-attachments,
    .memo-footer, blockquote, figure, img {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    tr { page-break-inside: avoid !important; break-inside: avoid !important; }
    h1, h2, h3, h4, h5, h6 {
      page-break-after: avoid !important; break-after: avoid !important;
      page-break-inside: avoid !important; break-inside: avoid !important;
    }
    .memo-header { page-break-after: avoid !important; break-after: avoid !important; }
    p { orphans: 3; widows: 3; }
    thead { display: table-header-group !important; }
    tfoot { display: table-footer-group !important; }
    tbody { display: table-row-group !important; }
    table { border-collapse: collapse !important; }
    .memo-body table { border-collapse: collapse !important; border: none !important; width: 100%; margin: 12px 0; }
    .memo-body table td, .memo-body table th { border: 1px solid #000 !important; padding: 5pt 8pt !important; vertical-align: top !important; }
    .memo-body table th { font-weight: bold; background-color: #f5f5f5; }
    .memo-layout-table, .memo-layout-table td, .memo-layout-table th {
      border-collapse: collapse !important; border: 1px solid #000 !important;
    }
  </style>
</head>
<body>
  <div class="memo-print-container" style="max-width:700px;margin:0 auto;">
    
    <!-- HEADER -->
    <div class="memo-header" style="display:flex;align-items:flex-end;justify-content:space-between;padding:20px 24px 16px;">
      <img src="${logoDataUrl}" style="height:100px;object-fit:contain;" />
      <div style="text-align:right;">
        <h1 style="font-size:24px;font-weight:bold;letter-spacing:2px;margin:0;">INTERNAL MEMO</h1>
        <div style="height:3px;background:#c00;margin-top:4px;"></div>
      </div>
    </div>

    <!-- HEADER TABLE -->
    <table class="memo-header-table" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:50%;border:1px solid #000;padding:8px 12px;vertical-align:top;">
          <p style="font-size:10px;color:#666;margin:0;">TO:</p>
          <p style="font-weight:bold;margin:4px 0 0;">${toProfile?.full_name || '—'}</p>
          ${toProfile?.job_title ? `<p style="font-size:11px;margin:0;">${toProfile.job_title}</p>` : ''}
        </td>
        <td style="width:25%;border:1px solid #000;background:#fff;color:#c00;padding:8px 12px;font-size:10px;font-weight:bold;vertical-align:middle;">TRANSMITTAL NO:</td>
        <td style="width:25%;border:1px solid #000;padding:8px 12px;font-weight:bold;font-family:monospace;vertical-align:middle;">${memo.transmittal_no}</td>
      </tr>
      <tr>
        <td style="border:1px solid #000;padding:8px 12px;vertical-align:top;">
          <p style="font-size:10px;color:#666;margin:0;">FROM:</p>
          <p style="font-weight:bold;margin:4px 0 0;">${fromProfile?.full_name || '—'}</p>
          ${fromProfile?.job_title ? `<p style="font-size:11px;margin:0;">${fromProfile.job_title}</p>` : ''}
          ${department ? `<p style="font-size:10px;color:#666;margin:0;">${department.name}</p>` : ''}
        </td>
        <td style="border:1px solid #000;background:#fff;color:#c00;padding:8px 12px;font-size:10px;font-weight:bold;vertical-align:middle;">DATE:</td>
        <td style="border:1px solid #000;padding:8px 12px;vertical-align:middle;">${format(new Date(memo.date), "do MMMM yyyy")}</td>
      </tr>
      <tr>
        <td style="border:1px solid #000;padding:8px 16px;" colspan="3">
          <p style="margin:0;"><strong>Subject:</strong> <strong>${memo.subject}</strong></p>
        </td>
      </tr>
      <tr>
        <td style="border:1px solid #000;padding:8px 12px;" colspan="3">
          <p style="font-size:10px;font-weight:bold;text-align:center;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">Transmitted For</p>
          <div style="display:flex;flex-wrap:wrap;">${transmittedForHtml}</div>
        </td>
      </tr>
    </table>

    <!-- DESCRIPTION -->
    <div style="padding:12px 16px;border-left:1px solid #000;border-right:1px solid #000;">
      <p style="font-size:10px;font-weight:bold;text-transform:uppercase;margin-bottom:8px;">Description:</p>
      <div class="memo-body" style="font-size:11px;line-height:1.6;">${memo.description || '<p>No description.</p>'}</div>

      <!-- L1 Sign-off Block -->
      ${signOffHtml}

      <!-- Footer counts -->
      <div class="memo-footer-counts" style="border-top:1px solid #ccc;padding-top:8px;text-align:center;font-size:10px;display:flex;justify-content:center;gap:24px;page-break-inside:avoid;">
        <span>No. of Continuation Pages: <strong>${String(memo.continuation_pages || 0).padStart(2, '0')}</strong></span>
        <span>No. of Attachments: <strong>${String(attachments.length).padStart(2, '0')}</strong></span>
        <span style="font-weight:bold;">${memo.initials || '--'}</span>
      </div>
    </div>

    <!-- COPIES TO + ACTION/COMMENTS -->
    <table class="memo-copies-action-table" style="width:100%;border-collapse:collapse;page-break-inside:avoid;">
      <tr>
        <td style="width:120px;border:1px solid #000;padding:6px 12px;font-size:10px;font-weight:bold;">COPIES TO:</td>
        <td style="border:1px solid #000;padding:6px 12px;font-size:11px;">${(memo.copies_to || []).map(id => { const p = profiles.find(pr => pr.user_id === id); if (!p) return id; const d = (data.departments || []).find(dept => dept.id === p.department_id); return p.full_name + (d ? ' – ' + d.name : ''); }).join(', ')}</td>
      </tr>
      <tr>
        <td style="border:1px solid #000;padding:6px 12px;font-size:10px;font-weight:bold;vertical-align:top;">
          <p style="margin:0;">ACTION REQUIRED:</p>
          <p style="margin:4px 0 0;">COMMENTS IF ANY:</p>
        </td>
        <td style="border:1px solid #000;padding:6px 12px;">${commentsHtml}</td>
      </tr>
    </table>

    <!-- APPROVALS -->
    <div class="memo-approvals memo-approvals-section">
      ${approvalsHtml}
    </div>

    <!-- Footer with QR code -->
    <div class="memo-footer" style="padding:8px 16px;font-size:8px;color:#999;border-top:1px solid #ddd;page-break-inside:avoid;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <p>HRA 09/00/T/I/01 &nbsp;&bull;&nbsp; Version 1.3 &nbsp;&bull;&nbsp; For Internal Use</p>
        ${confidentialityHtml}
      </div>
      <div style="text-align:right;">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${encodeURIComponent(`https://hm-memo.lovable.app/memos/${memo.id}`)}" style="width:60px;height:60px;" />
        <p style="font-size:6px;margin-top:2px;">Scan to verify</p>
      </div>
    </div>
  </div>

  ${blankBackPageHtml}
</body>
</html>`;

  return html;
}