// =====================================================================
// Vendor Email Templates
// =====================================================================
//
// Bilingual (English + Arabic) email templates for the vendor master
// lifecycle. Every email contains BOTH languages — English first,
// Arabic second, with a soft divider between them. The vendor's
// browser/email client doesn't need to support Arabic for the
// English to render.
//
// CRITICAL: NO SAP terminology in any vendor-facing copy.
// Vendors don't care about our internal SAP setup. They care about
// "am I registered" and "can I send invoices." We use the
// vendor-facing reference number (AHR-VEND-XXXXX) instead of the
// internal sap_vendor_code.
//
// Templates here:
//   1. registrationReceived     — submission ack with reference no.
//   2. approvedActive           — approved + ready to transact
//   3. registrationRejected     — rejected with reason
//   4. updateProcessed          — update applied
//   5. documentExpiring         — expiry reminder (60/30/14/7 day windows)
//   6. credentialsMagicLink     — login portal access via magic link
//
// Each function returns { subject, html } ready to feed to the
// existing `send-email` edge function.
// =====================================================================

import { brandedEmailShell, BRAND } from './email-brand.ts';

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/** Wraps Arabic content with dir=rtl + Arabic-friendly font fallback. */
function ar(html: string): string {
  return `<div dir="rtl" style="text-align:right;font-family:'Tahoma','Arial',sans-serif;font-size:14px;line-height:1.7;">${html}</div>`;
}

/** Soft divider between EN and AR sections. */
const divider = `<div style="margin:24px 0;border-top:1px solid ${BRAND.greyLight};height:1px;"></div>`;

interface BilingualEmail {
  subject: string;
  html: string;
}

// ---------------------------------------------------------------------
// 1. Registration received
// ---------------------------------------------------------------------

export function emailRegistrationReceived(opts: {
  vendorName: string;
  vendorReferenceNo: string;
  contactName: string;
}): BilingualEmail {
  const { vendorName, vendorReferenceNo, contactName } = opts;

  const subject = `Registration received — ${vendorReferenceNo} | تم استلام طلب التسجيل`;

  const enBody = `
    <p>Dear ${contactName},</p>
    <p>Thank you for registering as a supplier with Al Hamra Real Estate.
    Your registration has been received and is now under review by our procurement team.</p>
    <p><strong>Your reference number: ${vendorReferenceNo}</strong></p>
    <p>Please keep this reference for any correspondence about your registration.
    You will receive an email once your registration has been reviewed.</p>
    <p>Best regards,<br/>Al Hamra Real Estate</p>
  `;

  const arBody = ar(`
    <p>عزيزي ${contactName}،</p>
    <p>شكرًا لتسجيلكم كمورد لدى شركة الحمرا العقارية.
    لقد تم استلام طلب التسجيل الخاص بكم، وهو الآن قيد المراجعة من قبل فريق المشتريات.</p>
    <p><strong>الرقم المرجعي الخاص بكم: ${vendorReferenceNo}</strong></p>
    <p>يرجى الاحتفاظ بهذا الرقم لأي مراسلات تتعلق بطلب التسجيل.
    سوف تتلقون رسالة بريد إلكتروني فور الانتهاء من المراجعة.</p>
    <p>مع أطيب التحيات،<br/>شركة الحمرا العقارية</p>
  `);

  const html = brandedEmailShell({
    greetingName: contactName,
    intro: `Registration received for ${vendorName}`,
    bodyHtml: enBody + divider + arBody,
    subtitle: 'Supplier Registration',
  });

  return { subject, html };
}

// ---------------------------------------------------------------------
// 2. Approved and active
// ---------------------------------------------------------------------

