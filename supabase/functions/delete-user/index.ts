import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is an admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const { data: roleCheck } = await userClient.rpc("has_role" as any, {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!roleCheck) return json({ error: "Only admins can delete user accounts" }, 403);

    const { user_id } = await req.json();
    if (!user_id || typeof user_id !== "string") {
      return json({ error: "user_id required" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Only delete auth user if they have no remaining enrollments
    const { count } = await admin
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id);

    if ((count ?? 0) > 0) {
      return json({ deleted: false, reason: "user_has_other_enrollments" });
    }

    const { error: deleteErr } = await admin.auth.admin.deleteUser(user_id);
    if (deleteErr) return json({ error: deleteErr.message }, 500);

    return json({ deleted: true });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
