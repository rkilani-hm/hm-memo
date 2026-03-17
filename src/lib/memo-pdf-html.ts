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

  const actionLabel = sat === 'signature' ? 'APPROVE' : 'INITIALS';
  const dateStr = step.signed_at ? format(new Date(step.signed_at), 'dd/MM/yyyy') : '';
  const paperDate = isManual && (step as any).date_of_physical_signing
    ? `<p style="font-size:8px;color:#666;margin:0;">Paper signed: ${format(new Date((step as any).date_of_physical_signing), 'dd/MM/yyyy')}</p>`
    : '';

  return `
    <td style="border:1px solid #000;padding:8px;vertical-align:top;min-width:140px;width:33%;word-wrap:break-word;overflow-wrap:break-word;white-space:normal;">
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

  // Approval steps HTML
  let approvalsHtml = '';
  if (approvalSteps.length > 0) {
    // Check if steps have stage_level to use 3-column physical form layout
    const hasStages = approvalSteps.some((s: any) => s.stage_level);
    
    if (hasStages) {
      // 3-column layout: Finance Dept | GM/COO/CAO/CFO | CEO/Chairman
      const financeSteps = approvalSteps.filter((s: any) => s.stage_level === 'L2a' || s.stage_level === 'L2b');
      const executiveStep = approvalSteps.find((s: any) => s.stage_level === 'L3');
      const ceoStep = approvalSteps.find((s: any) => s.stage_level === 'L4');
      
      // Finance column content
      let financeContent = '';
      const financeInitials = approvalSteps.filter((s: any) => s.stage_level === 'L2a');
      const financeManager = approvalSteps.find((s: any) => s.stage_level === 'L2b');
      
      // Finance staff initials
      for (const fi of financeInitials) {
        const fiApprover = getProfile(profiles, fi.approver_user_id);
        const fiSig = sigDataUrls[fi.id] || null;
        if (fi.status === 'approved' && fiSig) {
          financeContent += `<div style="text-align:center;margin:4px 0;"><img src="${fiSig}" style="height:30px;object-fit:contain;" /><br/><span style="font-size:8px;">${fiApprover?.full_name || ''}</span></div>`;
        } else if (fi.status === 'approved') {
          financeContent += `<div style="text-align:center;margin:4px 0;font-size:14px;font-weight:bold;font-style:italic;color:#1B3A5C;">${fiApprover?.initials || '✓'}</div>`;
        }
      }
      
      // Finance manager signature
      if (financeManager) {
        const fmApprover = getProfile(profiles, financeManager.approver_user_id);
        const fmSig = sigDataUrls[financeManager.id] || null;
        if (financeManager.status === 'approved' && fmSig) {
          financeContent += `<div style="text-align:center;margin:8px 0;"><img src="${fmSig}" style="height:45px;object-fit:contain;" /></div>`;
        }
        financeContent += `<div style="border-top:1px solid #ccc;padding-top:4px;margin-top:4px;">
          <p style="font-size:10px;font-weight:bold;margin:0;">${fmApprover?.full_name || 'Unknown'}</p>
          ${fmApprover?.job_title ? `<p style="font-size:9px;margin:0;">${fmApprover.job_title}</p>` : ''}
          <p style="font-size:9px;color:#666;font-weight:bold;text-transform:uppercase;margin:0;">– APPROVE</p>
          <p style="font-size:10px;margin:2px 0 0;"><strong>Date:</strong> ${financeManager.signed_at ? format(new Date(financeManager.signed_at), 'dd/MM/yyyy') : ''}</p>
        </div>`;
      }

      // Executive column
      let executiveContent = '';
      if (executiveStep) {
        const exApprover = getProfile(profiles, executiveStep.approver_user_id);
        const exSig = sigDataUrls[executiveStep.id] || null;
        if (executiveStep.status === 'approved' && exSig) {
          executiveContent += `<div style="text-align:center;padding:8px 0;"><img src="${exSig}" style="height:50px;object-fit:contain;" /></div>`;
        } else if (executiveStep.status === 'approved') {
          executiveContent += `<div style="text-align:center;padding:12px 0;font-size:10px;font-style:italic;color:#666;">[Digitally Approved]</div>`;
        } else {
          executiveContent += `<div style="height:50px;"></div>`;
        }
        executiveContent += `<div style="border-top:1px solid #ccc;padding-top:4px;margin-top:4px;">
          <p style="font-size:10px;font-weight:bold;margin:0;">${exApprover?.full_name || 'Unknown'}</p>
          ${exApprover?.job_title ? `<p style="font-size:9px;margin:0;">${exApprover.job_title}</p>` : ''}
          <p style="font-size:9px;color:#666;font-weight:bold;text-transform:uppercase;margin:0;">– APPROVE</p>
          <p style="font-size:10px;margin:2px 0 0;"><strong>Date:</strong> ${executiveStep.signed_at ? format(new Date(executiveStep.signed_at), 'dd/MM/yyyy') : ''}</p>
        </div>`;
      }

      // CEO column
      let ceoContent = '';
      if (ceoStep) {
        const ceoApprover = getProfile(profiles, ceoStep.approver_user_id);
        const ceoSig = sigDataUrls[ceoStep.id] || null;
        if (ceoStep.status === 'approved' && ceoSig) {
          ceoContent += `<div style="text-align:center;padding:8px 0;"><img src="${ceoSig}" style="height:50px;object-fit:contain;" /></div>`;
        } else if (ceoStep.status === 'approved') {
          ceoContent += `<div style="text-align:center;padding:12px 0;font-size:10px;font-style:italic;color:#666;">[Digitally Approved]</div>`;
        } else {
          ceoContent += `<div style="height:50px;"></div>`;
        }
        ceoContent += `<div style="border-top:1px solid #ccc;padding-top:4px;margin-top:4px;">
          <p style="font-size:10px;font-weight:bold;margin:0;">${ceoApprover?.full_name || 'Unknown'}</p>
          ${ceoApprover?.job_title ? `<p style="font-size:9px;margin:0;">${ceoApprover.job_title}</p>` : ''}
          <p style="font-size:9px;color:#666;font-weight:bold;text-transform:uppercase;margin:0;">– APPROVE</p>
          <p style="font-size:10px;margin:2px 0 0;"><strong>Date:</strong> ${ceoStep.signed_at ? format(new Date(ceoStep.signed_at), 'dd/MM/yyyy') : ''}</p>
        </div>`;
      }

      approvalsHtml = `
        <div style="margin:16px 0;page-break-inside:avoid;">
          <div style="background:#c00;color:#fff;text-align:center;padding:8px;font-weight:bold;font-size:14px;letter-spacing:3px;text-transform:uppercase;">
            Approvals
          </div>
          <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
            <tr>
              <td style="border:1px solid #000;padding:6px 8px;font-weight:bold;font-size:11px;text-align:center;background:#f5f5f5;">Finance Dept.</td>
              <td style="border:1px solid #000;padding:6px 8px;font-weight:bold;font-size:11px;text-align:center;background:#f5f5f5;">GM / COO / CAO / CFO</td>
              <td style="border:1px solid #000;padding:6px 8px;font-weight:bold;font-size:11px;text-align:center;background:#f5f5f5;">CEO / Chairman</td>
            </tr>
            <tr>
              <td style="border:1px solid #000;padding:8px;vertical-align:top;min-height:120px;">${financeContent || '<div style="height:80px;"></div>'}</td>
              <td style="border:1px solid #000;padding:8px;vertical-align:top;min-height:120px;">${executiveContent || '<div style="height:80px;"></div>'}</td>
              <td style="border:1px solid #000;padding:8px;vertical-align:top;min-height:120px;">${ceoContent || '<div style="height:80px;"></div>'}</td>
            </tr>
          </table>
        </div>`;
    } else {
      // Fallback: generic rows-of-3 layout (existing behavior)
      const rows: string[] = [];
      for (let i = 0; i < approvalSteps.length; i += 3) {
        const rowSteps = approvalSteps.slice(i, i + 3);
        const cells = rowSteps.map(step => {
          const approver = getProfile(profiles, step.approver_user_id);
          return buildApprovalStepHtml(step, approver, sigDataUrls[step.id] || null, registeredByProfiles[step.id]);
        }).join('');
        const emptyCells = Array(3 - rowSteps.length).fill('<td style="border:1px solid #000;padding:8px;"></td>').join('');
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

    /* =============================================
       PAGE SETUP — A4 portrait: 210mm × 297mm
    ============================================= */
    @page { size: A4 portrait; margin: 20mm 15mm 20mm 15mm; }
    @page :first { margin-top: 10mm; }
    ${marginCss}
    ${pageNumberCss}

    /* =============================================
       GLOBAL PRINT RESET
    ============================================= */
    @media print {
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
        box-shadow: none !important;
        text-shadow: none !important;
      }
      body { margin: 0; padding: 0; background: white !important; }

      /* Hide non-print UI elements */
      nav, header, footer, aside,
      .toolbar, .sidebar, .action-buttons,
      .print-hide, .no-print,
      button, .toast, .modal-backdrop,
      .workflow-panel, .attachment-upload-area {
        display: none !important;
        visibility: hidden !important;
      }
    }

    /* =============================================
       SMART PAGE BREAK RULES
    ============================================= */
    /* Never break inside these structural blocks */
    .memo-header-table,
    .memo-subject,
    .memo-signature-block,
    .memo-footer-counts,
    .memo-copies-to,
    .memo-approvals,
    .memo-approval-card,
    .memo-action-comments,
    .memo-attachments,
    .memo-footer,
    blockquote,
    figure,
    img {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    /* Never break inside a table row */
    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    /* Keep headings with following content */
    h1, h2, h3, h4, h5, h6 {
      page-break-after: avoid !important;
      break-after: avoid !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    /* Never break right after the memo header */
    .memo-header {
      page-break-after: avoid !important;
      break-after: avoid !important;
    }

    /* Orphan / Widow control */
    p { orphans: 3; widows: 3; }

    /* Repeat thead on every continuation page */
    thead { display: table-header-group !important; }
    tfoot { display: table-footer-group !important; }
    tbody { display: table-row-group !important; }

    /* =============================================
       TABLE STYLING — single-border discipline
    ============================================= */
    table { border-collapse: collapse !important; }

    /* Memo body (description) tables — user-inserted via rich text editor */
    .memo-body table {
      border-collapse: collapse !important;
      border: none !important;
      width: 100%;
      margin: 12px 0;
    }
    .memo-body table td,
    .memo-body table th {
      border: 1px solid #000 !important;
      padding: 5pt 8pt !important;
      vertical-align: top !important;
    }
    .memo-body table th { font-weight: bold; background-color: #f5f5f5; }

    /* Structural layout tables (approvals, header etc.) — same single-border */
    .memo-layout-table,
    .memo-layout-table td,
    .memo-layout-table th {
      border-collapse: collapse !important;
      border: 1px solid #000 !important;
    }
  </style>
</head>
<body>
  <div class="memo-print-container" style="max-width:700px;margin:0 auto;">
    
    <!-- HEADER (logo + title) -->
    <div class="memo-header" style="display:flex;align-items:flex-end;justify-content:space-between;padding:20px 24px 16px;">
      <img src="${logoDataUrl}" style="height:100px;object-fit:contain;" />
      <div style="text-align:right;">
        <h1 style="font-size:24px;font-weight:bold;letter-spacing:2px;margin:0;">INTERNAL MEMO</h1>
        <div style="height:3px;background:#c00;margin-top:4px;"></div>
      </div>
    </div>

    <!-- UNIFIED HEADER TABLE: TO, FROM, TRANSMITTAL, DATE, SUBJECT — single table, no double borders -->
    <table class="memo-header-table" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:50%;border:1px solid #000;padding:8px 12px;vertical-align:top;" rowspan="1">
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

      <!-- Sender Signature -->
      <div class="memo-signature-block" style="text-align:right;margin-top:32px;margin-bottom:16px;page-break-inside:avoid;">
        <div style="display:inline-block;text-align:center;">
          ${senderSigHtml}
          <p style="font-weight:bold;font-size:11px;margin:0;">${fromProfile?.full_name || '—'}, ${fromProfile?.job_title || ''}</p>
        </div>
      </div>

      <!-- Footer counts -->
      <div class="memo-footer-counts" style="border-top:1px solid #ccc;padding-top:8px;text-align:center;font-size:10px;display:flex;justify-content:center;gap:24px;page-break-inside:avoid;">
        <span>No. of Continuation Pages: <strong>${String(memo.continuation_pages || 0).padStart(2, '0')}</strong></span>
        <span>No. of Attachments: <strong>${String(attachments.length).padStart(2, '0')}</strong></span>
        <span style="font-weight:bold;">${memo.initials || '--'}</span>
      </div>
    </div>

    <!-- COPIES TO + ACTION/COMMENTS — single table to avoid double borders -->
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

    <!-- Footer -->
    <div class="memo-footer" style="padding:8px 16px;font-size:8px;color:#999;border-top:1px solid #ddd;page-break-inside:avoid;">
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
