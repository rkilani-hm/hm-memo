// =====================================================================
// vendor-expiry-reminder
// =====================================================================
//
// Daily cron job (intended to run once per day around 06:00 GMT).
// Walks vendor_attachments looking for documents whose expiry_date
// falls within the configured reminder windows ([60, 30, 14, 7] days
// by default), and:
//
//   1. Sends a bilingual reminder email to the vendor's contact_email
//   2. Sends a bilingual reminder email to all vendor_master_admin
//      and vendor_reviewer staff
//   3. Records last_reminder_sent_at + last_reminder_window so the
//      same window doesn't trigger twice
//
// For documents that have already EXPIRED:
//   1. Sends a bilingual "expired — please renew" email
//   2. Sets the parent vendor's status to 'blocked_documents_expired'
//      so no new transactions can occur
//   3. Logs a vendor_audit_log entry
//
// Idempotent — safe to run multiple times in the same day. The
// last_reminder_window guard prevents duplicate emails.
//
// Trigger
// =======
// Configure a Supabase scheduled function (cron) to invoke this
// daily, OR call it manually for testing. No request body required.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, getEnv } from "../_shared/edge-utils.ts";
import { emailDocumentExpiring } from "../_shared/vendor-emails.ts";

interface ReminderRow {
  id: string;
  vendor_id: string;
  document_type_id: string | null;
  expiry_date: string;
  last_reminder_window: number | null;
  document_label_en: string;
  document_label_ar: string;
  vendor_legal_name_en: string;
  vendor_reference_no: string;
  vendor_contact_name: string;
  vendor_contact_email: string;
  vendor_status: string;
}

