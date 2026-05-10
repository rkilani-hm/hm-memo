import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
}

async function getAccessToken(): Promise<string> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Azure AD credentials not configured");
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get Azure token [${res.status}]: ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { to, subject, body, isHtml = true }: EmailRequest = await req.json();

    if (!to?.length || !subject || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const accessToken = await getAccessToken();

    // Sender mailbox for the Microsoft Graph sendMail call. Configured
    // via the O365_SENDER_EMAIL secret in Supabase; the fallback below
    // is used if that secret is unset (which shouldn't happen in
    // production but is a safe default).
    //
    // The sender mailbox MUST exist in the Microsoft 365 tenant and
    // the registered Azure AD app must have Mail.Send (application)
    // permission granted on it. Otherwise Graph returns 403.
    const senderEmail = Deno.env.get("O365_SENDER_EMAIL") || "ememo@alhamra.com.kw";

    const graphUrl = senderEmail
      ? `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`
      : `https://graph.microsoft.com/v1.0/users/${to[0]}/sendMail`;

    // If no sender is configured, we'll use the /sendMail endpoint differently
    const message = {
      message: {
        subject,
        body: {
          contentType: isHtml ? "HTML" : "Text",
          content: body,
        },
        toRecipients: to.map((email) => ({
          emailAddress: { address: email },
        })),
      },
      saveToSentItems: false,
    };

    // Only send if we have a sender configured
    if (!senderEmail) {
      console.warn("O365_SENDER_EMAIL not configured — email queued but not sent");
      return new Response(
        JSON.stringify({
          success: false,
          warning: "O365_SENDER_EMAIL not configured. Set the sender email to enable sending.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const graphRes = await fetch(graphUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!graphRes.ok) {
      const errBody = await graphRes.text();
      throw new Error(`Graph API sendMail failed [${graphRes.status}]: ${errBody}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("send-email error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
