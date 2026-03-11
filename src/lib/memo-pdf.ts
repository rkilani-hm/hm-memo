import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import { MEMO_TYPE_OPTIONS } from '@/components/memo/TransmittedForGrid';

type Profile = Tables<'profiles'>;

interface MemoData {
  memo: Tables<'memos'>;
  fromProfile: Profile | undefined;
  toProfile: Profile | undefined;
  department: Tables<'departments'> | undefined;
  approvalSteps: Tables<'approval_steps'>[];
  attachments: Tables<'memo_attachments'>[];
  profiles: Profile[];
  logoDataUrl: string;
}

async function getSignedImageDataUrl(storagePath: string, bucket = 'signatures'): Promise<string | null> {
  try {
    let path = storagePath;
    const bucketPrefix = `/storage/v1/object/public/${bucket}/`;
    const idx = path.indexOf(bucketPrefix);
    if (idx !== -1) path = path.substring(idx + bucketPrefix.length);
    const signedPrefix = `/storage/v1/object/sign/${bucket}/`;
    const sidx = path.indexOf(signedPrefix);
    if (sidx !== -1) path = path.substring(sidx + signedPrefix.length).split('?')[0];

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return null;

    const response = await fetch(data.signedUrl);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function imageUrlToDataUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
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
  } else if (sat === 'review' && step.status === 'approved') {
    sigArea = `<div style="text-align:center;padding:12px 0;font-size:10px;font-style:italic;color:#666;">Reviewed</div>`;
  } else if (sat === 'acknowledge' && step.status === 'approved') {
    sigArea = `<div style="text-align:center;padding:12px 0;font-size:10px;font-style:italic;color:#666;">Acknowledged</div>`;
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

export async function generateMemoPdf(data: MemoData): Promise<void> {
  const { memo, fromProfile, toProfile, department, approvalSteps, attachments, profiles, logoDataUrl } = data;

  // Pre-fetch all signature images as data URLs
  const sigDataUrls: Record<string, string | null> = {};
  const registeredByProfiles: Record<string, Profile | undefined> = {};

  for (const step of approvalSteps) {
    if (step.signature_image_url) {
      sigDataUrls[step.id] = await getSignedImageDataUrl(step.signature_image_url);
    }
    if ((step as any).registered_by_user_id) {
      registeredByProfiles[step.id] = getProfile(profiles, (step as any).registered_by_user_id);
    }
  }

  // Sender signature
  let senderSigHtml = '<p style="border-bottom:1px solid #000;width:200px;padding-bottom:4px;margin-bottom:4px;">&nbsp;</p>';
  if (fromProfile?.signature_image_url) {
    const senderSigData = await getSignedImageDataUrl(fromProfile.signature_image_url);
    if (senderSigData) {
      senderSigHtml = `<img src="${senderSigData}" style="height:60px;object-fit:contain;margin-bottom:4px;" />`;
    }
  }

  // Build transmitted for grid
  const transmittedForHtml = MEMO_TYPE_OPTIONS.map(opt => {
    const checked = memo.memo_types.includes(opt.value as any);
    return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;text-transform:uppercase;width:33%;box-sizing:border-box;">
      <span style="display:inline-block;width:12px;height:12px;border:1px solid ${checked ? '#000' : '#999'};text-align:center;line-height:12px;font-size:9px;">${checked ? '✕' : ''}</span>
      ${opt.label}
    </span>`;
  }).join('');

  // Build approval steps HTML (rows of 3)
  let approvalsHtml = '';
  if (approvalSteps.length > 0) {
    const rows: string[] = [];
    for (let i = 0; i < approvalSteps.length; i += 3) {
      const rowSteps = approvalSteps.slice(i, i + 3);
      const cells = rowSteps.map(step => {
        const approver = getProfile(profiles, step.approver_user_id);
        return buildApprovalStepHtml(step, approver, sigDataUrls[step.id] || null, registeredByProfiles[step.id]);
      }).join('');
      // Pad with empty cells if less than 3
      const emptyCells = Array(3 - rowSteps.length).fill('<td style="border:1px solid #333;padding:8px;"></td>').join('');
      rows.push(`<tr>${cells}${emptyCells}</tr>`);
    }
    approvalsHtml = `
      <div style="margin:16px 0;">
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

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Memo ${memo.transmittal_no}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Century Gothic', 'Arial', sans-serif; font-size: 12px; color: #1a1a1a; }
    @page { size: A4; margin: 15mm; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    table { border-collapse: collapse; }
    .header-table td { border: 1px solid #333; }
  </style>
</head>
<body>
  <div style="max-width:700px;margin:0 auto;border:1px solid #333;">
    
    <!-- HEADER -->
    <div style="display:flex;align-items:flex-end;justify-content:space-between;padding:20px 24px 16px;">
      <img src="${logoDataUrl}" style="height:100px;object-fit:contain;" />
      <div style="text-align:right;">
        <h1 style="font-size:24px;font-weight:bold;letter-spacing:2px;margin:0;">INTERNAL MEMO</h1>
        <div style="height:3px;background:#c00;margin-top:4px;"></div>
      </div>
    </div>

    <!-- TO / TRANSMITTAL / DATE / FROM -->
    <table style="width:100%;border-collapse:collapse;" class="header-table">
      <tr>
        <td style="width:50%;padding:8px 12px;vertical-align:top;">
          <p style="font-size:10px;color:#666;">TO:</p>
          <p style="font-weight:bold;margin-top:4px;">${toProfile?.full_name || '—'}</p>
          ${toProfile?.job_title ? `<p style="font-size:11px;">${toProfile.job_title}</p>` : ''}
        </td>
        <td style="width:50%;padding:0;vertical-align:top;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="background:#c00;color:#fff;padding:8px 12px;font-size:10px;font-weight:bold;width:120px;border:none;">TRANSMITTAL NO:</td>
              <td style="padding:8px 12px;font-weight:bold;font-family:monospace;border:none;">${memo.transmittal_no}</td>
            </tr>
            <tr>
              <td style="background:#c00;color:#fff;padding:8px 12px;font-size:10px;font-weight:bold;border-top:1px solid #333;border-left:none;border-bottom:none;border-right:none;">DATE:</td>
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
    <div style="border-top:1px solid #333;padding:8px 16px;">
      <p><strong>Subject:</strong> <strong>${memo.subject}</strong></p>
    </div>

    <!-- DESCRIPTION -->
    <div style="border-top:1px solid #333;padding:12px 16px;">
      <p style="font-size:10px;font-weight:bold;text-transform:uppercase;margin-bottom:8px;">Description:</p>
      <div style="font-size:11px;line-height:1.6;">${memo.description || '<p>No description.</p>'}</div>

      <!-- Sender Signature -->
      <div style="text-align:right;margin-top:32px;margin-bottom:16px;">
        <div style="display:inline-block;text-align:center;">
          ${senderSigHtml}
          <p style="font-weight:bold;font-size:11px;">${fromProfile?.full_name || '—'}, ${fromProfile?.job_title || ''}</p>
        </div>
      </div>

      <!-- Footer counts -->
      <div style="border-top:1px solid #ccc;padding-top:8px;text-align:center;font-size:10px;display:flex;justify-content:center;gap:24px;">
        <span>No. of Continuation Pages: <strong>${String(memo.continuation_pages || 0).padStart(2, '0')}</strong></span>
        <span>No. of Attachments: <strong>${String(attachments.length).padStart(2, '0')}</strong></span>
        <span style="font-weight:bold;">${memo.initials || ''}</span>
      </div>
    </div>

    <!-- COPIES TO -->
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:120px;border:1px solid #333;padding:6px 12px;font-size:10px;font-weight:bold;">COPIES TO:</td>
        <td style="border:1px solid #333;padding:6px 12px;font-size:11px;">${memo.copies_to?.join(', ') || ''}</td>
      </tr>
    </table>

    <!-- ACTION REQUIRED / COMMENTS -->
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:120px;border:1px solid #333;padding:6px 12px;font-size:10px;font-weight:bold;vertical-align:top;">
          <p>ACTION REQUIRED:</p>
          <p style="margin-top:4px;">COMMENTS IF ANY:</p>
        </td>
        <td style="border:1px solid #333;padding:6px 12px;">${commentsHtml}</td>
      </tr>
    </table>

    <!-- APPROVALS -->
    ${approvalsHtml}

    <!-- Footer -->
    <div style="padding:8px 16px;font-size:8px;color:#999;border-top:1px solid #ddd;">
      <p>HRA 09/00/T/I/01 &nbsp;&bull;&nbsp; Version 1.3 &nbsp;&bull;&nbsp; For Internal Use</p>
    </div>
  </div>
</body>
</html>`;

  // Open in new window and trigger print/save as PDF
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Popup blocked. Please allow popups for this site.');
  }
  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for images to load then print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };
  // Fallback in case onload doesn't fire
  setTimeout(() => {
    printWindow.print();
  }, 2000);
}