export function emailApprovedActive(opts: {
  vendorName: string;
  vendorReferenceNo: string;
  contactName: string;
  portalLoginUrl: string;
}): BilingualEmail {
  const { vendorName, vendorReferenceNo, contactName, portalLoginUrl } = opts;

  const subject = `Your supplier registration is complete | اكتمل تسجيلكم كمورد`;

  const enBody = `
    <p>Dear ${contactName},</p>
    <p>We are pleased to confirm that <strong>${vendorName}</strong> is now an approved
    supplier with Al Hamra Real Estate.</p>
    <p><strong>Your supplier reference: ${vendorReferenceNo}</strong></p>
    <p>Please quote this reference number on all invoices and correspondence with us.</p>
    <p>You can now log in to the supplier portal to keep your details up to date.
    A separate email with your login credentials has been sent.</p>
    <p>Best regards,<br/>Al Hamra Real Estate</p>
  `;

  const arBody = ar(`
    <p>عزيزي ${contactName}،</p>
    <p>يسعدنا أن نؤكد بأن <strong>${vendorName}</strong> أصبح الآن موردًا معتمدًا
    لدى شركة الحمرا العقارية.</p>
    <p><strong>الرقم المرجعي للمورد: ${vendorReferenceNo}</strong></p>
    <p>يرجى ذكر هذا الرقم المرجعي في جميع الفواتير والمراسلات معنا.</p>
    <p>يمكنكم الآن تسجيل الدخول إلى بوابة الموردين لتحديث بياناتكم.
    سوف تتلقون رسالة منفصلة تحتوي على بيانات الدخول.</p>
    <p>مع أطيب التحيات،<br/>شركة الحمرا العقارية</p>
  `);

  const html = brandedEmailShell({
    greetingName: contactName,
    intro: `Welcome — ${vendorName} is now an approved supplier`,
    bodyHtml: enBody + divider + arBody,
    ctaLabel: 'Open Supplier Portal',
    ctaUrl: portalLoginUrl,
    subtitle: 'Supplier Registration',
  });

  return { subject, html };
}

// ---------------------------------------------------------------------
// 3. Registration rejected
// ---------------------------------------------------------------------

export function emailRegistrationRejected(opts: {
  vendorName: string;
  vendorReferenceNo: string;
  contactName: string;
  reasonEn: string;
  reasonAr?: string;
}): BilingualEmail {
  const { vendorName, vendorReferenceNo, contactName, reasonEn, reasonAr } = opts;
  const reasonArDisplay = reasonAr || reasonEn;

  const subject = `Update on your registration — ${vendorReferenceNo} | تحديث بشأن طلب التسجيل`;

  const enBody = `
    <p>Dear ${contactName},</p>
    <p>Thank you for your interest in becoming a supplier with Al Hamra Real Estate.
    After reviewing your registration for <strong>${vendorName}</strong> (reference: ${vendorReferenceNo}),
    we are unable to approve it at this time.</p>
    <p><strong>Reason:</strong></p>
    <p style="background:${BRAND.greyLight};padding:12px;border-left:4px solid ${BRAND.red};">${reasonEn}</p>
    <p>If you would like to address the issue and resubmit, please contact our procurement team.</p>
    <p>Best regards,<br/>Al Hamra Real Estate</p>
  `;

  const arBody = ar(`
    <p>عزيزي ${contactName}،</p>
    <p>نشكركم لاهتمامكم بأن تصبحوا موردًا لدى شركة الحمرا العقارية.
    بعد مراجعة طلب تسجيل <strong>${vendorName}</strong> (الرقم المرجعي: ${vendorReferenceNo})،
    نأسف لإبلاغكم بأنه لا يمكننا الموافقة على الطلب في هذا الوقت.</p>
    <p><strong>السبب:</strong></p>
    <p style="background:${BRAND.greyLight};padding:12px;border-right:4px solid ${BRAND.red};">${reasonArDisplay}</p>
    <p>إذا كنتم ترغبون في معالجة الأمر وإعادة التقديم، يرجى التواصل مع فريق المشتريات.</p>
    <p>مع أطيب التحيات،<br/>شركة الحمرا العقارية</p>
  `);

  const html = brandedEmailShell({
    greetingName: contactName,
    intro: `Registration update — ${vendorName}`,
    bodyHtml: enBody + divider + arBody,
    subtitle: 'Supplier Registration',
  });

  return { subject, html };
}

