import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  email: string;
  hubName: string;
  hubId: string;
  hubRole: string; // 'owner' | 'admin'
  token: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://admin.futurelabs.ng";
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

    // Verify caller is a superadmin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: saRow } = await admin
      .from("superadmins")
      .select("user_id")
      .eq("user_id", userRes.user.id)
      .maybeSingle();

    if (!saRow) {
      return new Response(JSON.stringify({ error: "Superadmin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: Payload = await req.json();
    const { email, hubName, token } = payload;

    const inviteUrl = `${FRONTEND_URL}/accept-hub-invitation?token=${token}`;

    // Try Supabase invite first (creates account if new)
    const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteUrl,
    });

    if (!invErr) {
      return new Response(JSON.stringify({ ok: true, method: "supabase-invite" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Existing user — send via Resend
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f4f4f5;margin:0;padding:40px 20px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
    <h1 style="font-size:22px;font-weight:700;margin:0 0 8px">You're invited to join ${hubName} on FutureLabs LMS</h1>
    <p style="color:#6b7280;margin:0 0 28px;font-size:15px">
      You have been invited as an administrator for <strong>${hubName}</strong>.
      Click the button below to accept and set up your hub.
    </p>
    <a href="${inviteUrl}"
       style="display:inline-block;background:#7c3aed;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">
      Accept Hub Invitation
    </a>
    <p style="margin-top:28px;font-size:13px;color:#9ca3af">This link expires in 7 days. If you didn't expect this email, you can safely ignore it.</p>
  </div>
</body>
</html>`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "FutureLabs <no-reply@futurelabs.ng>",
        to: [email],
        subject: `You're invited to manage ${hubName} on FutureLabs`,
        html,
      }),
    });

    return new Response(JSON.stringify({ ok: true, method: "resend" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
