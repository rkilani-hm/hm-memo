// =====================================================================
// vendor-attachment-review
// =====================================================================
//
// Handles per-attachment human review actions performed by procurement
// staff. Replaces the earlier "all-or-nothing" approval model with a
// granular one where each attachment carries its own human verdict.
//
// Actions
// =======
//   set_human_status     — single-attachment approve/reject/clarify
//   batch_send_to_vendor — bundle pending feedback into ONE bilingual
//                          email + flip vendor status to
//                          'awaiting_vendor_response'
//   vendor_resubmit      — vendor portal calls this when they've
//                          replaced files / replied. Increments
//                          revision_round, flips status back to
//                          'submitted', emails procurement
//   post_message         — append a message to a per-attachment
//                          thread. Either side can call this. RLS
//                          enforces who can post which author_kind.
//
// Why this is a separate edge function (and not part of
// vendor-status-transition):
//   The state machine in vendor-status-transition handles
//   coarse-grained vendor-level transitions (submit, approve, reject
//   the whole vendor). Per-attachment actions are a different
//   conceptual layer — they don't always change the vendor's overall
//   status. Keeping them separate avoids expanding that function's
//   already-large surface area.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, getEnv } from "../_shared/edge-utils.ts";
import {
  emailChangesRequested,
  emailVendorResponded,
} from "../_shared/vendor-emails.ts";

