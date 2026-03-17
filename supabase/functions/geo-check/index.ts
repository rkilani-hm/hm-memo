import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_COUNTRIES = ["KW", "EG"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Deno Deploy / Supabase Edge Functions expose the client IP via headers
    const forwarded = req.headers.get("x-forwarded-for");
    const clientIp = forwarded ? forwarded.split(",")[0].trim() : "unknown";

    // Use a free geo-IP lookup service
    let country = "Unknown";
    try {
      const geoRes = await fetch(`https://ipapi.co/${clientIp}/country/`, {
        headers: { "User-Agent": "AlHamraMemoApp/1.0" },
      });
      if (geoRes.ok) {
        country = (await geoRes.text()).trim();
      }
    } catch {
      // If geo lookup fails, allow access (fail-open for reliability)
      country = "Unknown";
    }

    const allowed = ALLOWED_COUNTRIES.includes(country) || country === "Unknown";

    return new Response(
      JSON.stringify({ allowed, country, ip: clientIp }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    // Fail-open: if anything goes wrong, allow access
    return new Response(
      JSON.stringify({ allowed: true, country: "Unknown", error: error.message }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
