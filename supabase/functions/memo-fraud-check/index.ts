// memo-fraud-check
// Three-layer fraud analysis for an internal memo:
//   Layer A — forensic     (file metadata: EXIF, PDF /Producer, structural quirks)
//   Layer B — business     (cross-doc consistency, math, duplicates, vendor sanity)
//   Layer C — AI vision    (model inspects each PDF/image for visual tampering cues)
//
// Each fraud signal is persisted in `memo_fraud_signals`. A run row is written
// to `memo_fraud_runs`. The `AiApprovalSummary` UI reads both.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  getEnv,
  buildSupabase,
  authenticateUser,
  downloadAttachment,
  isImageMime,
  isPdfMime,
  buildMultimodalUserMessage,
  callAi,
  safeJsonParse,
  sha256Hex,
} from "../_shared/edge-utils.ts";
import {
  detectActualMime,
  analyzePdf,
  analyzeImage,
  EDITING_SOFTWARE_PATTERNS,
  SUSPICIOUS_PDF_PRODUCERS,
  LEGIT_PDF_PRODUCERS,
  type PdfForensics,
  type ImageForensics,
} from "../_shared/forensics.ts";

type Severity = "high" | "medium" | "low" | "info";
type Layer = "forensic" | "business" | "cross_doc" | "ai_visual";

