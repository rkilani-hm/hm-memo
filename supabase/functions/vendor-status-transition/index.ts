// =====================================================================
// vendor-status-transition
// =====================================================================
//
// Centralised, guarded state machine for vendor lifecycle changes.
// All status transitions go through this function so:
//   - Allowed transitions are enforced (no leapfrogging states)
//   - The right side-effects fire (emails, audit log entries,
//     SAP event records, vendor user creation)
//   - The actor's role is verified for the action they're attempting
//
// Actions handled
// ===============
//   submit              — anon or staff: 'draft' → 'submitted'
//                         (also used for the public registration form)
//   approve             — vendor_reviewer: 'submitted' → 'approved_pending_sap_creation'
//                         Triggers: vendor_sap_events row (creation, pending),
//                                   email to vendor_master_admin staff
//   reject              — vendor_reviewer: 'submitted' → 'rejected'
//                         Triggers: bilingual rejection email to vendor
//   mark_sap_created    — vendor_master_admin: 'approved_pending_sap_creation' → 'active_in_sap'
//                         Captures SAP code + account fields
//                         Triggers: completes vendor_sap_events row,
//                                   creates vendor_users + magic-link email,
//                                   sends "approved/active" email to vendor
//   approve_update      — vendor_reviewer: 'update_submitted' → 'update_approved_pending_sap_update'
//                         Applies vendor_change_request data to vendors row
//                         Triggers: vendor_sap_events row (update, pending),
//                                   email to vendor_master_admin
//   mark_sap_update_done — vendor_master_admin: 'update_approved_pending_sap_update' → 'sap_update_completed'
//                         Triggers: completes vendor_sap_events row,
//                                   sends "update processed" email to vendor
//   reject_update       — vendor_reviewer: 'update_submitted' → 'active_in_sap'
//                         Marks the change request rejected
//   deactivate          — admin/master_admin: → 'inactive'
//   reactivate          — admin/master_admin: 'inactive' → 'active_in_sap'
//
// Request body
// ============
//   { vendor_id, action, payload? }
//
// payload depends on action; see ALLOWED_TRANSITIONS below.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, getEnv } from "../_shared/edge-utils.ts";
import {
  emailRegistrationReceived,
  emailApprovedActive,
  emailRegistrationRejected,
  emailUpdateProcessed,
  emailCredentialsMagicLink,
} from "../_shared/vendor-emails.ts";

type Action =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'mark_sap_created'
  | 'approve_update'
  | 'reject_update'
  | 'mark_sap_update_done'
  | 'deactivate'
  | 'reactivate';

interface ActionRule {
  fromStatuses: string[];          // allowed source statuses (empty = any)
  toStatus: string;
  requiredRoles: string[];         // any of these
  allowAnon: boolean;              // public form path
}

