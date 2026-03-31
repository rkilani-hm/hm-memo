import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate user
    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const token = authHeader?.replace("Bearer ", "");
    if (!token) throw new Error("Not authenticated");
    const {
      data: { user },
      error: authErr,
    } = await anonClient.auth.getUser(token);
    if (authErr || !user) throw new Error("Not authenticated");

    const { memo_id } = await req.json();
    if (!memo_id) throw new Error("memo_id is required");

    // Fetch memo
    const { data: memo, error: memoErr } = await supabase
      .from("memos")
      .select("*")
      .eq("id", memo_id)
      .single();
    if (memoErr || !memo) throw new Error("Memo not found");

    // Fetch profiles for context
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, job_title, department_id")
      .eq("is_active", true);

    const { data: departments } = await supabase
      .from("departments")
      .select("id, name, code");

    const { data: approvalSteps } = await supabase
      .from("approval_steps")
      .select("*")
      .eq("memo_id", memo_id)
      .order("step_order");

    const { data: attachments } = await supabase
      .from("memo_attachments")
      .select("*")
      .eq("memo_id", memo_id);

    // Build context
    const getProfile = (uid: string) =>
      profiles?.find((p: any) => p.user_id === uid);
    const getDept = (did: string) =>
      departments?.find((d: any) => d.id === did);

    const fromProfile = getProfile(memo.from_user_id);
    const toProfile = memo.to_user_id ? getProfile(memo.to_user_id) : null;
    const dept = getDept(memo.department_id);

    const attachmentSummaries: string[] = [];
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        attachmentSummaries.push(
          `- File: "${att.file_name}" (Type: ${att.file_type || "unknown"}, Size: ${att.file_size ? Math.round(att.file_size / 1024) + "KB" : "unknown"})`
        );
      }
    }

    const approverInfo =
      approvalSteps
        ?.map((s: any) => {
          const p = getProfile(s.approver_user_id);
          return `Step ${s.step_order}: ${p?.full_name || "Unknown"} (${p?.job_title || "N/A"}) — Status: ${s.status}${s.comments ? `, Comments: "${s.comments}"` : ""}`;
        })
        .join("\n") || "No approval steps";

    const memoContext = `
MEMO DETAILS:
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
${memo.description || "No description provided."}

ATTACHMENTS (${attachments?.length || 0}):
${attachmentSummaries.length > 0 ? attachmentSummaries.join("\n") : "None"}

APPROVAL WORKFLOW:
${approverInfo}

COPIES TO: ${memo.copies_to?.map((uid: string) => getProfile(uid)?.full_name || uid).join(", ") || "None"}
`;

    const systemPrompt = `You are an AI assistant helping corporate executives quickly review and approve internal memos. Analyze the memo and provide a structured summary in JSON format.

IMPORTANT RULES:
- Be concise and executive-friendly
- Focus on actionable insights
- Detect financial amounts, vendor comparisons, risks
- If data is not available for a section, return null for that section
- All monetary amounts should include currency if detectable (default to KWD if not specified)
- Return ONLY valid JSON, no markdown wrapping

Return this exact JSON structure:
{
  "executive_summary": {
    "summary": "3-5 line executive summary",
    "purpose": "Brief purpose statement",
    "request_type": "approval|decision|information|action|payment"
  },
  "financial_impact": {
    "total_amount": "formatted amount or null",
    "currency": "KWD or detected currency",
    "budget_available": "info if available or null",
    "payment_terms": "terms if mentioned or null",
    "cost_breakdown": ["item1: amount", "item2: amount"] or null
  },
  "vendor_comparison": {
    "has_vendors": true/false,
    "vendors": [
      {"name": "Vendor A", "price": "amount", "delivery": "time or null", "terms": "terms or null", "highlight": "lowest/fastest/etc or null"}
    ],
    "ai_insight": "comparison insight or null"
  },
  "attachment_summary": {
    "total_count": number,
    "summaries": [
      {"name": "filename", "type": "PDF/Excel/etc", "key_points": ["point1", "point2"]}
    ]
  },
  "key_points": [
    {"point": "description", "severity": "high|medium|low", "category": "amount|budget|risk|deadline|missing_info"}
  ],
  "suggested_decision": {
    "recommendation": "approve|reject|clarify|null",
    "reasoning": "brief reasoning or null"
  }
}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Analyze this memo and provide the structured summary:\n\n${memoContext}`,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded. Please try again shortly.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error: "AI credits exhausted. Please add funds.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI analysis failed");
    }

    const aiResult = await response.json();
    let content =
      aiResult.choices?.[0]?.message?.content || "{}";

    // Strip markdown code fences if present
    content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      parsed = {
        executive_summary: {
          summary: content.slice(0, 500),
          purpose: "Unable to parse structured response",
          request_type: "information",
        },
      };
    }

    return new Response(JSON.stringify({ summary: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("memo-ai-summary error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
