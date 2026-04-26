// Shared helpers used by memo-ai-summary and memo-fraud-check.
// Deno edge function module — runtime is std@0.168.0 baseline.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function getEnv(): {
  supabaseUrl: string;
  serviceKey: string;
  anonKey: string;
  lovableKey: string;
} {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");

  if (!supabaseUrl) throw new Error("SUPABASE_URL is not configured");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  if (!anonKey) throw new Error("SUPABASE_ANON_KEY is not configured");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");

  return { supabaseUrl, serviceKey, anonKey, lovableKey };
}

export async function authenticateUser(
  req: Request,
  anonClient: SupabaseClient,
): Promise<{ id: string; email?: string }> {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) throw new Error("Not authenticated");
  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) throw new Error("Not authenticated");
  return { id: user.id, email: user.email };
}

// MIME helpers ------------------------------------------------------------

export function inferMimeFromName(name: string, fallback?: string | null): string {
  const ext = name.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    pdf:  "application/pdf",
    png:  "image/png",
    jpg:  "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif:  "image/gif",
    bmp:  "image/bmp",
    tiff: "image/tiff",
    tif:  "image/tiff",
    heic: "image/heic",
    heif: "image/heif",
    txt:  "text/plain",
    csv:  "text/csv",
    json: "application/json",
    xml:  "application/xml",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] || fallback || "application/octet-stream";
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function isPdfMime(mime: string): boolean {
  return mime === "application/pdf";
}

export function isTextLikeMime(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml"
  );
}

// Storage download --------------------------------------------------------

export interface DownloadedAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  bytes: Uint8Array;
  storagePath: string;
}

const ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024; // 15MB cap per file fed to AI

export async function downloadAttachment(
  supabase: SupabaseClient,
  attachment: { id: string; file_name: string; file_url: string; file_type: string | null; file_size: number | null },
): Promise<DownloadedAttachment | { id: string; name: string; error: string }> {
  try {
    if (attachment.file_size && attachment.file_size > ATTACHMENT_MAX_BYTES) {
      return {
        id: attachment.id,
        name: attachment.file_name,
        error: `File too large (${Math.round(attachment.file_size / 1024 / 1024)}MB) — skipped`,
      };
    }

    const { data, error } = await supabase.storage
      .from("attachments")
      .download(attachment.file_url);
    if (error || !data) {
      return { id: attachment.id, name: attachment.file_name, error: error?.message || "download failed" };
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes.byteLength > ATTACHMENT_MAX_BYTES) {
      return {
        id: attachment.id,
        name: attachment.file_name,
        error: `File too large (${Math.round(bytes.byteLength / 1024 / 1024)}MB) — skipped`,
      };
    }
    const mime = inferMimeFromName(attachment.file_name, attachment.file_type);
    return {
      id: attachment.id,
      name: attachment.file_name,
      mime,
      size: bytes.byteLength,
      bytes,
      storagePath: attachment.file_url,
    };
  } catch (e) {
    return {
      id: attachment.id,
      name: attachment.file_name,
      error: e instanceof Error ? e.message : "unknown download error",
    };
  }
}

// Base64 in Deno: use built-in (encoding/base64) ---------------------------
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

export function bytesToBase64(bytes: Uint8Array): string {
  return encodeBase64(bytes);
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${encodeBase64(bytes)}`;
}

// SHA-256 hex hash --------------------------------------------------------

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// AI gateway call ---------------------------------------------------------

export interface AiCallResult {
  text: string;
  raw: any;
}

export interface AiContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string | AiContentPart[];
}

export async function callAi(
  apiKey: string,
  messages: AiMessage[],
  opts: { model?: string; responseFormat?: "json_object" | "text" } = {},
): Promise<AiCallResult> {
  const model = opts.model || "google/gemini-2.5-flash";
  const body: Record<string, unknown> = {
    model,
    messages,
  };
  if (opts.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("AI rate limit exceeded");
    if (res.status === 402) throw new Error("AI credits exhausted");
    const text = await res.text();
    throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || "";
  return { text: typeof content === "string" ? content : JSON.stringify(content), raw: json };
}

// Strip ```json fences and parse safely
export function safeJsonParse<T = any>(text: string): T | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // attempt to extract first {...} block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Convenience: build a user-message content array that mixes text + media
export function buildMultimodalUserMessage(
  text: string,
  media: Array<{ name: string; mime: string; bytes: Uint8Array }>,
): AiMessage {
  const parts: AiContentPart[] = [{ type: "text", text }];
  for (const m of media) {
    if (isImageMime(m.mime) || isPdfMime(m.mime)) {
      // OpenAI-compatible "image_url" with data URL works for vision-capable Gemini models
      // through the Lovable gateway. PDFs are passed the same way; the gateway/model
      // either accepts them as inline_data or rejects gracefully.
      parts.push({
        type: "image_url",
        image_url: { url: bytesToDataUrl(m.bytes, m.mime) },
      });
    }
  }
  return { role: "user", content: parts };
}

// Text extraction fallbacks ------------------------------------------------

const decoder = new TextDecoder("utf-8");

export function extractAsciiText(bytes: Uint8Array, maxChars = 8000): string {
  // crude pass that just decodes; useful for txt/csv/json
  try {
    return decoder.decode(bytes).slice(0, maxChars);
  } catch {
    return "";
  }
}

export function buildSupabase(): { service: SupabaseClient; anon: SupabaseClient } {
  const { supabaseUrl, serviceKey, anonKey } = getEnv();
  return {
    service: createClient(supabaseUrl, serviceKey),
    anon: createClient(supabaseUrl, anonKey),
  };
}
