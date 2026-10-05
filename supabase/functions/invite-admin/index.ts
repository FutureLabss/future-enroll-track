import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getSiteConfig } from "../_shared/site-config.ts";

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

    // Verify caller is a system owner.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const { email } = await req.json();
    if (!email || typeof email !== "string") return json({ error: "Email required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: owner } = await admin.from("system_owners").select("user_id").eq("user_id", userData.user.id).maybeSingle();
    if (!owner) return json({ error: "Only a system owner can invite admins" }, 403);

    // Record pending admin invite first (so signup auto-promotes)
    const { error: rpcErr } = await userClient.rpc("create_admin_invite" as any, { p_email: email });
    if (rpcErr) return json({ error: rpcErr.message }, 400);

    // Try to send Supabase invitation email (works if user doesn't exist).
    // New users land on /set-password to choose a password, then go to /admin.
    const FRONTEND_URL = getSiteConfig().frontendUrl;
    const redirectTo = `${FRONTEND_URL}/set-password?next=%2Fadmin`;
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });

    let inviteSent = !inviteErr;
    let alreadyExisted = false;
    if (inviteErr) {
      const msg = inviteErr.message?.toLowerCase() || "";
      if (msg.includes("already") || msg.includes("registered")) {
        alreadyExisted = true;
      } else {
        // Non-fatal: invite recorded, but email failed
        console.warn("Invite email failed:", inviteErr.message);
      }
    }

    return json({
      success: true,
      invite_sent: inviteSent,
      already_existed: alreadyExisted,
      user_id: inviteData?.user?.id ?? null,
    });
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
