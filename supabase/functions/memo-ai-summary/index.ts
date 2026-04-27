// memo-ai-summary
// Generates a structured executive summary for an internal memo, INCLUDING
// vision-based reading of PDF/image attachments.
//
// What changed from the prior version:
//  - Attachments are no longer described only by filename. Each attachment
//    that is a PDF or image is downloaded from the `attachments` storage
//    bucket and sent to the model as a multimodal input.
//  - Text-like attachments (txt, csv, json) are decoded and included as text.
//  - DOCX/XLSX are listed by name (binary parsing is left to the fraud-check
//    function which has dedicated handling).
//  - Fraud signals (if any have been recorded for this memo) are summarised
//    into a `fraud_alert` block so reviewers see them in the same panel.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  loadAiConfig,
  buildSupabase,
  authenticateUser,
  downloadAttachment,
  isImageMime,
  isPdfMime,
  isTextLikeMime,
  extractAsciiText,
  buildMultimodalUserMessage,
  callAi,
  safeJsonParse,
} from "../_shared/edge-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { service: supabase, anon } = buildSupabase();
    await authenticateUser(req, anon);

    const aiConfig = await loadAiConfig(supabase);

    const { memo_id } = await req.json();
    if (!memo_id) throw new Error("memo_id is required");

    // ---- Fetch context ------------------------------------------------------
    const { data: memo, error: memoErr } = await supabase
      .from("memos")
      .select("*")
      .eq("id", memo_id)
      .single();
    if (memoErr || !memo) throw new Error("Memo not found");

    const [{ data: profiles }, { data: departments }, { data: approvalSteps }, { data: attachments }] =
      await Promise.all([
        supabase.from("profiles").select("user_id, full_name, job_title, department_id"),
        supabase.from("departments").select("id, name, code"),
        supabase.from("approval_steps").select("*").eq("memo_id", memo_id).order("step_order"),
        supabase.from("memo_attachments").select("*").eq("memo_id", memo_id),
      ]);

    // ---- Fetch latest fraud signals for context (if any) -------------------
    const { data: fraudSignals } = await supabase
      .from("memo_fraud_signals")
      .select("severity, title, description, signal_type, layer")
      .eq("memo_id", memo_id)
      .order("detected_at", { ascending: false })
      .limit(40);

    // ---- Build text context -------------------------------------------------
    const getProfile = (uid?: string | null) =>
      uid ? profiles?.find((p: any) => p.user_id === uid) : null;
    const getDept = (did?: string | null) =>
      did ? departments?.find((d: any) => d.id === did) : null;

    const fromProfile = getProfile(memo.from_user_id);
    const toProfile = getProfile(memo.to_user_id);
    const dept = getDept(memo.department_id);

    const approverInfo =
      approvalSteps?.map((s: any) => {
        const p = getProfile(s.approver_user_id);
        return `Step ${s.step_order}: ${p?.full_name || "Unknown"} (${p?.job_title || "N/A"}) — Status: ${s.status}${s.comments ? `, Comments: "${s.comments}"` : ""}`;
      }).join("\n") || "No approval steps";

    // ---- Download readable attachments -------------------------------------
    const downloadedMedia: Array<{ name: string; mime: string; bytes: Uint8Array }> = [];
    const attachmentNotes: string[] = [];
    const attachmentSkipReasons: Array<{ name: string; reason: string }> = [];

    if (attachments && attachments.length > 0) {
      // Cap how many attachments we feed to AI per call to avoid token blowup
      const MAX_MEDIA = 8;
      const sortedByPriority = [...attachments].sort((a: any, b: any) => {
        // PDFs and images first, others later
        const score = (att: any) => {
          const t = (att.file_type || "").toLowerCase();
          const n = (att.file_name || "").toLowerCase();
          if (t === "application/pdf" || n.endsWith(".pdf")) return 0;
          if (t.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(n)) return 1;
          return 2;
        };
        return score(a) - score(b);
      });

      for (const att of sortedByPriority) {
        if (downloadedMedia.length >= MAX_MEDIA) {
          attachmentSkipReasons.push({ name: att.file_name, reason: "Skipped — attachment cap reached for AI summary" });
          continue;
        }
        const result = await downloadAttachment(supabase, att);
        if ("error" in result) {
          attachmentSkipReasons.push({ name: att.file_name, reason: result.error });
          continue;
        }
        if (isImageMime(result.mime) || isPdfMime(result.mime)) {
          downloadedMedia.push({ name: result.name, mime: result.mime, bytes: result.bytes });
          attachmentNotes.push(`- "${result.name}" (${result.mime}, ${Math.round(result.size / 1024)}KB) — embedded for visual reading`);
        } else if (isTextLikeMime(result.mime)) {
          const txt = extractAsciiText(result.bytes, 4000);
          attachmentNotes.push(`- "${result.name}" (${result.mime}, ${Math.round(result.size / 1024)}KB) — text content below:\n<<<\n${txt}\n>>>`);
        } else {
          attachmentNotes.push(`- "${result.name}" (${result.mime}, ${Math.round(result.size / 1024)}KB) — binary, not embedded`);
        }
      }
    }

    const fraudContextLines = (fraudSignals || []).slice(0, 20).map(
      (s: any) => `[${s.severity.toUpperCase()}] ${s.title}${s.description ? ` — ${s.description}` : ""}`,
    );

    const memoContext = `
MEMO METADATA:
- Transmittal No: ${memo.transmittal_no}
- Subject: ${memo.subject}
- Date: ${memo.date}
- Status: ${memo.status}
- From: ${fromProfile?.full_name || "Unknown"} (${fromProfile?.job_title || "N/A"})
- To: ${toProfile?.full_name || "Unknown"} (${toProfile?.job_title || "N/A"})
- Department: ${dept?.name || "Unknown"}
- Memo Types: ${memo.memo_types?.join(", ") || "N/A"}
- Action Comments from Creator: ${memo.action_comments || "None"}

MEMO BODY:
${memo.description || "(no description)"}

ATTACHMENTS (${attachments?.length || 0}):
${attachmentNotes.join("\n") || "None"}
${
  attachmentSkipReasons.length
    ? `\nSKIPPED ATTACHMENTS:\n${attachmentSkipReasons.map((s) => `- ${s.name}: ${s.reason}`).join("\n")}`
    : ""
}

APPROVAL WORKFLOW:
${approverInfo}

COPIES TO:
${memo.copies_to?.map((uid: string) => getProfile(uid)?.full_name || uid).join(", ") || "None"}

FRAUD-CHECK SIGNALS (most recent, may be empty):
${fraudContextLines.join("\n") || "(no signals recorded yet)"}
`;

    const systemPrompt = `You are an AI assistant helping corporate executives at Al Hamra (Kuwait) review and approve internal memos. Analyse the memo holistically — body, attachments (you have been given the actual PDF/image content of each attachment as multimodal input), workflow, and any fraud signals.

PRINCIPLES:
- Be concise, factual, and executive-friendly.
- Treat numbers, dates, and vendor names as data — extract precisely, do not invent.
- Detect financial amounts, vendor comparisons, deadlines, missing info, risks.
- If a section is not applicable to this memo, return null for that section (do not fabricate).
- Default currency is KWD.
- Output ONLY a valid JSON object — no markdown wrapping, no commentary.

Return EXACTLY this JSON shape:
{
  "executive_summary": {
    "summary": "3-5 line executive summary that includes anything notable extracted from the attachments themselves",
    "purpose": "Brief purpose statement",
    "request_type": "approval|decision|information|action|payment"
  },
  "financial_impact": {
    "total_amount": "formatted amount or null",
    "currency": "KWD or detected currency",
    "budget_available": "info if available or null",
    "payment_terms": "terms if mentioned or null",
    "cost_breakdown": ["item1: amount", "item2: amount"] | null
  } | null,
  "vendor_comparison": {
    "has_vendors": true|false,
    "vendors": [
      {"name": "Vendor A", "price": "amount", "delivery": "time|null", "terms": "terms|null", "highlight": "lowest|fastest|recommended|null"}
    ],
    "ai_insight": "comparison insight or null"
  } | null,
  "attachment_summary": {
    "total_count": <number>,
    "summaries": [
      {"name": "filename", "type": "PDF/Image/etc", "key_points": ["specific facts read from the file"]}
    ]
  } | null,
  "key_points": [
    {"point": "description", "severity": "high|medium|low", "category": "amount|budget|risk|deadline|missing_info|inconsistency"}
  ] | null,
  "fraud_alert": {
    "has_concerns": true|false,
    "summary": "1-2 sentence note if any high/medium fraud signals were recorded"
  } | null,
  "suggested_decision": {
    "recommendation": "approve|reject|clarify|null",
    "reasoning": "brief reasoning or null"
  } | null
}`;

    const userMessage = buildMultimodalUserMessage(
      `Analyse this memo and return the structured JSON summary.\n\n${memoContext}`,
      downloadedMedia,
    );

    const ai = await callAi(
      [
        { role: "system", content: systemPrompt },
        userMessage,
      ],
      {
        provider: aiConfig.provider,
        model: aiConfig.modelSummary || undefined,
        responseFormat: "json_object",
        openaiKey: aiConfig.openaiKey,
        lovableKey: aiConfig.lovableKey,
      },
    );

    const parsed = safeJsonParse(ai.text) || {
      executive_summary: {
        summary: ai.text.slice(0, 500),
        purpose: "Unable to parse structured response",
        request_type: "information",
      },
    };

    return new Response(
      JSON.stringify({
        summary: parsed,
        meta: {
          attachments_total: attachments?.length || 0,
          attachments_read_by_ai: downloadedMedia.length,
          attachments_skipped: attachmentSkipReasons.length,
          fraud_signals_known: fraudSignals?.length || 0,
          ai_provider_used: ai.providerUsed,
          ai_model_used: ai.modelUsed,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("memo-ai-summary error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg.includes("rate limit") ? 429 : msg.includes("credits") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
