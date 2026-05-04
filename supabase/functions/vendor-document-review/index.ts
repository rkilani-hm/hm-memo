// =====================================================================
// vendor-document-review
// =====================================================================
//
// Called when a vendor attachment is uploaded (either by the vendor
// during the public registration form or by internal staff). Runs the
// document through an LLM with vision to:
//
//   1. Verify the file is the EXPECTED document type for the slot
//      (e.g. if uploaded into the "Commercial Registration" slot,
//      check that the file actually IS a Commercial Registration).
//   2. Extract structured fields (company name, registration number,
//      expiry date, etc.) per the document_type's ai_check_hints.
//   3. Cross-check extracted name with the vendor's entered name
//      (mismatch is a reject reason — a bank letter for "ABC Holdings"
//      is suspicious when the vendor said they're "ABC Trading").
//   4. Extract expiry date when the document has one.
//
// Returns a binary verdict:
//   - 'accepted'      : AI confident the doc looks right
//   - 'rejected'      : AI sees a clear problem; vendor must replace
//   - 'soft_pending'  : AI errored or timed out; flagged for human review
//
// NEVER 'accepted' when the AI is uncertain. Per user spec, vendors
// have no override — if AI says rejected, vendor must upload a
// different file. Procurement officer can manually override on the
// staff side after the fact.
//
// Request body
// ============
//   {
//     attachment_id: UUID,    // vendor_attachments row to analyse
//   }
//
// All other context (vendor record, document type, expected fields)
// is loaded from the database using the attachment_id.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  corsHeaders,
  getEnv,
  callAi,
  safeJsonParse,
  type AiMessage,
  type AiContentPart,
} from "../_shared/edge-utils.ts";