const REMINDER_WINDOWS = [60, 30, 14, 7];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const env = getEnv();
    const supabase = createClient(env.supabaseUrl, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ---- Load reminder settings (fall back to defaults) -------------
    const { data: settings } = await supabase
      .from('document_reminder_settings')
      .select('reminder_days, notify_vendor, notify_procurement')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const windows: number[] = (settings?.reminder_days as number[] | null)?.length
      ? (settings!.reminder_days as number[])
      : REMINDER_WINDOWS;
    const notifyVendor = settings?.notify_vendor !== false;
    const notifyProcurement = settings?.notify_procurement !== false;

    // ---- Procurement officer recipient list -------------------------
    const procurementEmails = await getProcurementEmails(supabase);

    // ---- Portal URL base --------------------------------------------
    const portalLoginUrl = Deno.env.get("APP_BASE_URL")
      ? `${Deno.env.get("APP_BASE_URL")}/vendor/login`
      : 'https://im.alhamra.com.kw/vendor/login';

    // ---- Find expiring docs -----------------------------------------
    // We pull all attachments with an expiry_date, join up vendor +
    // document_type info, and decide per-row what to do.
    const { data: rows, error } = await supabase
      .from('vendor_attachments')
      .select(`
        id,
        vendor_id,
        document_type_id,
        expiry_date,
        last_reminder_window,
        document_types ( label_en, label_ar ),
        vendors (
          legal_name_en,
          vendor_reference_no,
          contact_name,
          contact_email,
          status
        )
      `)
      .not('expiry_date', 'is', null);

    if (error) throw error;

    let remindersSent = 0;
    let vendorsBlocked = 0;
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const r of (rows || []) as any[]) {
      // Skip if vendor record was deleted underneath us
      if (!r.vendors) {
        skipped.push({ id: r.id, reason: 'no_vendor' });
        continue;
      }

      // Skip vendors that aren't in active or blocked-due-to-expiry
      // states — we don't dun draft/rejected/inactive vendors.
      const status = r.vendors.status as string;
      const isActiveLike = [
        'active_in_sap',
        'sap_update_completed',
        'update_submitted',
        'update_approved_pending_sap_update',
        'blocked_documents_expired',
      ].includes(status);
      if (!isActiveLike) {
        skipped.push({ id: r.id, reason: `status:${status}` });
        continue;
      }

      const expiry = new Date(r.expiry_date);
      expiry.setHours(0, 0, 0, 0);
      const daysRemaining = Math.round(
        (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      // ---- Already expired ------------------------------------------
      if (daysRemaining < 0) {
        // Idempotency: only send if last_reminder_window != -1
        if (r.last_reminder_window !== -1) {
          await sendReminder(
            supabase, r, daysRemaining, expiry, portalLoginUrl,
            { notifyVendor, notifyProcurement, procurementEmails },
          );
          await supabase
            .from('vendor_attachments')
            .update({
              last_reminder_sent_at: new Date().toISOString(),
              last_reminder_window: -1,
            })
            .eq('id', r.id);
          remindersSent++;
        }

        // Block vendor if not already blocked
        if (status !== 'blocked_documents_expired') {
          await supabase
            .from('vendors')
            .update({
              status: 'blocked_documents_expired',
              blocked_reason: `Document "${r.document_types?.label_en || 'Unknown'}" expired on ${r.expiry_date}.`,
            })
            .eq('id', r.vendor_id);

          await supabase.from('vendor_audit_log').insert({
            vendor_id: r.vendor_id,
            action: 'blocked_documents_expired',
            actor_kind: 'system',
            notes: `Auto-blocked: document "${r.document_types?.label_en}" expired ${r.expiry_date}.`,
            metadata: { attachment_id: r.id, days_overdue: -daysRemaining },
          });
          vendorsBlocked++;
        }
        continue;
      }

      // ---- Approaching expiry ---------------------------------------
      // Find the smallest configured window that >= daysRemaining
      const matchingWindow = windows
        .slice()
        .sort((a, b) => a - b)
        .find((w) => daysRemaining <= w);

      if (matchingWindow === undefined) {
        // Outside all windows (more than the max days away) — nothing yet
        continue;
      }

      // Idempotency: skip if we've already sent for this window OR a tighter one
      if (r.last_reminder_window !== null && r.last_reminder_window <= matchingWindow) {
        continue;
      }

      await sendReminder(
        supabase, r, daysRemaining, expiry, portalLoginUrl,
        { notifyVendor, notifyProcurement, procurementEmails },
      );
      await supabase
        .from('vendor_attachments')
        .update({
          last_reminder_sent_at: new Date().toISOString(),
          last_reminder_window: matchingWindow,
        })
        .eq('id', r.id);
      remindersSent++;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        reminders_sent: remindersSent,
        vendors_blocked: vendorsBlocked,
        scanned: rows?.length || 0,
        skipped: skipped.length,
        windows_used: windows,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error('vendor-expiry-reminder error:', e);
    return new Response(
      JSON.stringify({ error: e?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

async function getProcurementEmails(supabase: any): Promise<string[]> {
  const { data } = await supabase
    .from('user_roles')
    .select('user_id, profiles!inner(email)')
    .in('role', ['vendor_reviewer', 'vendor_master_admin']);
  if (!data) return [];
  const emails = (data as any[])
    .map((r) => r.profiles?.email)
    .filter((e): e is string => Boolean(e));
  return Array.from(new Set(emails));
}

async function sendReminder(
  supabase: any,
  row: any,
  daysRemaining: number,
  expiry: Date,
  portalLoginUrl: string,
  flags: { notifyVendor: boolean; notifyProcurement: boolean; procurementEmails: string[] },
): Promise<void> {
  const expiryDate = expiry.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const email = emailDocumentExpiring({
    vendorName: row.vendors.legal_name_en,
    vendorReferenceNo: row.vendors.vendor_reference_no,
    contactName: row.vendors.contact_name || 'Supplier',
    documentLabelEn: row.document_types?.label_en || 'Document',
    documentLabelAr: row.document_types?.label_ar || 'مستند',
    expiryDate,
    daysRemaining,
    portalLoginUrl,
  });

  const recipients: string[] = [];
  if (flags.notifyVendor && row.vendors.contact_email) {
    recipients.push(row.vendors.contact_email);
  }
  if (flags.notifyProcurement) {
    recipients.push(...flags.procurementEmails);
  }
  if (recipients.length === 0) return;

  // Use the existing send-email edge function. Cron context — no user
  // auth header available, so we use the service key.
  const env = getEnv();
  const url = `${env.supabaseUrl}/functions/v1/send-email`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.serviceKey}`,
      },
      body: JSON.stringify({
        to: recipients,
        subject: email.subject,
        body: email.html,
        isHtml: true,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown');
      console.error(`[expiry-reminder] send-email HTTP ${res.status} for vendor ${row.vendor_id} doc ${row.id}:`, errText);
    } else {
      const result = await res.json().catch(() => ({}));
      if (result && result.success === false) {
        console.error(`[expiry-reminder] send-email returned success=false for vendor ${row.vendor_id}:`, result);
      }
    }
  } catch (e: any) {
    console.error(`[expiry-reminder] network error sending to ${recipients.join(',')}:`, e);
  }
}
