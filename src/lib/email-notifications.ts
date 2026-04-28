import { supabase } from '@/integrations/supabase/client';

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

interface SendEmailParams {
  to: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
}

export const sendEmail = async (params: SendEmailParams) => {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: params,
  });
  if (error) throw error;
  return data;
};

/**
 * Send approval notification to an approver
 */
export const notifyApprover = async ({
  approverEmail,
  approverName,
  memoSubject,
  transmittalNo,
  fromName,
  memoId,
}: {
  approverEmail: string;
  approverName: string;
  memoSubject: string;
  transmittalNo: string;
  fromName: string;
  memoId: string;
}) => {
  const appUrl = window.location.origin;
  const body = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1B3A5C; padding: 20px; text-align: center;">
        <h2 style="color: #C8952E; margin: 0;">Al Hamra Real Estate</h2>
        <p style="color: #ffffff; margin: 4px 0 0; font-size: 12px;">Internal Memo System</p>
      </div>
      <div style="padding: 24px; background: #ffffff; border: 1px solid #e5e7eb;">
        <p>Dear <strong>${approverName}</strong>,</p>
        <p>A memo requires your approval:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold; width: 140px;">Transmittal No</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${transmittalNo}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Subject</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${memoSubject}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">From</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${fromName}</td></tr>
        </table>
        <a href="${appUrl}/memos/${memoId}" style="display: inline-block; background: #1B3A5C; color: #ffffff; padding: 10px 24px; text-decoration: none; border-radius: 4px; margin-top: 8px;">Review Memo</a>
      </div>
      <div style="padding: 12px; text-align: center; font-size: 11px; color: #6b7280;">
        This is an automated notification from the Al Hamra Memo System.
      </div>
    </div>
  `;

  return sendEmail({
    to: [approverEmail],
    subject: `[Action Required] Memo Approval: ${transmittalNo} — ${memoSubject}`,
    body,
    isHtml: true,
  });
};

/**
 * Send reminder to an approver who hasn't acted
 */
export const sendApprovalReminder = async ({
  approverEmail,
  approverName,
  memoSubject,
  transmittalNo,
  fromName,
  memoId,
  daysPending,
}: {
  approverEmail: string;
  approverName: string;
  memoSubject: string;
  transmittalNo: string;
  fromName: string;
  memoId: string;
  daysPending: number;
}) => {
  const appUrl = window.location.origin;
  const body = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1B3A5C; padding: 20px; text-align: center;">
        <h2 style="color: #C8952E; margin: 0;">Al Hamra Real Estate</h2>
        <p style="color: #ffffff; margin: 4px 0 0; font-size: 12px;">Internal Memo System — Reminder</p>
      </div>
      <div style="padding: 24px; background: #ffffff; border: 1px solid #e5e7eb;">
        <p>Dear <strong>${approverName}</strong>,</p>
        <p>This is a reminder that the following memo has been pending your approval for <strong>${daysPending} day(s)</strong>:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold; width: 140px;">Transmittal No</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${transmittalNo}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Subject</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${memoSubject}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">From</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${fromName}</td></tr>
        </table>
        <a href="${appUrl}/memos/${memoId}" style="display: inline-block; background: #C8952E; color: #ffffff; padding: 10px 24px; text-decoration: none; border-radius: 4px; margin-top: 8px;">Review Now</a>
      </div>
      <div style="padding: 12px; text-align: center; font-size: 11px; color: #6b7280;">
        This is an automated reminder from the Al Hamra Memo System.
      </div>
    </div>
  `;

  return sendEmail({
    to: [approverEmail],
    subject: `[Reminder] Pending Approval: ${transmittalNo} — ${memoSubject}`,
    body,
    isHtml: true,
  });
};

/**
 * Notify memo creator of approval/rejection/rework
 */