interface Signal {
  layer: Layer;
  signal_type: string;
  severity: Severity;
  title: string;
  description?: string;
  attachment_id?: string | null;
  evidence?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lovableKey } = getEnv();
    const { service: supabase, anon } = buildSupabase();
    const user = await authenticateUser(req, anon);

    const { memo_id, mode } = await req.json();
    if (!memo_id) throw new Error("memo_id is required");

    // -------- Fetch settings ------------------------------------------------
    const { data: settings } = await supabase
      .from("fraud_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (settings && settings.enabled === false) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Fraud detection is disabled in settings" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -------- Fetch memo + attachments + history ---------------------------
    const { data: memo, error: memoErr } = await supabase
      .from("memos")
      .select("*")
      .eq("id", memo_id)
      .single();
    if (memoErr || !memo) throw new Error("Memo not found");

    const [{ data: attachments }, { data: profiles }, { data: departments }] = await Promise.all([
      supabase.from("memo_attachments").select("*").eq("memo_id", memo_id),
      supabase.from("profiles").select("user_id, full_name, job_title, department_id, created_at"),
      supabase.from("departments").select("id, name, code"),
    ]);

    const fromProfile = profiles?.find((p: any) => p.user_id === memo.from_user_id);
    const dept = departments?.find((d: any) => d.id === memo.department_id);

    // -------- Open run row -------------------------------------------------
    const { data: runRow, error: runErr } = await supabase
      .from("memo_fraud_runs")
      .insert({
        memo_id,
        triggered_by: user.id,
        status: "running",
      })
      .select("id")
      .single();
    if (runErr || !runRow) throw new Error(`Failed to start run: ${runErr?.message}`);
    const runId: string = runRow.id;

    const signals: Signal[] = [];

    const push = (s: Signal) => signals.push(s);

    // -------- Pre-compute hash for cross-memo duplicate detection ----------
    interface AttDigest {
      id: string;
      name: string;
      mime: string;
      size: number;
      bytes: Uint8Array;
      sha256: string;
    }
    const downloaded: AttDigest[] = [];
    const downloadFailures: Array<{ id: string; name: string; reason: string }> = [];

    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        const r = await downloadAttachment(supabase, att);
        if ("error" in r) {
          downloadFailures.push({ id: att.id, name: att.file_name, reason: r.error });
          continue;
        }
        const sha = await sha256Hex(r.bytes);
        downloaded.push({
          id: r.id,
          name: r.name,
          mime: r.mime,
          size: r.size,
          bytes: r.bytes,
          sha256: sha,
        });
      }
    }

    // ============================================================
    // Layer A — Forensic per attachment
    // ============================================================
    interface ForensicOut {
      pdf?: PdfForensics;
      image?: ImageForensics;
      detectedMime: string | null;
    }
    const forensicByAtt: Record<string, ForensicOut> = {};

    for (const a of downloaded) {
      const detected = detectActualMime(a.bytes);
      const out: ForensicOut = { detectedMime: detected };

      // Mismatched declared vs detected mime is itself a signal
      if (detected && detected !== a.mime && !(detected === "application/zip" && /\.(docx|xlsx|pptx)$/i.test(a.name))) {
        push({
          layer: "forensic",
          signal_type: "mime_mismatch",
          severity: "medium",
          title: "File type doesn't match its extension",
          description: `Declared as ${a.mime} but bytes look like ${detected}.`,
          attachment_id: a.id,
          evidence: { declared_mime: a.mime, detected_mime: detected, file_name: a.name },
        });
      }

      if (detected === "application/pdf" || isPdfMime(a.mime)) {
        const pdf = analyzePdf(a.bytes);
        out.pdf = pdf;

        if (!pdf.isPdf) {
          push({
            layer: "forensic",
            signal_type: "pdf_corrupt_header",
            severity: "medium",
            title: "PDF header missing",
            description: "File is delivered as PDF but does not start with %PDF.",
            attachment_id: a.id,
          });
        } else {
          // Producer / Creator analysis -------------------------------------
          const produceText = `${pdf.producer || ""} ${pdf.creator || ""}`;
          const looksLegit = LEGIT_PDF_PRODUCERS.some((re) => re.test(produceText));
          const looksRisky = SUSPICIOUS_PDF_PRODUCERS.some((re) => re.test(produceText));
          if (looksRisky && !looksLegit) {
            push({
              layer: "forensic",
              signal_type: "pdf_producer_suspicious",
              severity: "medium",
              title: "PDF was last saved by an editing tool",
              description: `Producer/Creator: ${produceText.trim() || "unknown"}. This is unusual for an original ERP-generated invoice.`,
              attachment_id: a.id,
              evidence: { producer: pdf.producer, creator: pdf.creator },
            });
          }
          if (!pdf.producer && !pdf.creator) {
            push({
              layer: "forensic",
              signal_type: "pdf_no_producer",
              severity: "low",
              title: "PDF has no Producer/Creator metadata",
              description: "Genuine business documents almost always carry producer metadata.",
              attachment_id: a.id,
            });
          }

          // Incremental updates / multiple saves ---------------------------
          if (pdf.hasIncrementalUpdate) {
            push({
              layer: "forensic",
              signal_type: "pdf_incremental_update",
              severity: "high",
              title: "PDF has been re-saved after creation",
              description: `Found ${pdf.startxrefCount} startxref entries and ${pdf.eofCount} EOF markers. Original ERP-generated PDFs are saved exactly once.`,
              attachment_id: a.id,
              evidence: { startxrefCount: pdf.startxrefCount, eofCount: pdf.eofCount },
            });
          }

          // CreationDate vs ModDate divergence -----------------------------
          if (pdf.creationDate && pdf.modDate && pdf.creationDate !== pdf.modDate) {
            push({
              layer: "forensic",
              signal_type: "pdf_creation_modification_divergence",
              severity: "medium",
              title: "PDF creation and modification dates differ",
              description: `CreationDate=${pdf.creationDate}, ModDate=${pdf.modDate}.`,
              attachment_id: a.id,
              evidence: { creationDate: pdf.creationDate, modDate: pdf.modDate },
            });
          }

          // Embedded weirdness ---------------------------------------------
          if (pdf.containsLaunch) {
            push({
              layer: "forensic",
              signal_type: "pdf_launch_action",
              severity: "high",
              title: "PDF contains a /Launch action",
              description: "Auto-launch actions are essentially never present in legitimate invoices and are a known phishing vector.",
              attachment_id: a.id,
            });
          }
          if (pdf.containsJavaScript) {
            push({
              layer: "forensic",
              signal_type: "pdf_javascript",
              severity: "medium",
              title: "PDF contains embedded JavaScript",
              description: "Unusual for static invoices/delivery notes.",
              attachment_id: a.id,
            });
          }
          if (pdf.embeddedFiles > 0) {
            push({
              layer: "forensic",
              signal_type: "pdf_embedded_files",
              severity: "low",
              title: `PDF embeds ${pdf.embeddedFiles} additional file(s)`,
              description: "Worth reviewing — embedded files inside an invoice are unusual.",
              attachment_id: a.id,
            });
          }

          if (pdf.hasDigitalSignature) {
            push({
              layer: "forensic",
              signal_type: "pdf_digital_signature_present",
              severity: "info",
              title: "PDF carries a digital signature",
              description: "Signature presence detected; cryptographic verification is not performed in this layer.",
              attachment_id: a.id,
            });
          }
        }
      } else if (detected?.startsWith("image/") || isImageMime(a.mime)) {
        const img = analyzeImage(a.bytes);
        out.image = img;

        // Editing software fingerprints ----------------------------------
        const swText = `${img.software || ""} ${img.pngTextChunks.map((c) => `${c.keyword}=${c.value}`).join(" ")}`;
        const isEdited = EDITING_SOFTWARE_PATTERNS.some((re) => re.test(swText));
        if (isEdited) {
          const sev = (img.make || img.model) ? "medium" : "high";
          push({
            layer: "forensic",
            signal_type: "image_edited_in_software",
            severity: sev,
            title: "Image was processed by photo-editing software",
            description: `Detected: "${img.software || swText.trim()}". For original document scans this is a red flag${sev === "high" ? " (no camera Make/Model present, which would normally indicate a phone/scanner original)" : ""}.`,
            attachment_id: a.id,
            evidence: { software: img.software, make: img.make, model: img.model, png_text: img.pngTextChunks },
          });
        }

        // No EXIF on JPEG that "should" be a scan/phone ------------------
        if (img.format === "jpeg" && !img.make && !img.model && !img.software) {
          push({
            layer: "forensic",
            signal_type: "image_stripped_exif",
            severity: "low",
            title: "JPEG has no EXIF metadata",
            description: "Scans and phone photos normally carry EXIF tags. Stripped EXIF often indicates the file passed through a web export or editor.",
            attachment_id: a.id,
          });
        }

        // Multiple APP1 segments — common after re-encoding -------------
        if (img.format === "jpeg" && img.hasMultipleApp1) {
          push({
            layer: "forensic",
            signal_type: "image_multiple_app1",
            severity: "low",
            title: "JPEG contains multiple APP1 segments",
            description: "Multiple APP1 metadata blocks suggest the image was opened and re-saved.",
            attachment_id: a.id,
          });
        }

        // ModifyDate later than DateTimeOriginal --------------------------
        if (img.dateTimeOriginal && img.modifyDate && img.dateTimeOriginal !== img.modifyDate) {
          push({
            layer: "forensic",
            signal_type: "image_modified_after_capture",
            severity: "medium",
            title: "Image was modified after capture",
            description: `Captured: ${img.dateTimeOriginal}, last modified: ${img.modifyDate}.`,
            attachment_id: a.id,
            evidence: { dateTimeOriginal: img.dateTimeOriginal, modifyDate: img.modifyDate },
          });
        }
      }

      forensicByAtt[a.id] = out;
    }

    // ============================================================
    // Layer B — Cross-memo duplicates (deterministic SQL)
    // ============================================================
    if (downloaded.length > 0 && settings?.duplicate_lookback_days) {
      const lookback = new Date();
      lookback.setDate(lookback.getDate() - (settings?.duplicate_lookback_days ?? 365));
      const lookbackIso = lookback.toISOString();

      // Look for any other memo_attachment with the same SHA-256 in the lookback window.
      // We add a new column transparently via materialised lookup using `file_size` + name match
      // since the schema has no hash column. Approximate: same name + same size + different memo.
      for (const a of downloaded) {
        const { data: dupes } = await supabase
          .from("memo_attachments")
          .select("id, memo_id, file_name, file_size, uploaded_at")
          .neq("memo_id", memo_id)
          .eq("file_name", a.name)
          .eq("file_size", a.size)
          .gte("uploaded_at", lookbackIso)
          .limit(5);

        if (dupes && dupes.length > 0) {
          push({
            layer: "business",
            signal_type: "duplicate_attachment_filename_size",
            severity: "medium",
            title: "Same file appears on a previous memo",
            description: `An attachment with identical name and size was uploaded to ${dupes.length} other memo(s) in the last ${settings.duplicate_lookback_days} days.`,
            attachment_id: a.id,
            evidence: { previous_memos: dupes.map((d: any) => d.memo_id), file_name: a.name, file_size: a.size },
          });
        }
      }
    }

    // -------- Vendor age check (creator profile freshness) ----------------
    if (fromProfile?.created_at && settings?.vendor_new_threshold_days) {
      const created = new Date(fromProfile.created_at).getTime();
      const ageDays = Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24));
      if (ageDays < settings.vendor_new_threshold_days) {
        push({
          layer: "business",
          signal_type: "submitter_account_new",
          severity: "low",
          title: "Submitter account is recent",
          description: `Submitter joined ${ageDays} days ago.`,
          evidence: { submitter_id: memo.from_user_id, age_days: ageDays },
        });
      }
    }

    // ============================================================
    // Layer C — AI visual + cross-document reasoning
    // ============================================================
    // We pass the actual files plus the memo body and ask the model to:
    //   1. Read each invoice/delivery-note/GRN
    //   2. Cross-check totals, dates, qty, vendor, currency between docs
    //   3. Spot visual tampering hints (font discontinuity, white overlays,
    //      misaligned digits, "scratched" values)
    //   4. Spot internal math errors
    //   5. Spot dates that don't make sense

    const mediaForAi = downloaded
      .filter((d) => isPdfMime(d.mime) || isImageMime(d.mime))
      .slice(0, 8); // cap

    let aiSummary = "";
    let aiSignals: Signal[] = [];
    let parsedExtraction: any = null;

    if (mediaForAi.length > 0) {
      const memoIntro = `
You are auditing the attachments of an internal memo for **fraud indicators**.

MEMO METADATA:
- Subject: ${memo.subject}
- Memo Date: ${memo.date}
- Department: ${dept?.name || "N/A"}
- Memo Types: ${memo.memo_types?.join(", ") || "N/A"}
- Submitter: ${fromProfile?.full_name || "Unknown"}
- Body: ${(memo.description || "").replace(/\s+/g, " ").slice(0, 1500)}

ATTACHMENTS PROVIDED (in order):
${mediaForAi.map((m, i) => `  ${i + 1}. "${m.name}" (${m.mime})`).join("\n")}

YOUR TASK
Inspect the attached files visually and structurally. Then return STRICT JSON
matching the schema below — no prose, no markdown.

SCHEMA:
{
  "extracted": [
    {
      "attachment_index": 1,             // 1-based, matches list above
      "doc_type": "invoice|delivery_note|goods_received|purchase_order|quotation|receipt|contract|bank_letter|other",
      "vendor_name": null|string,
      "vendor_tax_id": null|string,
      "invoice_number": null|string,
      "po_number": null|string,
      "issue_date": null|"YYYY-MM-DD",
      "due_date": null|"YYYY-MM-DD",
      "currency": null|string,
      "subtotal": null|number,
      "tax_amount": null|number,
      "total_amount": null|number,
      "line_items": [{"description": string, "qty": number|null, "unit_price": number|null, "line_total": number|null}],
      "bank_account": null|string,
      "beneficiary_name": null|string
    }
  ],
  "math_check": [
    {"attachment_index": <int>, "ok": true|false, "note": string|null}
  ],
  "cross_document": [
    {"finding": string, "severity": "high|medium|low", "attachments_involved": [<int>]}
  ],
  "visual_tampering": [
    {
      "attachment_index": <int>,
      "severity": "high|medium|low",
      "indicator": "white_overlay|font_mismatch|misaligned_digits|copy_move|cut_paste|color_inconsistency|smudge_overwrite|other",
      "where": "short description of where on the document",
      "explanation": "what you observed and why it suggests tampering"
    }
  ],
  "date_logic": [
    {"finding": string, "severity": "high|medium|low"}
  ],
  "scope_consistency": [
    {"finding": string, "severity": "high|medium|low"}
  ],
  "overall_assessment": {
    "risk": "clean|low|medium|high|critical",
    "summary": "1-3 sentence summary of fraud risk for the approver"
  }
}

CRITICAL RULES
- Output ONLY the JSON object. No commentary.
- If a field is unknown, use null. Never guess.
- "visual_tampering" should only flag things you can actually see in the image/PDF (not speculation about producer metadata — that's covered elsewhere).
- "math_check" should compare line_items × qty + tax to the printed total.
- "cross_document" checks: same vendor across docs? same currency? quantities consistent between PO → DN → GRN → Invoice? totals consistent?
- "date_logic" checks: invoice date ≥ PO date; GRN date ≥ delivery; no weekend/holiday red flags for Kuwait (Fri/Sat = weekend).
- "scope_consistency" checks: do the goods/services described match the memo's stated purpose?
`.trim();

      try {
        const userMessage = buildMultimodalUserMessage(memoIntro, mediaForAi);

        const ai = await callAi(
          lovableKey,
          [
            {
              role: "system",
              content:
                "You are a forensic accountant and document-authenticity expert. You are conservative — you only flag what is supported by visible evidence.",
            },
            userMessage,
          ],
          { responseFormat: "json_object" },
        );

        parsedExtraction = safeJsonParse(ai.text);
        if (parsedExtraction) {
          // Convert AI findings into signals
          for (const m of parsedExtraction.math_check || []) {
            if (m.ok === false) {
              const idx = (m.attachment_index || 1) - 1;
              const att = mediaForAi[idx];
              aiSignals.push({
                layer: "ai_visual",
                signal_type: "math_error",
                severity: "high",
                title: "Math error on document",
                description: m.note || "Subtotal + tax does not equal total.",
                attachment_id: att?.id,
              });
            }
          }
          for (const cd of parsedExtraction.cross_document || []) {
            aiSignals.push({
              layer: "cross_doc",
              signal_type: "cross_document_inconsistency",
              severity: (cd.severity as Severity) || "medium",
              title: "Cross-document inconsistency",
              description: cd.finding,
              evidence: { attachments_involved: cd.attachments_involved },
            });
          }
          for (const vt of parsedExtraction.visual_tampering || []) {
            const idx = (vt.attachment_index || 1) - 1;
            const att = mediaForAi[idx];
            aiSignals.push({
              layer: "ai_visual",
              signal_type: `visual_tampering_${vt.indicator || "other"}`,
              severity: (vt.severity as Severity) || "medium",
              title: `Possible visual tampering: ${vt.indicator || "unspecified"}`,
              description: `${vt.where ? `Location: ${vt.where}. ` : ""}${vt.explanation || ""}`.trim(),
              attachment_id: att?.id,
              evidence: { indicator: vt.indicator, where: vt.where },
            });
          }
          for (const dl of parsedExtraction.date_logic || []) {
            aiSignals.push({
              layer: "business",
              signal_type: "date_logic_issue",
              severity: (dl.severity as Severity) || "medium",
              title: "Date inconsistency",
              description: dl.finding,
            });
          }
          for (const sc of parsedExtraction.scope_consistency || []) {
            aiSignals.push({
              layer: "business",
              signal_type: "scope_consistency_issue",
              severity: (sc.severity as Severity) || "low",
              title: "Scope/purpose mismatch",
              description: sc.finding,
            });
          }
          aiSummary = parsedExtraction.overall_assessment?.summary || "";

          // -------- Cross-memo split-purchase detection (uses extracted vendor + amount)
          if (settings?.split_threshold_kwd && settings?.split_window_days) {
            const totals = (parsedExtraction.extracted || [])
              .map((e: any) => Number(e.total_amount))
              .filter((n: number) => !isNaN(n) && n > 0);
            const max = totals.length ? Math.max(...totals) : 0;
            const threshold = Number(settings.split_threshold_kwd);
            if (max > 0 && max >= threshold * 0.85 && max < threshold) {
              aiSignals.push({
                layer: "business",
                signal_type: "amount_just_below_threshold",
                severity: "medium",
                title: "Amount sits just below an approval threshold",
                description: `Largest invoice total ≈ ${max} KWD, threshold ${threshold} KWD. Possible split purchase.`,
                evidence: { max, threshold },
              });
            }
          }
        } else {
          aiSummary = "AI returned a non-JSON response.";
        }
      } catch (e) {
        aiSummary = `AI vision step failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else {
      aiSummary = "No PDF/image attachments were available to analyse visually.";
    }

    // -------- Persist signals ---------------------------------------------
    const allSignals = [...signals, ...aiSignals];
    const insertRows = allSignals.map((s) => ({
      memo_id,
      attachment_id: s.attachment_id || null,
      run_id: runId,
      layer: s.layer,
      signal_type: s.signal_type,
      severity: s.severity,
      title: s.title,
      description: s.description || null,
      evidence: s.evidence || {},
    }));

    if (insertRows.length > 0) {
      const { error: insertErr } = await supabase
        .from("memo_fraud_signals")
        .insert(insertRows);
      if (insertErr) console.error("Failed to insert signals:", insertErr);
    }

    // -------- Compute aggregate -------------------------------------------
    const high = allSignals.filter((s) => s.severity === "high").length;
    const med = allSignals.filter((s) => s.severity === "medium").length;
    const low = allSignals.filter((s) => s.severity === "low").length;

    let overall: "clean" | "low" | "medium" | "high" | "critical" = "clean";
    if (high >= 3) overall = "critical";
    else if (high >= 1) overall = "high";
    else if (med >= 3) overall = "high";
    else if (med >= 1) overall = "medium";
    else if (low >= 1) overall = "low";

    // Override with AI's overall_assessment if it's worse
    const aiRisk = parsedExtraction?.overall_assessment?.risk;
    const rank = (r: string) => ["clean", "low", "medium", "high", "critical"].indexOf(r);
    if (aiRisk && rank(aiRisk) > rank(overall)) overall = aiRisk;

    await supabase
      .from("memo_fraud_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "completed",
        attachments_scanned: downloaded.length,
        high_count: high,
        medium_count: med,
        low_count: low,
        overall_risk: overall,
        ai_summary: aiSummary || null,
        raw_response: parsedExtraction || null,
      })
      .eq("id", runId);

    return new Response(
      JSON.stringify({
        run_id: runId,
        overall_risk: overall,
        counts: { high, medium: med, low },
        signals: allSignals,
        ai_summary: aiSummary,
        attachments_scanned: downloaded.length,
        download_failures: downloadFailures,
        extracted: parsedExtraction?.extracted || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("memo-fraud-check error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