// ---------------------------------------------------------------------
// 4. Update processed
// ---------------------------------------------------------------------

export function emailUpdateProcessed(opts: {
  vendorName: string;
  vendorReferenceNo: string;
  contactName: string;
}): BilingualEmail {
  const { vendorName, vendorReferenceNo, contactName } = opts;

  const subject = `Your update has been processed — ${vendorReferenceNo} | تمت معالجة التحديث`;

  const enBody = `
    <p>Dear ${contactName},</p>
    <p>The update you submitted for <strong>${vendorName}</strong> has been
    reviewed and applied to your supplier record.</p>
    <p><strong>Reference: ${vendorReferenceNo}</strong></p>
    <p>If you have further changes, please log in to the supplier portal
    or contact our procurement team.</p>
    <p>Best regards,<br/>Al Hamra Real Estate</p>
  `;

  const arBody = ar(`
    <p>عزيزي ${contactName}،</p>
    <p>تمت مراجعة التحديث الذي قدمتموه لـ <strong>${vendorName}</strong>
    وتطبيقه على سجل المورد الخاص بكم.</p>
    <p><strong>الرقم المرجعي: ${vendorReferenceNo}</strong></p>
    <p>إذا كانت لديكم تغييرات إضافية، يرجى تسجيل الدخول إلى بوابة الموردين
    أو التواصل مع فريق المشتريات.</p>
    <p>مع أطيب التحيات،<br/>شركة الحمرا العقارية</p>
  `);

  const html = brandedEmailShell({
    greetingName: contactName,
    intro: `Update processed — ${vendorName}`,
    bodyHtml: enBody + divider + arBody,
    subtitle: 'Supplier Registration',
  });

  return { subject, html };
}

// ---------------------------------------------------------------------
// 5. Document expiring
// ---------------------------------------------------------------------

export function emailDocumentExpiring(opts: {
  vendorName: string;
  vendorReferenceNo: string;
  contactName: string;
  documentLabelEn: string;
  documentLabelAr: string;
  expiryDate: string;     // formatted, e.g. "30 Jun 2026"
  daysRemaining: number;  // can be negative if already expired
  portalLoginUrl: string;
}): BilingualEmail {
  const { vendorName, vendorReferenceNo, contactName, documentLabelEn,
          documentLabelAr, expiryDate, daysRemaining, portalLoginUrl } = opts;

  const expired = daysRemaining < 0;
  const subject = expired
    ? `Document expired — please renew | انتهت صلاحية المستند — يرجى التجديد`
    : `Document expiring in ${daysRemaining} days — please renew | المستند ينتهي خلال ${daysRemaining} يومًا`;

  const enUrgency = expired
    ? `<strong style="color:${BRAND.red};">This document has expired.</strong> To avoid interruption, please upload a current version as soon as possible.`
    : `This document expires in <strong>${daysRemaining} days</strong>. Please upload a current version before the expiry date.`;

  const arUrgency = expired
    ? `<strong style="color:${BRAND.red};">انتهت صلاحية هذا المستند.</strong> لتجنب توقف التعاملات، يرجى رفع نسخة سارية في أقرب وقت ممكن.`
    : `ينتهي هذا المستند خلال <strong>${daysRemaining} يومًا</strong>. يرجى رفع نسخة سارية قبل تاريخ الانتهاء.`;

  const enBody = `
    <p>Dear ${contactName},</p>
    <p>This is a reminder that one of your registered documents is approaching its expiry date.</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;">
      <tr><td style="padding:6px 0;color:#666;">Supplier:</td><td style="padding:6px 0;"><strong>${vendorName}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#666;">Reference:</td><td style="padding:6px 0;">${vendorReferenceNo}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Document:</td><td style="padding:6px 0;"><strong>${documentLabelEn}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#666;">Expires on:</td><td style="padding:6px 0;"><strong>${expiryDate}</strong></td></tr>
    </table>
    <p>${enUrgency}</p>
  `;

  const arBody = ar(`
    <p>عزيزي ${contactName}،</p>
    <p>هذا تذكير بأن أحد المستندات المسجلة لديكم يقترب من تاريخ انتهاء صلاحيته.</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;">
      <tr><td style="padding:6px 0;color:#666;">المورد:</td><td style="padding:6px 0;"><strong>${vendorName}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#666;">الرقم المرجعي:</td><td style="padding:6px 0;">${vendorReferenceNo}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">المستند:</td><td style="padding:6px 0;"><strong>${documentLabelAr}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#666;">تاريخ الانتهاء:</td><td style="padding:6px 0;"><strong>${expiryDate}</strong></td></tr>
    </table>
    <p>${arUrgency}</p>
  `);

  const html = brandedEmailShell({
    greetingName: contactName,
    intro: expired ? `Action required — document expired` : `Reminder — document expiring soon`,
    bodyHtml: enBody + divider + arBody,
    ctaLabel: 'Upload Renewed Document',
    ctaUrl: portalLoginUrl,
    accentColor: expired ? BRAND.red : undefined,
    subtitle: 'Supplier Documents',
  });

  return { subject, html };
}

