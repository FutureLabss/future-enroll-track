import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_HUB_ID = "00000000-0000-0000-0000-000000000002"; // RhemaHub — isolated demo data

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://admin.futurelabs.ng";

    const { email } = await req.json();
    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Valid email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const admin = createClient(supabaseUrl, serviceKey);

    // Once per email: reject if any demo invitation already exists for this address
    const { data: existing } = await admin
      .from("hub_invitations")
      .select("id")
      .eq("hub_id", DEMO_HUB_ID)
      .eq("email", normalizedEmail)
      .eq("is_demo", true)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ ok: false, alreadyInvited: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Generate invitation token — expires in 24 h (magic link itself expires after 1 h via Supabase)
    const tokenBytes = new Uint8Array(24);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: invErr } = await admin.from("hub_invitations").insert({
      hub_id: DEMO_HUB_ID,
      email: normalizedEmail,
      token,
      hub_role: "admin",
      expires_at: expiresAt,
      is_demo: true,
    });
    if (invErr) throw invErr;

    // Generate Supabase magic link
    const redirectTo = `${FRONTEND_URL}/accept-hub-invitation?token=${token}`;
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
      options: { redirectTo },
    });
    if (linkErr) throw linkErr;

    const magicLink = linkData.properties?.action_link;
    if (!magicLink) throw new Error("Failed to generate magic link");

    // Send styled email via Resend
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f4f4f5;margin:0;padding:40px 20px">
  <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:20px;padding:48px 40px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="width:48px;height:48px;background:#7c3aed;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:24px">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <h1 style="font-size:24px;font-weight:700;color:#09090b;margin:0 0 8px">Your FutureLabs demo is ready</h1>
    <p style="color:#71717a;font-size:15px;line-height:1.6;margin:0 0 28px">
      You requested a live demo of <strong style="color:#09090b">FutureLabs LMS</strong>.
      Click the button below to log in as an admin and explore the full platform —
      programs, cohorts, curriculum, finance, enrollment, and more.
    </p>
    <a href="${magicLink}"
       style="display:inline-block;background:#7c3aed;color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:-.01em">
      Open My Demo Dashboard →
    </a>
    <div style="margin-top:32px;padding:20px;background:#fafafa;border-radius:12px;border:1px solid #e4e4e7">
      <p style="font-size:13px;font-weight:600;color:#3f3f46;margin:0 0 8px">What's inside your demo</p>
      <ul style="font-size:13px;color:#71717a;margin:0;padding-left:16px;line-height:1.8">
        <li>Programs, cohorts &amp; live curriculum</li>
        <li>Finance: invoices, payments, expenses &amp; payroll</li>
        <li>Student roster &amp; enrollment management</li>
        <li>Staff management &amp; attendance tracking</li>
      </ul>
    </div>
    <div style="margin-top:20px;padding:16px 20px;background:#fef3c7;border-radius:12px;border:1px solid #fde68a">
      <p style="font-size:13px;color:#92400e;margin:0">
        <strong>Demo access is valid for 1 hour</strong> after you click the link.
        This is a one-time invitation — please use it now.
      </p>
    </div>
    <p style="margin-top:28px;font-size:12px;color:#a1a1aa;line-height:1.6">
      If you didn't request a demo, you can safely ignore this email.<br>
      Questions? Reply here or reach us at <a href="mailto:manny@futurelabs.com.ng" style="color:#7c3aed">manny@futurelabs.com.ng</a>
    </p>
  </div>
</body>
</html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "FutureLabs <no-reply@futurelabs.ng>",
        to: [normalizedEmail],
        subject: "Your FutureLabs demo is ready — 1-hour admin access",
        html,
      }),
    });

    if (!resendRes.ok) {
      const resendBody = await resendRes.text();
      throw new Error(`Resend error: ${resendBody}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-demo-invite error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
