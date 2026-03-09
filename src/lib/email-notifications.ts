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
 * Notify memo creator of approval/rejection
 */
export const notifyMemoStatus = async ({
  creatorEmail,
  creatorName,
  memoSubject,
  transmittalNo,
  status,
  approverName,
  memoId,
}: {
  creatorEmail: string;
  creatorName: string;
  memoSubject: string;
  transmittalNo: string;
  status: 'approved' | 'rejected' | 'rework';
  approverName: string;
  memoId: string;
}) => {
  const appUrl = window.location.origin;
  const statusLabel = status === 'approved' ? '✅ Approved' : status === 'rejected' ? '❌ Rejected' : '🔄 Rework Required';
  const statusColor = status === 'approved' ? '#16a34a' : status === 'rejected' ? '#dc2626' : '#ca8a04';

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
        <a href="${appUrl}/memos/${memoId}" style="display: inline-block; background: #1B3A5C; color: #ffffff; padding: 10px 24px; text-decoration: none; border-radius: 4px; margin-top: 8px;">View Memo</a>
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
