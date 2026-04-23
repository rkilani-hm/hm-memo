import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Save approved memo PDF to SharePoint via Microsoft Graph API.
 *
 * Required Supabase secrets:
 *   SHAREPOINT_TENANT_ID     – Azure AD tenant ID
 *   SHAREPOINT_CLIENT_ID     – App registration client ID
 *   SHAREPOINT_CLIENT_SECRET – App registration client secret
 *   SHAREPOINT_SITE_ID       – SharePoint site ID (see README below)
 *   SHAREPOINT_BASE_FOLDER   – e.g. "IM-GRS-IM-WO-IPC-PAF-Assets/IM"
 *
 * How to get the Site ID:
 *   GET https://graph.microsoft.com/v1.0/sites/{hostname}:/sites/{site-name}
 *   e.g. GET https://graph.microsoft.com/v1.0/sites/alhamrarealestate.sharepoint.com:/sites/ICTTeamSite
 *   The response contains the "id" field.
 *
 * Azure AD App Registration requirements:
 *   - Application (not delegated) permissions: Sites.ReadWrite.All
 *   - Admin consent granted
 */

interface RequestBody {
  pdfBase64: string;       // Base64-encoded PDF file content
  fileName: string;        // e.g. "HM-IT-IM-0036-2026"
  year: string;            // e.g. "2026"
  transmittalNo: string;   // Original transmittal number for logging
}

/** Get an OAuth2 access token using client credentials flow */
async function getAccessToken(): Promise<string> {
  const tenantId = Deno.env.get("SHAREPOINT_TENANT_ID");
  const clientId = Deno.env.get("SHAREPOINT_CLIENT_ID");
  const clientSecret = Deno.env.get("SHAREPOINT_CLIENT_SECRET");

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Missing SharePoint credentials. Set SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET.");
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Azure AD token error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
}

/** Upload a file to SharePoint using Microsoft Graph API */
async function uploadToSharePoint(
  accessToken: string,
  fileBytes: Uint8Array,
  folderPath: string,
  fileName: string
): Promise<{ webUrl: string; id: string }> {
  const siteId = Deno.env.get("SHAREPOINT_SITE_ID");
  if (!siteId) throw new Error("Missing SHAREPOINT_SITE_ID.");

  // Graph API: PUT /sites/{site-id}/drive/root:/{item-path}:/content
  // This creates intermediate folders if they don't exist (for files < 4MB)
  const itemPath = `${folderPath}/${fileName}`;
  const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${itemPath}:/content`;

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/pdf",
    },
    body: fileBytes,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`SharePoint upload error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return { webUrl: data.webUrl, id: data.id };
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { pdfBase64, fileName, year, transmittalNo } = (await req.json()) as RequestBody;

    if (!pdfBase64 || !fileName || !year) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: pdfBase64, fileName, year" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decode base64 to bytes
    const binaryString = atob(pdfBase64);
    const fileBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      fileBytes[i] = binaryString.charCodeAt(i);
    }

    // Build folder path: {base_folder}/{year}
    const baseFolder = Deno.env.get("SHAREPOINT_BASE_FOLDER") || "IM-GRS-IM-WO-IPC-PAF-Assets/IM";
    const folderPath = `${baseFolder}/${year}`;
    const fullFileName = `${fileName}.pdf`;

    console.log(`Uploading ${fullFileName} to SharePoint: ${folderPath}/`);

    // Get token and upload
    const accessToken = await getAccessToken();
    const result = await uploadToSharePoint(accessToken, fileBytes, folderPath, fullFileName);

    console.log(`✅ Uploaded successfully: ${result.webUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        webUrl: result.webUrl,
        fileId: result.id,
        path: `${folderPath}/${fullFileName}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("SharePoint upload failed:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
