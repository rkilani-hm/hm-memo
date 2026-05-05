// =====================================================================
// Vendor API helpers
// =====================================================================
//
// Shared types, fetch functions, and label maps for the vendor master
// module. Used by both /admin/vendors* pages and the vendor portal.
// =====================================================================

import { supabase } from '@/integrations/supabase/client';

export type VendorStatus =
  | 'draft'
  | 'submitted'
  | 'approved_pending_sap_creation'
  | 'active_in_sap'
  | 'update_submitted'
  | 'update_approved_pending_sap_update'
  | 'sap_update_completed'
  | 'sap_update_failed_needs_correction'
  | 'rejected'
  | 'inactive'
  | 'blocked_documents_expired'
  | 'awaiting_vendor_response';

export interface VendorRow {
  id: string;
  vendor_reference_no: string;
  vendor_type_id: string;
  status: VendorStatus;
  legal_name_en: string;
  legal_name_ar: string | null;
  trading_name: string | null;
  country: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  contact_position: string | null;
  // ... (other fields used as needed; we pull * in queries)
  [key: string]: any;
}

export interface VendorType {
  id: string;
  code: string;
  label_en: string;
  label_ar: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

export interface DocumentType {
  id: string;
  code: string;
  label_en: string;
  label_ar: string;
  description_en: string | null;
  description_ar: string | null;
  has_expiry: boolean;
  ai_check_hints: string | null;
  display_order: number;
}

export interface VendorDocumentRequirement {
  id: string;
  vendor_type_id: string;
  document_type_id: string;
  is_required: boolean;
  is_conditional: boolean;
  condition_label_en: string | null;
  condition_label_ar: string | null;
  display_order: number;
  document_type?: DocumentType;
}

export interface VendorAttachment {
  id: string;
  vendor_id: string;
  document_type_id: string | null;
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_mime_type: string | null;
  ai_verdict: 'pending' | 'accepted' | 'rejected' | 'soft_pending';
  ai_summary: string | null;
  ai_findings: any;
  ai_rejection_reason: string | null;
  ai_analysed_at: string | null;
  extracted_expiry_date: string | null;
  expiry_date: string | null;
  expiry_source: string | null;
  uploaded_at: string;
}

// Display labels for statuses (admin side keeps full SAP terminology;
// vendor side gets the simpler labels via vendorFacingStatusLabel).
export const STATUS_LABELS: Record<VendorStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved_pending_sap_creation: 'Approved — Pending SAP Creation',
  active_in_sap: 'Active in SAP',
  update_submitted: 'Update Submitted',
  update_approved_pending_sap_update: 'Update Approved — Pending SAP Update',
  sap_update_completed: 'SAP Update Completed',
  sap_update_failed_needs_correction: 'SAP Update Failed — Needs Correction',
  rejected: 'Rejected',
  inactive: 'Inactive',
  blocked_documents_expired: 'Blocked — Documents Expired',
};

// Vendor-facing status labels — NO SAP terminology
export function vendorFacingStatusLabel(s: VendorStatus): { en: string; ar: string } {
  switch (s) {
    case 'draft':
      return { en: 'Draft', ar: 'مسودة' };
    case 'submitted':
      return { en: 'Under review', ar: 'قيد المراجعة' };
    case 'approved_pending_sap_creation':
      return { en: 'Approved — being set up', ar: 'تمت الموافقة — قيد الإعداد' };
    case 'active_in_sap':
    case 'sap_update_completed':
      return { en: 'Active supplier', ar: 'مورد فعّال' };
    case 'update_submitted':
    case 'update_approved_pending_sap_update':
      return { en: 'Update under review', ar: 'التحديث قيد المراجعة' };
    case 'rejected':
      return { en: 'Not approved', ar: 'غير معتمد' };
    case 'inactive':
      return { en: 'Inactive', ar: 'غير نشط' };
    case 'blocked_documents_expired':
      return { en: 'Action required — documents expired', ar: 'مطلوب إجراء — انتهت صلاحية المستندات' };
    case 'sap_update_failed_needs_correction':
      return { en: 'Update needs correction', ar: 'التحديث يحتاج إلى تصحيح' };
    default:
      return { en: s, ar: s };
  }
}

export function statusBadgeVariant(s: VendorStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (s) {
    case 'active_in_sap':
    case 'sap_update_completed':
      return 'default';  // success-ish
    case 'rejected':
    case 'blocked_documents_expired':
    case 'sap_update_failed_needs_correction':
      return 'destructive';
    case 'inactive':
      return 'outline';
    default:
      return 'secondary';
  }
}

// ---------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------

export async function fetchVendors(opts: { includeDeleted?: boolean } = {}): Promise<VendorRow[]> {
  let q = supabase
    .from('vendors' as any)
    .select('*')
    .order('created_at', { ascending: false });
  if (!opts.includeDeleted) {
    q = q.is('deleted_at', null);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data as any) || [];
}

