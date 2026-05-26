import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPERADMIN_EMAIL = "manassehudim@gmail.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Only superadmin may impersonate
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    if (userData.user.email?.toLowerCase() !== SUPERADMIN_EMAIL) {
      return json({ error: "Only the superadmin can impersonate users" }, 403);
    }

    const { user_id } = await req.json();
    if (!user_id || typeof user_id !== "string") {
      return json({ error: "user_id required" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Look up the target user's email (needed for generateLink)
    const { data: targetUser, error: lookupErr } = await admin.auth.admin.getUserById(user_id);
    if (lookupErr || !targetUser.user) return json({ error: "User not found" }, 404);

    const email = targetUser.user.email;
    if (!email) return json({ error: "Target user has no email" }, 400);

    // Generate a magic link that signs in as this user and lands on /student
    const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://admin.futurelabs.ng";
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${FRONTEND_URL}/student` },
    });

    if (linkErr || !linkData) return json({ error: linkErr?.message ?? "Failed to generate link" }, 500);

    return json({ action_link: linkData.properties.action_link });
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
