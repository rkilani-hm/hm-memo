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
        return await handleBatchSend(supabase, user.id, vendor_id!);

      case 'vendor_resubmit':
        // Verify caller is a vendor portal user for this vendor
        return await handleVendorResubmit(supabase, user.id, vendor_id!);

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

  await sendEmail([vendor.contact_email], email);

  // Flip vendor status to awaiting_vendor_response
  await supabase
    .from('vendors')
    .update({ status: 'awaiting_vendor_response' })
    .eq('id', vendorId);

  await supabase.from('vendor_audit_log').insert({
    vendor_id: vendorId,
    action: 'sent_changes_request',
    actor_user_id: actorUserId,
    actor_kind: 'staff',
    notes: `Sent ${items.length} item(s) to vendor`,
    metadata: {
      from_status: vendor.status,
      to_status: 'awaiting_vendor_response',
      item_count: items.length,
      items: items.map((i) => ({ doc: i.documentLabelEn, status: i.status })),
    },
  });

  return jsonOk({ ok: true, items_sent: items.length });
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
    await sendEmail(procurementEmails, email);
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

async function sendEmail(to: string[], email: { subject: string; html: string }): Promise<void> {
  if (to.length === 0) return;
  const env = getEnv();
  await fetch(`${env.supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.serviceKey}`,
    },
    body: JSON.stringify({
      to,
      subject: email.subject,
      body: email.html,
      isHtml: true,
    }),
  });
}
