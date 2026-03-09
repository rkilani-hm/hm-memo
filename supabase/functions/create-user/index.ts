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

  const body = await req.json();

  // --- UPDATE EXISTING USER ---
  if (body.action === "update_user") {
    const { user_id, full_name, department_id, job_title, roles, email, password } = body;

    // Update profile
    const profileUpdate: Record<string, unknown> = {};
    if (full_name !== undefined) profileUpdate.full_name = full_name;
    if (department_id !== undefined) profileUpdate.department_id = department_id || null;
    if (job_title !== undefined) profileUpdate.job_title = job_title || null;
    if (email !== undefined) profileUpdate.email = email;

    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await supabase.from("profiles").update(profileUpdate).eq("user_id", user_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
    }

    // Update auth email/password if provided
    const authUpdate: Record<string, unknown> = {};
    if (email) authUpdate.email = email;
    if (password) authUpdate.password = password;
    if (full_name) authUpdate.user_metadata = { full_name };
    if (Object.keys(authUpdate).length > 0) {
      const { error } = await supabase.auth.admin.updateUserById(user_id, authUpdate);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
    }

    // Sync roles: delete all then re-insert
    if (roles && Array.isArray(roles)) {
      await supabase.from("user_roles").delete().eq("user_id", user_id);
      for (const role of roles) {
        await supabase.from("user_roles").insert({ user_id, role });
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  // --- ASSIGN ROLE ONLY ---
  if (body._assign_role_only) {
    const { user_id, role } = body;
    await supabase.from("user_roles").insert({ user_id, role });
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  // --- CREATE NEW USER ---
  const { email, password, full_name, role, department_id, job_title } = body;

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