export const notifyMemoStatus = async ({
  creatorEmail,
  creatorName,
  memoSubject,
  transmittalNo,
  status,
  approverName,
  memoId,
  comments,
}: {
  creatorEmail: string;
  creatorName: string;
  memoSubject: string;
  transmittalNo: string;
  status: 'approved' | 'rejected' | 'rework';
  approverName: string;
  memoId: string;
  comments?: string;
}) => {
  const appUrl = window.location.origin;
  const statusLabel = status === 'approved' ? '✅ Approved' : status === 'rejected' ? '❌ Rejected' : '🔄 Rework Required';
  const statusColor = status === 'approved' ? '#16a34a' : status === 'rejected' ? '#dc2626' : '#ca8a04';

  // Build rework/rejection comments block
  let commentsHtml = '';
  if (comments && comments.trim() && (status === 'rework' || status === 'rejected')) {
    const sectionTitle = status === 'rework' ? 'Rework Instructions' : 'Rejection Reason';
    const borderColor = status === 'rework' ? '#ca8a04' : '#dc2626';
    const bgColor = status === 'rework' ? '#fefce8' : '#fef2f2';
    const iconEmoji = status === 'rework' ? '📝' : '⚠️';

    commentsHtml = `
        <div style="margin: 16px 0; padding: 16px; background: ${bgColor}; border-left: 4px solid ${borderColor}; border-radius: 4px;">
          <p style="margin: 0 0 8px; font-weight: bold; font-size: 13px; color: ${borderColor};">${iconEmoji} ${sectionTitle} from ${approverName}:</p>
          <p style="margin: 0; font-size: 13px; color: #374151; line-height: 1.6; white-space: pre-wrap;">${comments.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </div>`;
  }

  // Build action guidance for rework
  let actionGuidanceHtml = '';
  if (status === 'rework') {
    actionGuidanceHtml = `
        <p style="margin: 12px 0 0; font-size: 13px; color: #374151;">Please review the instructions above, make the necessary changes, and resubmit the memo for approval.</p>`;
  }

  const body = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1B3A5C; padding: 20px; text-align: center;">
        <h2 style="color: #C8952E; margin: 0;">Al Hamra Real Estate</h2>
        <p style="color: #ffffff; margin: 4px 0 0; font-size: 12px;">Internal Memo System</p>
      </div>
      <div style="padding: 24px; background: #ffffff; border: 1px solid #e5e7eb;">
        <p>Dear <strong>${creatorName}</strong>,</p>
        <p>Your memo has been updated:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold; width: 140px;">Transmittal No</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${transmittalNo}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Subject</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${memoSubject}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Status</td><td style="padding: 8px; border: 1px solid #e5e7eb; color: ${statusColor}; font-weight: bold;">${statusLabel}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">By</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${approverName}</td></tr>
        </table>
        ${commentsHtml}
        ${actionGuidanceHtml}
        <a href="${appUrl}/memos/${memoId}" style="display: inline-block; background: #1B3A5C; color: #ffffff; padding: 10px 24px; text-decoration: none; border-radius: 4px; margin-top: 16px;">${status === 'rework' ? 'Edit & Resubmit Memo' : 'View Memo'}</a>
      </div>
      <div style="padding: 12px; text-align: center; font-size: 11px; color: #6b7280;">
        This is an automated notification from the Al Hamra Memo System.
      </div>
    </div>
  `;

  return sendEmail({
    to: [creatorEmail],
    subject: `Memo ${status.charAt(0).toUpperCase() + status.slice(1)}: ${transmittalNo} — ${memoSubject}`,
    body,
    isHtml: true,
  });
};

// =========================================================================
// Shared email-shell + new templates added 2026-04-28
// =========================================================================

/**
 * Wraps body content in the standard Al Hamra branded shell so every
 * outbound email looks consistent. The accentColor controls the call-to-
 * action button colour (defaults to primary navy, override for warnings/
 * payment-released emails).
 */
function emailShell({
  greetingName,
  intro,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  accentColor = '#1B3A5C',
  footerNote,
}: {
  greetingName: string;
  intro: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  accentColor?: string;
  footerNote?: string;
}): string {
  const cta = ctaLabel && ctaUrl
    ? `<a href="${ctaUrl}" style="display:inline-block;background:${accentColor};color:#ffffff;padding:10px 24px;text-decoration:none;border-radius:4px;margin-top:12px;">${ctaLabel}</a>`
    : '';
  const note = footerNote
    ? `<div style="padding:12px;text-align:center;font-size:11px;color:#6b7280;">${footerNote}</div>`
    : `<div style="padding:12px;text-align:center;font-size:11px;color:#6b7280;">This is an automated notification from the Al Hamra Memo System.</div>`;
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;">
      <div style="background:#1B3A5C;padding:20px;text-align:center;">
        <h2 style="color:#C8952E;margin:0;">Al Hamra Real Estate</h2>
        <p style="color:#ffffff;margin:4px 0 0;font-size:12px;">Internal Memo System</p>
      </div>
      <div style="padding:24px;background:#ffffff;border:1px solid #e5e7eb;">
        <p>Dear <strong>${greetingName}</strong>,</p>
        <p>${intro}</p>
        ${bodyHtml}
        ${cta}
      </div>
      ${note}
    </div>`;
}