const RULES: Record<Action, ActionRule> = {
  submit: {
    fromStatuses: ['draft', 'submitted'],
    toStatus: 'submitted',
    requiredRoles: ['admin', 'vendor_reviewer', 'vendor_master_admin'],
    allowAnon: true,
  },
  approve: {
    fromStatuses: ['submitted'],
    toStatus: 'approved_pending_sap_creation',
    requiredRoles: ['admin', 'vendor_reviewer'],
    allowAnon: false,
  },
  reject: {
    fromStatuses: ['submitted'],
    toStatus: 'rejected',
    requiredRoles: ['admin', 'vendor_reviewer'],
    allowAnon: false,
  },
  mark_sap_created: {
    fromStatuses: ['approved_pending_sap_creation'],
    toStatus: 'active_in_sap',
    requiredRoles: ['admin', 'vendor_master_admin'],
    allowAnon: false,
  },
  approve_update: {
    fromStatuses: ['update_submitted'],
    toStatus: 'update_approved_pending_sap_update',
    requiredRoles: ['admin', 'vendor_reviewer'],
    allowAnon: false,
  },
  reject_update: {
    fromStatuses: ['update_submitted'],
    toStatus: 'active_in_sap',
    requiredRoles: ['admin', 'vendor_reviewer'],
    allowAnon: false,
  },
  mark_sap_update_done: {
    fromStatuses: ['update_approved_pending_sap_update'],
    toStatus: 'sap_update_completed',
    requiredRoles: ['admin', 'vendor_master_admin'],
    allowAnon: false,
  },
  deactivate: {
    fromStatuses: [],  // any status
    toStatus: 'inactive',
    requiredRoles: ['admin', 'vendor_master_admin'],
    allowAnon: false,
  },
  reactivate: {
    fromStatuses: ['inactive'],
    toStatus: 'active_in_sap',
    requiredRoles: ['admin', 'vendor_master_admin'],
    allowAnon: false,
  },
};

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
    const { vendor_id, action, payload } = body as {
      vendor_id: string;
      action: Action;
      payload?: any;
    };

    if (!vendor_id || !action) {
      return jsonError('vendor_id and action are required', 400);
    }
    const rule = RULES[action];
    if (!rule) return jsonError(`Unknown action: ${action}`, 400);

    // ---- Authenticate caller -----------------------------------------
    const authHeader = req.headers.get('Authorization');
    let actorUserId: string | null = null;
    let actorRoles: string[] = [];
    let isAnon = true;

    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        actorUserId = user.id;
        isAnon = false;
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);
        actorRoles = (roles || []).map((r: any) => r.role);
      }
    }

    if (isAnon && !rule.allowAnon) {
      return jsonError('Authentication required for this action', 401);
    }
    if (!isAnon && !actorRoles.some((r) => rule.requiredRoles.includes(r))) {
      return jsonError(
        `This action requires one of: ${rule.requiredRoles.join(', ')}`,
        403,
      );
    }

    // ---- Load current vendor -----------------------------------------
    const { data: vendor, error: vendorErr } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', vendor_id)
      .maybeSingle();
    if (vendorErr || !vendor) return jsonError('Vendor not found', 404);

    if (rule.fromStatuses.length > 0 && !rule.fromStatuses.includes(vendor.status)) {
      return jsonError(
        `Cannot ${action} from status '${vendor.status}'. Expected one of: ${rule.fromStatuses.join(', ')}`,
        400,
      );
    }

    // ---- Apply the transition ----------------------------------------
    const updates: Record<string, any> = { status: rule.toStatus };

    switch (action) {
      case 'submit':
        if (!vendor.submitted_at) updates.submitted_at = new Date().toISOString();
        break;
      case 'approve':
      case 'reject':
        updates.reviewed_by = actorUserId;
        updates.reviewed_at = new Date().toISOString();
        if (action === 'reject') {
          updates.rejection_reason = payload?.reason || 'No reason provided.';
        }
        break;
      case 'mark_sap_created':
        if (!payload?.sap_vendor_code) {
          return jsonError('sap_vendor_code is required', 400);
        }
        updates.sap_vendor_code = payload.sap_vendor_code;
        updates.sap_account_group = payload.sap_account_group || null;
        updates.sap_company_code = payload.sap_company_code || null;
        updates.sap_purchasing_organization = payload.sap_purchasing_organization || null;
        updates.sap_creation_status = 'completed';
        updates.sap_created_at = new Date().toISOString();
        updates.sap_created_by = actorUserId;
        break;
      case 'mark_sap_update_done':
        updates.sap_last_update_at = new Date().toISOString();
        updates.sap_last_update_by = actorUserId;
        updates.sap_last_update_reference = payload?.sap_reference || null;
        break;
      case 'deactivate':
        updates.blocked_reason = payload?.reason || null;
        break;
    }

    const { error: updErr } = await supabase
      .from('vendors')
      .update(updates)
      .eq('id', vendor_id);
    if (updErr) throw updErr;

    // ---- Audit log entry ---------------------------------------------
    await supabase.from('vendor_audit_log').insert({
      vendor_id,
      action,
      actor_user_id: actorUserId,
      actor_kind: isAnon ? 'vendor' : 'staff',
      notes: payload?.reason || payload?.notes || null,
      metadata: {
        from_status: vendor.status,
        to_status: rule.toStatus,
        ...payload,
      },
    });

    // ---- Side-effects ------------------------------------------------
    const portalLoginUrl = (Deno.env.get('APP_BASE_URL') || 'https://im.alhamra.com.kw') + '/vendor/login';

    // Track email failures so we can surface them to the caller.
    // Without this, send-email failures were silently swallowed and
    // procurement was left wondering why vendors never got notified.
    const emailFailures: Array<{ to: string; error: string }> = [];
    const trackEmail = async (
      sendPromise: Promise<{ ok: boolean; error?: string }>,
      recipientLabel: string,
    ) => {
      const r = await sendPromise;
      if (!r.ok && r.error) {
        emailFailures.push({ to: recipientLabel, error: r.error });
        console.error(`[${action}] email to ${recipientLabel} failed: ${r.error}`);
      }
    };

    if (action === 'submit') {
      // Email vendor: registration received
      const email = emailRegistrationReceived({
        vendorName: vendor.legal_name_en,
        vendorReferenceNo: vendor.vendor_reference_no,
        contactName: vendor.contact_name,
      });
      await trackEmail(
        sendBrandedEmail([vendor.contact_email], email, authHeader),
        vendor.contact_email || 'vendor (no email)',
      );

      // Email procurement: new submission to review
      const procurementEmails = await getProcurementEmails(supabase, ['vendor_reviewer']);
      if (procurementEmails.length > 0) {
        await trackEmail(
          sendInternalAlert(procurementEmails,
            `New vendor registration: ${vendor.vendor_reference_no}`,
            `<p>A new vendor has been registered and is awaiting your review.</p>
             <p><strong>${vendor.legal_name_en}</strong><br/>Reference: ${vendor.vendor_reference_no}</p>
             <p><a href="${Deno.env.get('APP_BASE_URL') || 'https://im.alhamra.com.kw'}/admin/vendors/${vendor.id}">Review submission</a></p>`,
            authHeader,
          ),
          `procurement (${procurementEmails.length})`,
        );
      }
    } else if (action === 'approve') {
      // Create vendor_sap_events row (creation, pending)
      await supabase.from('vendor_sap_events').insert({
        vendor_id,
        kind: 'creation',
        status: 'pending',
        payload_snapshot: vendor,
      });
      // Email vendor_master_admin: please create in SAP
      const masterAdminEmails = await getProcurementEmails(supabase, ['vendor_master_admin']);
      if (masterAdminEmails.length > 0) {
        await trackEmail(
          sendInternalAlert(masterAdminEmails,
            `Vendor approved — please create in SAP: ${vendor.vendor_reference_no}`,
            `<p><strong>${vendor.legal_name_en}</strong> has been approved by procurement.</p>
             <p>Please create the vendor master record in SAP and enter the SAP Vendor Code in the portal.</p>
             <p><a href="${Deno.env.get('APP_BASE_URL') || 'https://im.alhamra.com.kw'}/admin/vendors/${vendor.id}">Open vendor record</a></p>`,
            authHeader,
          ),
          `vendor_master_admin (${masterAdminEmails.length})`,
        );
      }
    } else if (action === 'reject') {
      const email = emailRegistrationRejected({
        vendorName: vendor.legal_name_en,
        vendorReferenceNo: vendor.vendor_reference_no,
        contactName: vendor.contact_name,
        reasonEn: payload?.reason || 'Registration could not be approved at this time.',
      });
      await trackEmail(
        sendBrandedEmail([vendor.contact_email], email, authHeader),
        vendor.contact_email || 'vendor (no email)',
      );
    } else if (action === 'mark_sap_created') {
      // Complete vendor_sap_events row
      await supabase
        .from('vendor_sap_events')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: actorUserId,
          sap_reference: payload.sap_vendor_code,
        })
        .eq('vendor_id', vendor_id)
        .eq('kind', 'creation')
        .eq('status', 'pending');

      // Provision vendor portal user via magic-link invite
      try {
        const { data: inviteRes } = await supabase.auth.admin.inviteUserByEmail(
          vendor.contact_email,
          {
            redirectTo: portalLoginUrl,
            data: {
              vendor_id,
              vendor_reference_no: vendor.vendor_reference_no,
              role: 'vendor',
            },
          },
        );
        if (inviteRes?.user) {
          // Link auth user to vendor + assign 'vendor' role
          await supabase.from('vendor_users').insert({
            vendor_id,
            user_id: inviteRes.user.id,
            is_active: true,
          });
          await supabase.from('user_roles').insert({
            user_id: inviteRes.user.id,
            role: 'vendor',
          });
        }
      } catch (e: any) {
        console.warn('Vendor portal invite failed:', e?.message);
        // Don't fail the whole transition; portal can be invited manually later.
      }

      // Send the credentials email (separate from generic Supabase invite)
      const credEmail = emailCredentialsMagicLink({
        vendorName: vendor.legal_name_en,
        vendorReferenceNo: vendor.vendor_reference_no,
        contactName: vendor.contact_name,
        magicLinkUrl: portalLoginUrl,
      });
      await trackEmail(
        sendBrandedEmail([vendor.contact_email], credEmail, authHeader),
        `${vendor.contact_email || 'vendor (no email)'} (credentials)`,
      );

      // And the welcome/active email (vendor reference, no SAP terminology)
      const welcomeEmail = emailApprovedActive({
        vendorName: vendor.legal_name_en,
        vendorReferenceNo: vendor.vendor_reference_no,
        contactName: vendor.contact_name,
        portalLoginUrl,
      });
      await trackEmail(
        sendBrandedEmail([vendor.contact_email], welcomeEmail, authHeader),
        `${vendor.contact_email || 'vendor (no email)'} (welcome)`,
      );
    } else if (action === 'approve_update') {
      // Apply the change request to the vendors row
      const changeReqId = payload?.change_request_id;
      if (changeReqId) {
        const { data: cr } = await supabase
          .from('vendor_change_requests')
          .select('proposed_changes')
          .eq('id', changeReqId)
          .maybeSingle();
        if (cr?.proposed_changes) {
          // Apply changes (filter out anything we don't allow vendors to set)
          const allowed = filterAllowedFields(cr.proposed_changes);
          if (Object.keys(allowed).length > 0) {
            await supabase.from('vendors').update(allowed).eq('id', vendor_id);
          }
          await supabase
            .from('vendor_change_requests')
            .update({
              status: 'approved',
              reviewed_by: actorUserId,
              reviewed_at: new Date().toISOString(),
            })
            .eq('id', changeReqId);
        }
      }
      // Create vendor_sap_events row for the update
      await supabase.from('vendor_sap_events').insert({
        vendor_id,
        kind: 'update',
        status: 'pending',
        payload_snapshot: vendor,
      });
      // Email vendor_master_admin
      const masterAdminEmails = await getProcurementEmails(supabase, ['vendor_master_admin']);
      if (masterAdminEmails.length > 0) {
        await trackEmail(
          sendInternalAlert(masterAdminEmails,
            `Vendor update approved — please apply in SAP: ${vendor.vendor_reference_no}`,
            `<p>An update for <strong>${vendor.legal_name_en}</strong> has been approved by procurement.</p>
             <p>Please apply the changes in SAP and mark complete in the portal.</p>
             <p><a href="${Deno.env.get('APP_BASE_URL') || 'https://im.alhamra.com.kw'}/admin/vendors/${vendor.id}">Open vendor record</a></p>`,
            authHeader,
          ),
          `vendor_master_admin (${masterAdminEmails.length})`,
        );
      }
    } else if (action === 'reject_update') {
      const changeReqId = payload?.change_request_id;
      if (changeReqId) {
        await supabase
          .from('vendor_change_requests')
          .update({
            status: 'rejected',
            reviewed_by: actorUserId,
            reviewed_at: new Date().toISOString(),
            rejection_reason: payload?.reason || null,
          })
          .eq('id', changeReqId);
      }
    } else if (action === 'mark_sap_update_done') {
      await supabase
        .from('vendor_sap_events')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: actorUserId,
          sap_reference: payload?.sap_reference || null,
        })
        .eq('vendor_id', vendor_id)
        .eq('kind', 'update')
        .eq('status', 'pending');
      // Vendor email
      const email = emailUpdateProcessed({
        vendorName: vendor.legal_name_en,
        vendorReferenceNo: vendor.vendor_reference_no,
        contactName: vendor.contact_name,
      });
      await trackEmail(
        sendBrandedEmail([vendor.contact_email], email, authHeader),
        vendor.contact_email || 'vendor (no email)',
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        status: rule.toStatus,
        // If any emails failed, surface them so the UI can warn the
        // caller. The action itself succeeded (status changed, audit
        // logged), but emails are part of the user expectation —
        // silent email failures are how we got "vendors never receive
        // notifications" bug reports in the first place.
        ...(emailFailures.length > 0 && { email_failures: emailFailures }),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error('vendor-status-transition error:', e);
    return new Response(
      JSON.stringify({ error: e?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function getProcurementEmails(supabase: any, roles: string[]): Promise<string[]> {
  const { data } = await supabase
    .from('user_roles')
    .select('user_id, profiles!inner(email)')
    .in('role', roles);
  if (!data) return [];
  const emails = (data as any[])
    .map((r) => r.profiles?.email)
    .filter((e): e is string => Boolean(e));
  return Array.from(new Set(emails));
}

async function sendBrandedEmail(
  to: string[],
  email: { subject: string; html: string },
  authHeader: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (to.length === 0) return { ok: false, error: 'No recipients' };
  return await callSendEmail(to, email.subject, email.html, authHeader);
}

async function sendInternalAlert(
  to: string[],
  subject: string,
  bodyHtml: string,
  authHeader: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (to.length === 0) return { ok: true }; // not an error if there's no procurement staff
  return await callSendEmail(to, subject, bodyHtml, authHeader);
}

/**
 * Shared underlying call. Logs detailed errors so the cause of any
 * failure shows up in the Supabase function logs (where previously
 * a silent fetch swallowed everything).
 */
async function callSendEmail(
  to: string[],
  subject: string,
  body: string,
  authHeader: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const env = getEnv();
  const url = `${env.supabaseUrl}/functions/v1/send-email`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader || `Bearer ${env.serviceKey}`,
      },
      body: JSON.stringify({ to, subject, body, isHtml: true }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown');
      console.error(`send-email HTTP ${res.status} for to=${to.join(',')}:`, errText);
      return { ok: false, error: `Email HTTP ${res.status}: ${errText.slice(0, 300)}` };
    }
    const result = await res.json().catch(() => ({}));
    if (result && result.success === false) {
      console.error(`send-email returned success=false for to=${to.join(',')}:`, result);
      return { ok: false, error: result.error || result.warning || 'Email service reported failure' };
    }
    return { ok: true };
  } catch (e: any) {
    console.error('send-email network error:', e);
    return { ok: false, error: e?.message || 'Network error contacting email service' };
  }
}

/**
 * Filter a proposed_changes blob to only fields vendors are allowed to
 * change. Specifically excludes SAP fields, status, reference numbers,
 * audit fields. Vendors can change company details, contact info, bank.
 */
function filterAllowedFields(changes: Record<string, any>): Record<string, any> {
  const ALLOWED = new Set([
    'legal_name_en', 'legal_name_ar', 'trading_name', 'country',
    'address_line1', 'address_line2', 'city', 'state_region', 'postal_code',
    'industry_activity', 'website',
    'contact_name', 'contact_email', 'contact_phone', 'contact_position',
    'signatory_name', 'signatory_position', 'signatory_civil_id_or_passport',
    'bank_name', 'bank_branch', 'bank_account_name', 'bank_account_number',
    'bank_iban', 'bank_swift_bic', 'bank_currency',
    'tax_registration_no', 'has_tax_exemption',
    'has_iso_qms', 'iso_certifying_body',
    'payment_terms_preference',
  ]);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (ALLOWED.has(k)) out[k] = v;
  }
  return out;
}