export async function fetchVendorById(id: string): Promise<VendorRow | null> {
  const { data, error } = await supabase
    .from('vendors' as any)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

export async function fetchVendorTypes(): Promise<VendorType[]> {
  const { data, error } = await supabase
    .from('vendor_types' as any)
    .select('*')
    .eq('is_active', true)
    .order('display_order');
  if (error) throw error;
  return (data as any) || [];
}

export async function fetchDocumentTypes(): Promise<DocumentType[]> {
  const { data, error } = await supabase
    .from('document_types' as any)
    .select('*')
    .eq('is_active', true)
    .order('display_order');
  if (error) throw error;
  return (data as any) || [];
}

export async function fetchRequirementsForType(vendorTypeId: string): Promise<(VendorDocumentRequirement & { document_type: DocumentType })[]> {
  const { data, error } = await supabase
    .from('vendor_document_requirements' as any)
    .select('*, document_type:document_types(*)')
    .eq('vendor_type_id', vendorTypeId)
    .order('display_order');
  if (error) throw error;
  return (data as any) || [];
}

export async function fetchAttachmentsForVendor(vendorId: string): Promise<VendorAttachment[]> {
  const { data, error } = await supabase
    .from('vendor_attachments' as any)
    .select('*')
    .eq('vendor_id', vendorId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data as any) || [];
}

export async function fetchAuditLogForVendor(vendorId: string) {
  const { data, error } = await supabase
    .from('vendor_audit_log' as any)
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as any) || [];
}

// ---------------------------------------------------------------------
// State machine invocation
// ---------------------------------------------------------------------

export async function invokeStatusTransition(args: {
  vendor_id: string;
  action: string;
  payload?: any;
}): Promise<{ ok?: boolean; status?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('vendor-status-transition', {
    body: args,
  });
  if (error) return { error: error.message };
  return data as any;
}

export async function invokeDocumentReview(attachmentId: string): Promise<any> {
  const { data, error } = await supabase.functions.invoke('vendor-document-review', {
    body: { attachment_id: attachmentId },
  });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------
// Per-attachment review actions
// ---------------------------------------------------------------------

export type AttachmentHumanStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'clarification_requested';

export interface AttachmentMessage {
  id: string;
  attachment_id: string;
  vendor_id: string;
  author_kind: 'procurement' | 'vendor';
  author_user_id: string | null;
  message: string;
  read_by_other_at: string | null;
  created_at: string;
}

/** Status-label mapping for human review status, vendor-facing.
 *  Note: NOT shown to vendors verbatim — used in the portal UI. */
export const HUMAN_STATUS_LABEL: Record<AttachmentHumanStatus, { en: string; ar: string }> = {
  pending_review:          { en: 'Awaiting our review', ar: 'بانتظار مراجعتنا' },
  approved:                { en: 'Approved',            ar: 'تمت الموافقة' },
  rejected:                { en: 'Replace this file',   ar: 'يرجى استبدال هذا الملف' },
  clarification_requested: { en: 'We have a question',  ar: 'لدينا استفسار' },
};

export async function setAttachmentHumanStatus(args: {
  attachment_id: string;
  status: AttachmentHumanStatus;
  reason?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('vendor-attachment-review', {
    body: {
      action: 'set_human_status',
      attachment_id: args.attachment_id,
      payload: { status: args.status, reason: args.reason || null },
    },
  });
  if (error) return { error: error.message };
  return data as any;
}

export async function batchSendToVendor(vendor_id: string): Promise<{ ok?: boolean; error?: string; status?: string; message?: string; items_sent?: number }> {
  const { data, error } = await supabase.functions.invoke('vendor-attachment-review', {
    body: { action: 'batch_send_to_vendor', vendor_id },
  });
  if (error) return { error: error.message };
  return data as any;
}

export async function vendorResubmit(vendor_id: string): Promise<{ ok?: boolean; error?: string; revision_round?: number }> {
  const { data, error } = await supabase.functions.invoke('vendor-attachment-review', {
    body: { action: 'vendor_resubmit', vendor_id },
  });
  if (error) return { error: error.message };
  return data as any;
}

export async function postAttachmentMessage(args: {
  attachment_id: string;
  message: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('vendor-attachment-review', {
    body: {
      action: 'post_message',
      attachment_id: args.attachment_id,
      payload: { message: args.message },
    },
  });
  if (error) return { error: error.message };
  return data as any;
}

export async function fetchMessagesForAttachment(attachmentId: string): Promise<AttachmentMessage[]> {
  const { data, error } = await supabase
    .from('vendor_attachment_messages' as any)
    .select('*')
    .eq('attachment_id', attachmentId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as any) || [];
}

// ---------------------------------------------------------------------
// Memo templates
// ---------------------------------------------------------------------

export interface MemoTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  subject_text: string | null;
  body_html: string | null;
  action_comments: string | null;
  memo_types: string[] | null;
  created_at: string;
  updated_at: string;
}

export async function fetchMyTemplates(): Promise<MemoTemplate[]> {
  const { data, error } = await supabase
    .from('memo_templates' as any)
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as any) || [];
}

export async function saveTemplate(args: {
  id?: string;            // omit for create
  name: string;
  description?: string | null;
  subject_text?: string | null;
  body_html?: string | null;
  action_comments?: string | null;
  memo_types?: string[] | null;
}): Promise<MemoTemplate> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  if (args.id) {
    const { data, error } = await supabase
      .from('memo_templates' as any)
      .update({
        name: args.name,
        description: args.description ?? null,
        subject_text: args.subject_text ?? null,
        body_html: args.body_html ?? null,
        action_comments: args.action_comments ?? null,
        memo_types: args.memo_types ?? null,
      } as any)
      .eq('id', args.id)
      .select('*')
      .single();
    if (error) throw error;
    return data as any;
  } else {
    const { data, error } = await supabase
      .from('memo_templates' as any)
      .insert({
        user_id: user.id,
        name: args.name,
        description: args.description ?? null,
        subject_text: args.subject_text ?? null,
        body_html: args.body_html ?? null,
        action_comments: args.action_comments ?? null,
        memo_types: args.memo_types ?? null,
      } as any)
      .select('*')
      .single();
    if (error) throw error;
    return data as any;
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('memo_templates' as any).delete().eq('id', id);
  if (error) throw error;
}
