import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { email, password, full_name, role, department_id, job_title } = await req.json();

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (authError) return new Response(JSON.stringify({ error: authError.message }), { status: 400, headers: corsHeaders });

  const userId = authData.user.id;

  // Update profile
  if (department_id || job_title) {
    await supabase.from("profiles").update({ department_id, job_title, full_name }).eq("user_id", userId);
  }

  // Assign role
  if (role) {
    await supabase.from("user_roles").insert({ user_id: userId, role });
  }

  return new Response(JSON.stringify({ user_id: userId }), { headers: corsHeaders });
});