type Action =
  | 'set_human_status'
  | 'batch_send_to_vendor'
  | 'send_single_to_vendor'
  | 'vendor_resubmit'
  | 'post_message';

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const env = getEnv();
    const supabase = createClient(env.supabaseUrl, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { action, vendor_id, attachment_id, payload } = body as {
      action: Action;
      vendor_id?: string;
      attachment_id?: string;
      payload?: any;
    };

    if (!action) return jsonError('action is required', 400);

    // ---- Authenticate caller ----------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError('Authentication required', 401);
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return jsonError('Authentication failed', 401);

    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    const userRoles = (rolesData || []).map((r: any) => r.role as string);
    const isStaff = userRoles.some((r) =>
      ['admin', 'vendor_reviewer', 'vendor_master_admin'].includes(r),
    );

    // ---- Dispatch ----------------------------------------------------
    switch (action) {
      case 'set_human_status':
        if (!isStaff) return jsonError('Procurement role required', 403);
        return await handleSetHumanStatus(supabase, user.id, attachment_id!, payload);

      case 'batch_send_to_vendor':
        if (!isStaff) return jsonError('Procurement role required', 403);
        return await handleBatchSend(supabase, user.id, vendor_id!, authHeader);

      case 'send_single_to_vendor':
        if (!isStaff) return jsonError('Procurement role required', 403);
        return await handleSendSingle(supabase, user.id, attachment_id!, authHeader);

      case 'vendor_resubmit':
        // Verify caller is a vendor portal user for this vendor
        return await handleVendorResubmit(supabase, user.id, vendor_id!, authHeader);

      case 'post_message':
        return await handlePostMessage(
          supabase, user.id, attachment_id!, payload,
          isStaff ? 'procurement' : 'vendor',
        );

      default:
        return jsonError(`Unknown action: ${action}`, 400);
    }
  } catch (e: any) {
    console.error('vendor-attachment-review error:', e);
    return new Response(
      JSON.stringify({ error: e?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ---------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------

async function handleSetHumanStatus(
  supabase: any,
  actorUserId: string,
  attachmentId: string,
  payload: { status: string; reason?: string },
): Promise<Response> {
  if (!attachmentId) return jsonError('attachment_id required', 400);
  const validStatuses = ['approved', 'rejected', 'clarification_requested', 'pending_review'];
  if (!validStatuses.includes(payload?.status)) {
    return jsonError(`status must be one of: ${validStatuses.join(', ')}`, 400);
  }
  if (
    (payload.status === 'rejected' || payload.status === 'clarification_requested') &&
    !payload.reason?.trim()
  ) {
    return jsonError('A reason/question is required for reject and clarification', 400);
  }

  const { data: attachment } = await supabase
    .from('vendor_attachments')
    .select('id, vendor_id, document_type_id')
    .eq('id', attachmentId)
    .maybeSingle();
  if (!attachment) return jsonError('Attachment not found', 404);

  const { error } = await supabase
    .from('vendor_attachments')
    .update({
      human_status: payload.status,
      human_status_reason: payload.reason || null,
      human_reviewed_by: actorUserId,
      human_reviewed_at: new Date().toISOString(),
    })
    .eq('id', attachmentId);
  if (error) throw error;

  await supabase.from('vendor_audit_log').insert({
    vendor_id: attachment.vendor_id,
    action: `attachment_${payload.status}`,
    actor_user_id: actorUserId,
    actor_kind: 'staff',
    notes: payload.reason || null,
    metadata: {
      attachment_id: attachmentId,
      document_type_id: attachment.document_type_id,
      status: payload.status,
    },
  });

  return jsonOk({ attachment_id: attachmentId, human_status: payload.status });
}

/**
 * Bundle all pending feedback for a vendor (rejected or
 * clarification_requested attachments) into ONE bilingual email,
 * flip vendor status to awaiting_vendor_response.
 *
 * Important: doesn't fire if there's nothing to send. If procurement
 * has only marked things 'approved' so far, this is a no-op.
 * Procurement can also do "all approved" → flow takes the auto-advance
 * path inside this handler.
 */
async function handleBatchSend(
  supabase: any,
  actorUserId: string,
  vendorId: string,
  authHeader: string | null,
): Promise<Response> {
  if (!vendorId) return jsonError('vendor_id required', 400);

  const { data: vendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', vendorId)
    .maybeSingle();
  if (!vendor) return jsonError('Vendor not found', 404);

  // Pull pending-vendor-response items
  const { data: attachments } = await supabase
    .from('vendor_attachments')
    .select(`
      id, file_name, human_status, human_status_reason,
      document_types(label_en, label_ar)
    `)
    .eq('vendor_id', vendorId)
    .in('human_status', ['rejected', 'clarification_requested']);

  // Also count how many are still pending review (not yet decided)
  const { count: pendingCount } = await supabase
    .from('vendor_attachments')
    .select('*', { count: 'exact', head: true })
    .eq('vendor_id', vendorId)
    .eq('human_status', 'pending_review');

  if ((attachments || []).length === 0) {
    // Nothing to send. Maybe procurement has approved everything.
    // Check if they've reviewed all required docs.
    if ((pendingCount || 0) > 0) {
      return jsonError(
        `No items need vendor action, but ${pendingCount} attachment(s) are still pending your review. Review all attachments before sending.`,
        400,
      );
    }
    // All approved — caller should use vendor-status-transition 'approve' next.
    return jsonOk({ status: 'no_changes_needed', message: 'All attachments approved. Use Approve action on the vendor.' });
  }

  // Build email items
  const items = (attachments as any[]).map((a) => ({
    documentLabelEn: a.document_types?.label_en || a.file_name,
    documentLabelAr: a.document_types?.label_ar || a.file_name,
    status: a.human_status as 'rejected' | 'clarification_requested',
    reasonOrQuestion: a.human_status_reason || '(no reason provided)',
  }));

  const portalLoginUrl =
    (Deno.env.get('APP_BASE_URL') || 'https://im.alhamra.com.kw') + '/vendor/login';

  const email = emailChangesRequested({
    vendorName: vendor.legal_name_en,
    vendorReferenceNo: vendor.vendor_reference_no,
    contactName: vendor.contact_name,
    items,
    portalLoginUrl,
  });

  // Check vendor has an email at all. Without one, we can update DB
  // but there's no way to actually notify them — caller needs to
  // know.
  const recipients = vendor.contact_email ? [vendor.contact_email] : [];
  const emailResult = recipients.length > 0
    ? await sendEmail(recipients, email, authHeader)
    : { ok: false, error: 'Vendor has no contact_email on file. Decisions were saved but the vendor was not notified.' };

  // Flip vendor status to awaiting_vendor_response. We do this EVEN
  // if the email failed, so procurement's decisions don't get
  // silently lost. The caller is told about the email failure in
  // the response so they can manually contact the vendor.
  await supabase
    .from('vendors')
    .update({ status: 'awaiting_vendor_response' })
    .eq('id', vendorId);

  await supabase.from('vendor_audit_log').insert({
    vendor_id: vendorId,
    action: 'sent_changes_request',
    actor_user_id: actorUserId,
    actor_kind: 'staff',
    notes: emailResult.ok
      ? `Sent ${items.length} item(s) to vendor`
      : `Decisions saved but email FAILED: ${emailResult.error}. Vendor not notified — please follow up manually.`,
    metadata: {
      from_status: vendor.status,
      to_status: 'awaiting_vendor_response',
      item_count: items.length,
      email_sent: emailResult.ok,
      email_error: emailResult.error || null,
      recipients,
      items: items.map((i) => ({ doc: i.documentLabelEn, status: i.status })),
    },
  });

  if (!emailResult.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        partial: true,
        items_sent: items.length,
        email_sent: false,
        error: emailResult.error,
        message: 'Decisions were saved and the vendor record was updated, but the email could not be sent. Please contact the vendor manually.',
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return jsonOk({ ok: true, items_sent: items.length, email_sent: true });
}

/**
 * "Send now" — fires a per-attachment email immediately for ONE
 * attachment, before procurement has reviewed everything else. Used
 * for the urgent case where a single-document issue should be flagged
 * to the vendor right away rather than batched.
 *
 * Behavior:
 *   - Attachment must currently be 'rejected' or 'clarification_requested'
 *     (sending a per-attachment notice for an approved document makes no
 *     sense; sending one for pending_review means procurement hasn't
 *     decided)
 *   - Sends a bilingual email with this single item
 *   - Flips vendor status to awaiting_vendor_response (same as batched)
 *   - Audit log entry tagged as a single-item send so it's clear in the
 *     history that this wasn't a batched dispatch
 *
 * Procurement can still call batch_send_to_vendor later if more items
 * accumulate — but that batch will only include attachments NOT already
 * sent (we mark sent items with a small flag in the audit log, but for
 * v1 we simply send everything pending each time, accepting the small
 * possibility of a re-send if procurement changes their mind. For most
 * use this won't happen.)
 */
async function handleSendSingle(
  supabase: any,
  actorUserId: string,
  attachmentId: string,
  authHeader: string | null,
): Promise<Response> {
  if (!attachmentId) return jsonError('attachment_id required', 400);

  const { data: attachment } = await supabase
    .from('vendor_attachments')
    .select(`
      id, vendor_id, file_name, human_status, human_status_reason,
      document_types(label_en, label_ar)
    `)
    .eq('id', attachmentId)
    .maybeSingle();
  if (!attachment) return jsonError('Attachment not found', 404);

  if (!['rejected', 'clarification_requested'].includes(attachment.human_status)) {
    return jsonError(
      `This attachment is currently '${attachment.human_status}'. Mark it Rejected or Ask Question first, then send.`,
      400,
    );
  }

  const { data: vendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', attachment.vendor_id)
    .maybeSingle();
  if (!vendor) return jsonError('Vendor not found', 404);

  const items = [{
    documentLabelEn: attachment.document_types?.label_en || attachment.file_name,
    documentLabelAr: attachment.document_types?.label_ar || attachment.file_name,
    status: attachment.human_status as 'rejected' | 'clarification_requested',
    reasonOrQuestion: attachment.human_status_reason || '(no reason provided)',
  }];

  const portalLoginUrl =
    (Deno.env.get('APP_BASE_URL') || 'https://im.alhamra.com.kw') + '/vendor/login';

  const email = emailChangesRequested({
    vendorName: vendor.legal_name_en,
    vendorReferenceNo: vendor.vendor_reference_no,
    contactName: vendor.contact_name,
    items,
    portalLoginUrl,
  });

  const recipients = vendor.contact_email ? [vendor.contact_email] : [];
  const emailResult = recipients.length > 0
    ? await sendEmail(recipients, email, authHeader)
    : { ok: false, error: 'Vendor has no contact_email on file. Decision saved but vendor not notified.' };

  // Flip vendor status to awaiting_vendor_response (same as batched)
  await supabase
    .from('vendors')
    .update({ status: 'awaiting_vendor_response' })
    .eq('id', attachment.vendor_id);

  await supabase.from('vendor_audit_log').insert({
    vendor_id: attachment.vendor_id,
    action: 'sent_single_attachment_notice',
    actor_user_id: actorUserId,
    actor_kind: 'staff',
    notes: emailResult.ok
      ? `Sent immediate notice for "${attachment.document_types?.label_en || attachment.file_name}"`
      : `Decision saved but email FAILED for "${attachment.document_types?.label_en || attachment.file_name}": ${emailResult.error}`,
    metadata: {
      from_status: vendor.status,
      to_status: 'awaiting_vendor_response',
      attachment_id: attachmentId,
      doc: attachment.document_types?.label_en,
      attachment_status: attachment.human_status,
      email_sent: emailResult.ok,
      email_error: emailResult.error || null,
      recipients,
    },
  });

  if (!emailResult.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        partial: true,
        email_sent: false,
        error: emailResult.error,
        message: 'Decision saved but the vendor email could not be sent. Please contact the vendor manually.',
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return jsonOk({ ok: true, email_sent: true });
}

/**
 * Vendor portal calls this when they've responded to procurement's
 * feedback. Increments revision_round, flips status to 'submitted',
 * emails procurement.
 *
 * NOTE: per the design, when a vendor uploads a replacement file,
 * the vendor portal also resets that attachment's human_status back
 * to 'pending_review' (procurement re-reviews). That happens client-
 * side at upload time. Posting a message alone doesn't reset the
 * status — procurement may approve a clarification reply without
 * needing a new file.
 */
async function handleVendorResubmit(
  supabase: any,
  actorUserId: string,
  vendorId: string,
  authHeader: string | null,
): Promise<Response> {
  if (!vendorId) return jsonError('vendor_id required', 400);

  // Verify caller is the vendor's portal user
  const { data: vu } = await supabase
    .from('vendor_users')
    .select('vendor_id, is_active')
    .eq('user_id', actorUserId)
    .eq('vendor_id', vendorId)
    .maybeSingle();
  if (!vu || !vu.is_active) return jsonError('Not authorised for this vendor', 403);

  const { data: vendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', vendorId)
    .maybeSingle();
  if (!vendor) return jsonError('Vendor not found', 404);

  if (vendor.status !== 'awaiting_vendor_response') {
    return jsonError(
      `Cannot resubmit from status '${vendor.status}'. Expected 'awaiting_vendor_response'.`,
      400,
    );
  }

  const newRound = (vendor.revision_round || 0) + 1;

  await supabase
    .from('vendors')
    .update({
      status: 'submitted',
      revision_round: newRound,
    })
    .eq('id', vendorId);

  await supabase.from('vendor_audit_log').insert({
    vendor_id: vendorId,
    action: 'vendor_resubmit',
    actor_user_id: actorUserId,
    actor_kind: 'vendor',
    notes: `Vendor resubmitted (round ${newRound})`,
    metadata: {
      from_status: 'awaiting_vendor_response',
      to_status: 'submitted',
      revision_round: newRound,
    },
  });

  // Email procurement that the vendor has responded
  const procurementEmails = await getStaffEmails(supabase, ['vendor_reviewer']);
  if (procurementEmails.length > 0) {
    const adminUrl =
      (Deno.env.get('APP_BASE_URL') || 'https://im.alhamra.com.kw') +
      `/admin/vendors/${vendorId}`;
    const email = emailVendorResponded({
      vendorName: vendor.legal_name_en,
      vendorReferenceNo: vendor.vendor_reference_no,
      revisionRound: newRound,
      vendorAdminUrl: adminUrl,
    });
    const emailResult = await sendEmail(procurementEmails, email, authHeader);
    if (!emailResult.ok) {
      console.warn('Procurement notification email failed:', emailResult.error);
    }
  }

  return jsonOk({ ok: true, revision_round: newRound });
}

async function handlePostMessage(
  supabase: any,
  actorUserId: string,
  attachmentId: string,
  payload: { message: string },
  authorKind: 'procurement' | 'vendor',
): Promise<Response> {
  if (!attachmentId) return jsonError('attachment_id required', 400);
  if (!payload?.message?.trim()) return jsonError('message is required', 400);
  if (payload.message.length > 4000) return jsonError('message too long (max 4000 chars)', 400);

  const { data: attachment } = await supabase
    .from('vendor_attachments')
    .select('id, vendor_id')
    .eq('id', attachmentId)
    .maybeSingle();
  if (!attachment) return jsonError('Attachment not found', 404);

  // Vendor portal users can only post to their own vendor's attachments
  if (authorKind === 'vendor') {
    const { data: vu } = await supabase
      .from('vendor_users')
      .select('is_active')
      .eq('user_id', actorUserId)
      .eq('vendor_id', attachment.vendor_id)
      .maybeSingle();
    if (!vu || !vu.is_active) return jsonError('Not authorised for this vendor', 403);
  }

  const { data: msg, error } = await supabase
    .from('vendor_attachment_messages')
    .insert({
      attachment_id: attachmentId,
      vendor_id: attachment.vendor_id,
      author_kind: authorKind,
      author_user_id: actorUserId,
      message: payload.message.trim(),
    })
    .select('id, created_at')
    .single();
  if (error) throw error;

  return jsonOk(msg);
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function jsonOk(data: any): Response {
  return new Response(
    JSON.stringify({ ok: true, ...data }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function getStaffEmails(supabase: any, roles: string[]): Promise<string[]> {
  const { data } = await supabase
    .from('user_roles')
    .select('user_id, profiles!inner(email)')
    .in('role', roles);
  if (!data) return [];
  const emails = (data as any[])
    .map((r) => r.profiles?.email)
    .filter((e: any): e is string => Boolean(e));
  return Array.from(new Set(emails));
}

/**
 * Calls the send-email edge function. Returns { ok, error? } so
 * callers can include the result in their response — silent failures
 * were causing real-world bugs ("emails not sent" symptom with no
 * visible error in the UI or logs).
 *
 * Auth note: passes the user's auth token through (not the service
 * role) to match the working memo email path. Both work, but using
 * the user token keeps the behavior consistent and means audit
 * trails on the email side capture the real caller.
 */
async function sendEmail(
  to: string[],
  email: { subject: string; html: string },
  userAuthHeader: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (to.length === 0) return { ok: true }; // nothing to send is success
  const env = getEnv();
  try {
    const res = await fetch(`${env.supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Prefer the user's auth header. Fall back to service key if
        // we're called from a non-user context (cron, etc).
        Authorization: userAuthHeader || `Bearer ${env.serviceKey}`,
      },
      body: JSON.stringify({
        to,
        subject: email.subject,
        body: email.html,
        isHtml: true,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown');
      console.error(`send-email HTTP ${res.status}:`, errText);
      return { ok: false, error: `Email service returned ${res.status}: ${errText.slice(0, 300)}` };
    }
    const result = await res.json().catch(() => ({}));
    if (result && result.success === false) {
      console.error('send-email returned success=false:', result);
      return { ok: false, error: result.error || result.warning || 'Email service reported failure' };
    }
    return { ok: true };
  } catch (e: any) {
    console.error('send-email network error:', e);
    return { ok: false, error: e?.message || 'Network error contacting email service' };
  }
}