// ---------------------------------------------------------------------
// 6. Magic-link credentials (vendor portal access)
// ---------------------------------------------------------------------

export function emailCredentialsMagicLink(opts: {
  vendorName: string;
  vendorReferenceNo: string;
  contactName: string;
  magicLinkUrl: string;
}): BilingualEmail {
  const { vendorName, vendorReferenceNo, contactName, magicLinkUrl } = opts;

  const subject = `Set up your supplier portal access | إعداد دخولكم إلى بوابة الموردين`;

  const enBody = `
    <p>Dear ${contactName},</p>
    <p>To complete your supplier portal setup for <strong>${vendorName}</strong>
    (reference: ${vendorReferenceNo}), please use the secure link below to set
    your password and sign in.</p>
    <p>The link expires after a short time, so please use it soon. If it expires,
    contact our procurement team for a fresh link.</p>
    <p>Best regards,<br/>Al Hamra Real Estate</p>
  `;

  const arBody = ar(`
    <p>عزيزي ${contactName}،</p>
    <p>لإكمال إعداد بوابة الموردين الخاصة بـ <strong>${vendorName}</strong>
    (الرقم المرجعي: ${vendorReferenceNo})، يرجى استخدام الرابط الآمن أدناه
    لتعيين كلمة المرور وتسجيل الدخول.</p>
    <p>تنتهي صلاحية الرابط بعد فترة قصيرة، لذا يرجى استخدامه قريبًا.
    إذا انتهت صلاحيته، يرجى التواصل مع فريق المشتريات للحصول على رابط جديد.</p>
    <p>مع أطيب التحيات،<br/>شركة الحمرا العقارية</p>
  `);

  const html = brandedEmailShell({
    greetingName: contactName,
    intro: 'Set up your supplier portal access',
    bodyHtml: enBody + divider + arBody,
    ctaLabel: 'Set Password & Sign In',
    ctaUrl: magicLinkUrl,
    subtitle: 'Supplier Portal',
  });

  return { subject, html };
}

// ---------------------------------------------------------------------
// 7. Procurement requests changes (batched per-attachment review)
// ---------------------------------------------------------------------

interface AttachmentReviewItem {
  documentLabelEn: string;
  documentLabelAr: string;
  status: 'rejected' | 'clarification_requested';
  reasonOrQuestion: string;
}