function memoFactsTable(rows: { label: string; value: string }[]): string {
  return `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
      ${rows
        .map(
          (r) =>
            `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;width:160px;">${r.label}</td><td style="padding:8px;border:1px solid #e5e7eb;">${r.value}</td></tr>`,
        )
        .join('')}
    </table>`;
}

/**
 * Notifies the memo creator that an admin permanently deleted their memo.
 * Reason is optional but strongly encouraged.
 */
export const notifyMemoDeleted = async ({
  creatorEmail,
  creatorName,
  memoSubject,
  transmittalNo,
  deletedByName,
  reason,
}: {
  creatorEmail: string;
  creatorName: string;
  memoSubject: string;
  transmittalNo: string;
  deletedByName: string;
  reason?: string;
}) => {
  const reasonBlock = reason?.trim()
    ? `<div style="margin:16px 0;padding:16px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px;">
         <p style="margin:0 0 6px;font-weight:bold;font-size:13px;color:#dc2626;">Reason given by ${deletedByName}:</p>
         <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap;">${reason.replace(/</g, '&lt;')}</p>
       </div>`
    : `<p style="font-size:13px;color:#6b7280;font-style:italic;">No reason was provided. Please contact ${deletedByName} for details.</p>`;

  const body = emailShell({
    greetingName: creatorName,
    intro: 'A memo you created has been permanently deleted by an administrator.',
    bodyHtml:
      memoFactsTable([
        { label: 'Transmittal No', value: transmittalNo },
        { label: 'Subject',        value: memoSubject },
        { label: 'Deleted by',     value: deletedByName },
      ]) + reasonBlock,
    accentColor: '#dc2626',
    footerNote: 'If you believe this deletion was made in error, please contact your administrator immediately. The memo cannot be recovered from the user interface.',
  });

  return sendEmail({
    to: [creatorEmail],
    subject: `Memo Deleted: ${transmittalNo} — ${memoSubject}`,
    body,
    isHtml: true,
  });
};

/**
 * Sent to the memo creator when their PAYMENT memo reaches full approval.
 * Includes explicit instructions to deliver original documents to Finance
 * + a link to print the cover sheet.
 */
export const notifyPaymentMemoApprovedToCreator = async ({
  creatorEmail,
  creatorName,
  memoSubject,
  transmittalNo,
  memoId,
}: {
  creatorEmail: string;
  creatorName: string;
  memoSubject: string;
  transmittalNo: string;
  memoId: string;
}) => {
  const appUrl = window.location.origin;
  const body = emailShell({
    greetingName: creatorName,
    intro:
      'Your payment memo has been fully approved by all required approvers. Before Finance can release payment, please deliver the original physical documents (invoice, delivery note, GRN, supporting paperwork) to the Finance Reception desk.',
    bodyHtml:
      memoFactsTable([
        { label: 'Transmittal No', value: transmittalNo },
        { label: 'Subject',        value: memoSubject },
        { label: 'Status',         value: '<span style="color:#16a34a;font-weight:bold;">✅ Approved — Awaiting Originals</span>' },
      ]) +
      `<div style="margin:16px 0;padding:16px;background:#f0f9ff;border-left:4px solid #1B3A5C;border-radius:4px;">
         <p style="margin:0 0 6px;font-weight:bold;font-size:13px;">Next step</p>
         <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">
           Print the cover sheet from the memo page below, attach it to your physical originals, and hand the bundle to Finance Reception. Finance will stamp the receipt portion and confirm in the system; you will receive a separate email when they do.
         </p>
       </div>`,
    ctaLabel: 'Open Memo & Print Cover Sheet',
    ctaUrl: `${appUrl}/memos/${memoId}`,
    accentColor: '#1B3A5C',
  });

  return sendEmail({
    to: [creatorEmail],
    subject: `[Action Required] Submit Originals to Finance: ${transmittalNo} — ${memoSubject}`,
    body,
    isHtml: true,
  });
};

/**
 * Sent to ALL finance-team members when a payment memo is fully approved
 * so they know originals are coming.
 */
export const notifyFinanceOnPaymentMemoApproved = async ({
  financeRecipients,
  memoSubject,
  transmittalNo,
  fromName,
  memoId,
}: {
  financeRecipients: { email: string; name: string }[];
  memoSubject: string;
  transmittalNo: string;
  fromName: string;
  memoId: string;
}) => {
  if (financeRecipients.length === 0) return;
  const appUrl = window.location.origin;
  const body = emailShell({
    greetingName: 'Finance Team',
    intro: 'A payment memo has been fully approved and is now in the payment-handoff queue. The creator has been instructed to deliver original documents to Finance Reception.',
    bodyHtml: memoFactsTable([
      { label: 'Transmittal No', value: transmittalNo },
      { label: 'Subject',        value: memoSubject },
      { label: 'Submitted by',   value: fromName },
      { label: 'Stage',          value: '⏳ Awaiting Originals' },
    ]),
    ctaLabel: 'Open Payment Queue',
    ctaUrl: `${appUrl}/finance/payments`,
  });

  return sendEmail({
    to: financeRecipients.map((r) => r.email),
    subject: `[Finance] Payment Memo Approved — Awaiting Originals: ${transmittalNo}`,
    body,
    isHtml: true,
  });
};

/**
 * Sent to the memo creator when Finance has confirmed receipt of the
 * physical originals. Acts as the digital receipt.
 */
export const notifyOriginalsReceived = async ({
  creatorEmail,
  creatorName,
  memoSubject,
  transmittalNo,
  receivedByName,
  receivedAt,
  notes,
  memoId,
}: {
  creatorEmail: string;
  creatorName: string;
  memoSubject: string;
  transmittalNo: string;
  receivedByName: string;
  receivedAt: string;
  notes?: string;
  memoId: string;
}) => {
  const appUrl = window.location.origin;
  const notesBlock = notes?.trim()
    ? `<div style="margin:16px 0;padding:12px;background:#fefce8;border-left:4px solid #ca8a04;border-radius:4px;">
         <p style="margin:0 0 4px;font-weight:bold;font-size:12px;color:#92400e;">Notes from Finance:</p>
         <p style="margin:0;font-size:12px;color:#374151;line-height:1.5;white-space:pre-wrap;">${notes.replace(/</g, '&lt;')}</p>
       </div>`
    : '';
  const body = emailShell({
    greetingName: creatorName,
    intro: 'Finance has confirmed receipt of the original documents for your payment memo. This email is your digital receipt — please retain it for your records.',
    bodyHtml:
      memoFactsTable([
        { label: 'Transmittal No',    value: transmittalNo },
        { label: 'Subject',           value: memoSubject },
        { label: 'Received by',       value: receivedByName },
        { label: 'Received at',       value: new Date(receivedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) },
        { label: 'Status',            value: '🧾 Awaiting Payment' },
      ]) + notesBlock,
    ctaLabel: 'View Memo',
    ctaUrl: `${appUrl}/memos/${memoId}`,
    accentColor: '#16a34a',
    footerNote: 'This is your official receipt of physical document handover. Keep this email for your records. Finance will release payment shortly and you will receive a final confirmation when they do.',
  });

  return sendEmail({
    to: [creatorEmail],
    subject: `[Receipt] Originals Received by Finance: ${transmittalNo} — ${memoSubject}`,
    body,
    isHtml: true,
  });
};

/**
 * Sent to the memo creator when Finance has released the payment.
 */
export const notifyPaymentReleased = async ({
  creatorEmail,
  creatorName,
  memoSubject,
  transmittalNo,
  releasedByName,
  paidAt,
  paymentMethod,
  paymentReference,
  paymentNotes,
  memoId,
}: {
  creatorEmail: string;
  creatorName: string;
  memoSubject: string;
  transmittalNo: string;
  releasedByName: string;
  paidAt: string;
  paymentMethod: string;
  paymentReference: string | null;
  paymentNotes?: string | null;
  memoId: string;
}) => {
  const appUrl = window.location.origin;
  const notesBlock = paymentNotes?.trim()
    ? `<div style="margin:16px 0;padding:12px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:4px;">
         <p style="margin:0 0 4px;font-weight:bold;font-size:12px;color:#166534;">Notes from Finance:</p>
         <p style="margin:0;font-size:12px;color:#374151;line-height:1.5;white-space:pre-wrap;">${paymentNotes.replace(/</g, '&lt;')}</p>
       </div>`
    : '';
  const niceMethod = paymentMethod.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const body = emailShell({
    greetingName: creatorName,
    intro: 'Finance has released the payment for your memo. The transaction details below are also available on the memo page.',
    bodyHtml:
      memoFactsTable([
        { label: 'Transmittal No',     value: transmittalNo },
        { label: 'Subject',            value: memoSubject },
        { label: 'Payment Method',     value: niceMethod },
        { label: 'Payment Reference',  value: paymentReference || '—' },
        { label: 'Released by',        value: releasedByName },
        { label: 'Released at',        value: new Date(paidAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) },
        { label: 'Status',             value: '<span style="color:#16a34a;font-weight:bold;">💰 Paid</span>' },
      ]) + notesBlock,
    ctaLabel: 'View Memo',
    ctaUrl: `${appUrl}/memos/${memoId}`,
    accentColor: '#16a34a',
  });

  return sendEmail({
    to: [creatorEmail],
    subject: `[Paid] Payment Released: ${transmittalNo} — ${memoSubject}`,
    body,
    isHtml: true,
  });
};