interface VerdictResult {
  verdict: 'accepted' | 'rejected' | 'soft_pending';
  summary: string;
  rejection_reason?: string;       // shown to vendor on rejection
  findings: any;                   // structured: extracted fields, anomalies
  extracted_expiry_date?: string;  // ISO date if extracted
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const env = getEnv();
    const supabase = createClient(env.supabaseUrl, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { attachment_id } = await req.json();
    if (!attachment_id) {
      return new Response(
        JSON.stringify({ error: "attachment_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Mark as pending immediately (UI shows "reviewing...")
    await supabase
      .from('vendor_attachments')
      .update({ ai_verdict: 'pending' })
      .eq('id', attachment_id);

    // ---- Load context ------------------------------------------------
    const { data: attachment, error: attErr } = await supabase
      .from('vendor_attachments')
      .select(`
        id, vendor_id, document_type_id, file_name, file_url, file_mime_type
      `)
      .eq('id', attachment_id)
      .maybeSingle();

    if (attErr || !attachment) {
      throw new Error(`Attachment not found: ${attErr?.message ?? 'no row'}`);
    }

    const { data: vendor } = await supabase
      .from('vendors')
      .select('id, legal_name_en, legal_name_ar, trading_name, contact_name, country, vendor_type_id')
      .eq('id', attachment.vendor_id)
      .maybeSingle();

    if (!vendor) {
      throw new Error('Vendor not found for attachment');
    }

    let docTypeRow: any = null;
    if (attachment.document_type_id) {
      const { data } = await supabase
        .from('document_types')
        .select('code, label_en, label_ar, has_expiry, ai_check_hints')
        .eq('id', attachment.document_type_id)
        .maybeSingle();
      docTypeRow = data;
    }

    // ---- Fetch the file bytes ----------------------------------------
    let fileBytes: Uint8Array;
    let mime = attachment.file_mime_type || 'application/octet-stream';
    try {
      // vendor docs live in their own bucket. file_url stores the
      // path within the bucket (relative to the bucket root).
      const { data, error } = await supabase.storage
        .from('vendor-attachments')
        .download(attachment.file_url);
      if (error || !data) throw new Error(error?.message || 'download failed');
      fileBytes = new Uint8Array(await data.arrayBuffer());
      // Guess mime from filename if not stored
      if (!attachment.file_mime_type) {
        const lower = attachment.file_name.toLowerCase();
        if (lower.endsWith('.pdf')) mime = 'application/pdf';
        else if (lower.endsWith('.png')) mime = 'image/png';
        else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg';
      }
    } catch (downloadErr: any) {
      // File can't be retrieved — soft-pending so procurement can investigate
      const result: VerdictResult = {
        verdict: 'soft_pending',
        summary: 'Could not retrieve the file for review.',
        rejection_reason: `Could not retrieve the file (${downloadErr?.message || 'unknown error'}). It will be reviewed by our procurement team.`,
        findings: { error: downloadErr?.message || 'download_failed' },
      };
      await persistResult(supabase, attachment_id, result, null);
      return jsonResponse(result);
    }

    // Catastrophic checks (skip AI, return rejected immediately) -------
    if (fileBytes.length === 0) {
      const result: VerdictResult = {
        verdict: 'rejected',
        summary: 'File is empty.',
        rejection_reason: 'The file appears to be empty or corrupted. Please re-upload a valid file.',
        findings: { reason: 'empty_file' },
      };
      await persistResult(supabase, attachment_id, result, null);
      return jsonResponse(result);
    }

    if (fileBytes.length > 25 * 1024 * 1024) {
      const result: VerdictResult = {
        verdict: 'rejected',
        summary: 'File too large.',
        rejection_reason: 'The file exceeds 25 MB. Please upload a smaller file or a more compressed version.',
        findings: { reason: 'too_large', size_bytes: fileBytes.length },
      };
      await persistResult(supabase, attachment_id, result, null);
      return jsonResponse(result);
    }

    // ---- Build the AI prompt -----------------------------------------
    const expectedDocLabel = docTypeRow?.label_en || 'Unknown document type';
    const expectedHints = docTypeRow?.ai_check_hints || 'No specific hints provided.';
    const checkExpiry = docTypeRow?.has_expiry === true;
    const expectedCompanyName = vendor.legal_name_en || vendor.trading_name || '';

    const systemPrompt = `You are a document review assistant for a vendor onboarding system at Al Hamra Real Estate (Kuwait). You verify uploaded documents and extract structured fields.

You will see ONE document. The vendor uploaded it into a slot expecting:
  EXPECTED DOCUMENT TYPE: "${expectedDocLabel}"
  TYPE HINTS: ${expectedHints}

The vendor's registered company name is: "${expectedCompanyName}"
${vendor.legal_name_ar ? `The vendor's company name in Arabic is: "${vendor.legal_name_ar}"` : ''}

Your job:
1. Determine if the file is REALLY the expected document type. If it's clearly a different document type (e.g. expected Commercial Registration but received a Civil ID), this is a REJECT.
2. If the document has a company / holder name, check whether it matches the registered name above. Allow minor variations (legal-form abbreviations like "Ltd", "Co.", "ش.م.م"). Mismatch in core name parts is a REJECT.
3. ${checkExpiry ? 'Extract the expiry date if present. If the document has expired, this is a REJECT (but note the expired date in extracted fields).' : 'No expiry tracking required for this document type.'}
4. Check overall quality: blurry, partial, unreadable, password-protected → REJECT with specific reason.
5. Extract any other relevant structured fields from the document.

Respond with STRICT JSON of this shape:
{
  "verdict": "accepted" | "rejected",
  "summary": "1-2 sentence human-readable summary of what you found",
  "rejection_reason": "If rejected: specific message to show the vendor explaining what's wrong and what to do (in English). Empty string if accepted.",
  "extracted_fields": {
    "document_type_detected": "what the file actually appears to be",
    "company_name": "as written in the document, or null",
    "expiry_date": "YYYY-MM-DD or null",
    "registration_number": "if applicable, or null",
    "issue_date": "YYYY-MM-DD or null",
    "other": {}
  },
  "name_match": "exact" | "approximate" | "mismatch" | "not_applicable",
  "quality": "good" | "acceptable" | "poor" | "unreadable",
  "expired": true | false | null
}

Be strict. If you are not confident the document is the expected type, REJECT. Vendors will replace rejected files; false rejects are recoverable. Falsely accepting wrong documents is much worse.`;

    const userMessage: AiMessage = {
      role: 'user',
      content: buildContentParts(fileBytes, mime, expectedDocLabel),
    };

    // ---- Call the AI -------------------------------------------------
    let aiResp;
    try {
      aiResp = await callAi(
        [
          { role: 'system', content: systemPrompt },
          userMessage,
        ],
        {
          provider: 'openai_then_lovable',
          openaiKey: env.openaiKey,
          lovableKey: env.lovableKey,
          responseFormat: { type: 'json_object' },
        },
      );
    } catch (aiErr: any) {
      // AI errored → soft-pending. Vendor's submission proceeds; procurement reviews.
      const result: VerdictResult = {
        verdict: 'soft_pending',
        summary: 'Automatic review unavailable — flagged for our team.',
        rejection_reason: 'We could not auto-review this file. Our procurement team will review it manually.',
        findings: { error: aiErr?.message || 'ai_call_failed' },
      };
      await persistResult(supabase, attachment_id, result, aiResp?.modelUsed || null);
      return jsonResponse(result);
    }

    // ---- Parse AI response -------------------------------------------
    const parsed = safeJsonParse<any>(aiResp.text);
    if (!parsed || typeof parsed.verdict !== 'string') {
      const result: VerdictResult = {
        verdict: 'soft_pending',
        summary: 'Auto-review returned an unexpected response — flagged for our team.',
        rejection_reason: 'Our automatic check could not produce a clear answer for this file. Our procurement team will review it manually.',
        findings: { ai_raw: aiResp.text },
      };
      await persistResult(supabase, attachment_id, result, aiResp.modelUsed);
      return jsonResponse(result);
    }

    const verdict = parsed.verdict === 'accepted' ? 'accepted' : 'rejected';
    const expiry = typeof parsed.extracted_fields?.expiry_date === 'string'
      ? parsed.extracted_fields.expiry_date
      : null;

    const result: VerdictResult = {
      verdict,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      rejection_reason: verdict === 'rejected'
        ? (parsed.rejection_reason || 'This document does not appear to match what was requested.')
        : undefined,
      findings: parsed,
      extracted_expiry_date: expiry || undefined,
    };

    await persistResult(supabase, attachment_id, result, aiResp.modelUsed);
    return jsonResponse(result);

  } catch (e: any) {
    console.error('vendor-document-review error:', e);
    return new Response(
      JSON.stringify({ error: e?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function buildContentParts(bytes: Uint8Array, mime: string, expectedLabel: string): AiContentPart[] {
  const parts: AiContentPart[] = [
    { type: 'text', text: `Please review the following document. The vendor uploaded it as: "${expectedLabel}".` },
  ];

  // Attach the document — image inline, PDF as base64
  if (mime.startsWith('image/')) {
    const base64 = btoa(String.fromCharCode(...bytes));
    parts.push({
      type: 'image_url',
      image_url: { url: `data:${mime};base64,${base64}` },
    } as any);
  } else if (mime === 'application/pdf') {
    // PDFs sent as base64 file part — both providers support this
    const base64 = btoa(String.fromCharCode(...bytes));
    parts.push({
      type: 'image_url',  // multimodal models accept PDFs through this part type
      image_url: { url: `data:${mime};base64,${base64}` },
    } as any);
  } else {
    parts.push({
      type: 'text',
      text: `(File format ${mime} is not directly supported for AI review. Treat as unverifiable.)`,
    });
  }

  return parts;
}

async function persistResult(
  supabase: any,
  attachmentId: string,
  result: VerdictResult,
  modelUsed: string | null,
): Promise<void> {
  const update: Record<string, any> = {
    ai_verdict: result.verdict,
    ai_summary: result.summary || null,
    ai_findings: result.findings || null,
    ai_rejection_reason: result.rejection_reason || null,
    ai_analysed_at: new Date().toISOString(),
    ai_model_used: modelUsed,
  };
  if (result.extracted_expiry_date) {
    update.extracted_expiry_date = result.extracted_expiry_date;
    // Initial authoritative value mirrors the AI's extraction;
    // procurement can override later.
    update.expiry_date = result.extracted_expiry_date;
    update.expiry_source = 'ai_extracted';
  }
  await supabase.from('vendor_attachments').update(update).eq('id', attachmentId);
}

function jsonResponse(result: VerdictResult): Response {
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