export function emailChangesRequested(opts: {
  vendorName: string;
  vendorReferenceNo: string;
  contactName: string;
  items: AttachmentReviewItem[];
  portalLoginUrl: string;
}): BilingualEmail {
  const { vendorName, vendorReferenceNo, contactName, items, portalLoginUrl } = opts;
  const subject = `Action needed on your registration — ${vendorReferenceNo} | مطلوب إجراء على طلب التسجيل`;

  const itemsEnHtml = items.map((it) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;">
        <strong>${it.documentLabelEn}</strong>
        <span style="color:${it.status === 'rejected' ? BRAND.red : '#996600'};font-size:11px;display:block;margin-top:2px;">
          ${it.status === 'rejected' ? 'Please replace this file' : 'Clarification requested'}
        </span>
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;color:#444;">${it.reasonOrQuestion}</td>
    </tr>`).join('');

  const itemsArHtml = items.map((it) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;">
        <strong>${it.documentLabelAr}</strong>
        <span style="color:${it.status === 'rejected' ? BRAND.red : '#996600'};font-size:11px;display:block;margin-top:2px;">
          ${it.status === 'rejected' ? 'يرجى استبدال هذا الملف' : 'مطلوب توضيح'}
        </span>
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;color:#444;">${it.reasonOrQuestion}</td>
    </tr>`).join('');

  const enBody = `
    <p>Dear ${contactName},</p>
    <p>Our procurement team has reviewed your registration for <strong>${vendorName}</strong>
    (reference: ${vendorReferenceNo}) and needs a few adjustments before we can proceed.</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;border-top:1px solid #eee;">
      ${itemsEnHtml}
    </table>
    <p>Please log in to the supplier portal to address each item — you can reply with comments
    or upload a replacement file directly.</p>
  `;

  const arBody = ar(`
    <p>عزيزي ${contactName}،</p>
    <p>قام فريق المشتريات لدينا بمراجعة طلب تسجيلكم لـ <strong>${vendorName}</strong>
    (الرقم المرجعي: ${vendorReferenceNo}) ويحتاج إلى بعض التعديلات قبل أن نتمكن من المتابعة.</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;border-top:1px solid #eee;">
      ${itemsArHtml}
    </table>
    <p>يرجى تسجيل الدخول إلى بوابة الموردين لمعالجة كل عنصر — يمكنكم الرد بتعليقات
    أو رفع ملف بديل مباشرة.</p>
  `);

  const html = brandedEmailShell({
    greetingName: contactName,
    intro: `Action needed — ${vendorName}`,
    bodyHtml: enBody + divider + arBody,
    ctaLabel: 'Open Supplier Portal',
    ctaUrl: portalLoginUrl,
    subtitle: 'Supplier Registration',
  });

  return { subject, html };
}

// ---------------------------------------------------------------------
// 8. Vendor responded — alert to procurement (English-only, internal)
// ---------------------------------------------------------------------

export function emailVendorResponded(opts: {
  vendorName: string;
  vendorReferenceNo: string;
  revisionRound: number;
  vendorAdminUrl: string;
}): BilingualEmail {
  const { vendorName, vendorReferenceNo, revisionRound, vendorAdminUrl } = opts;
  const subject = `Vendor responded — please re-review: ${vendorReferenceNo}`;

  const html = brandedEmailShell({
    greetingName: 'Procurement',
    intro: `Vendor responded — ${vendorName}`,
    bodyHtml: `
      <p><strong>${vendorName}</strong> (${vendorReferenceNo}) has addressed
      your feedback and resubmitted their documents.</p>
      <p>This is revision round <strong>${revisionRound}</strong>.${
        revisionRound >= 5
          ? ' This vendor has been through several rounds — consider whether further iteration is productive, or whether a phone call would resolve outstanding items faster.'
          : ''
      }</p>
      <p>Please review the updated attachments and any messages they posted on the threads.</p>
    `,
    ctaLabel: 'Review Vendor',
    ctaUrl: vendorAdminUrl,
    subtitle: 'Supplier Registration',
  });
  return { subject, html };
}
