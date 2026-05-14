import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  email: string;
  name: string;
  classroom: string;
  token: string;
  staffType: string;
}

async function sendEmail(to: string, subject: string, html: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "FutureLabs <notifications@futurelabs.ng>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend [${res.status}]: ${err}`);
  }
  return res.json();
}

function buildHtml(name: string, classroom: string, token: string, staffType: string) {
  const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "http://localhost:5173";
  const inviteLink = `${FRONTEND_URL}/accept-invitation?token=${token}`;
  const role = staffType === "teaching" ? "Teaching Staff" : "Non-Teaching Staff";

  return `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f7f7fb;padding:24px;color:#0f172a;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
      <h1 style="font-size:20px;margin:0 0 16px;color:#1e1b4b;">You've been invited!</h1>
      <p style="font-size:15px;line-height:1.6;margin-bottom:16px;">Hello ${name},</p>
      <p style="font-size:15px;line-height:1.6;margin-bottom:24px;">
        You have been invited to join the <strong>${classroom}</strong> classroom as <strong>${role}</strong>.
      </p>
      <a href="${inviteLink}" style="display:inline-block;background:#3b82f6;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
        Accept Invitation
      </a>
      <p style="font-size:14px;line-height:1.6;margin-top:24px;color:#64748b;">
        Or copy and paste this link into your browser:<br/>
        <a href="${inviteLink}" style="color:#3b82f6;word-break:break-all;">${inviteLink}</a>
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
      <p style="font-size:12px;color:#64748b;margin:0;">FutureLabs Classroom System</p>
    </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    
    // Auth check
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    // Verify admin role
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userRes.user.id)
      .eq("role", "admin")
      .maybeSingle();
      
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Payload;
    if (!body.email || !body.token || !body.classroom) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = `Invitation: Join ${body.classroom} on FutureLabs`;
    const html = buildHtml(body.name || "Staff", body.classroom, body.token, body.staffType);

    await sendEmail(body.email, subject, html);

    // Optional: Log notification in DB
    await admin.from("notifications").insert({
      user_id: null,
      type: "staff_invitation",
      title: subject,
      message: `Invitation sent to ${body.email} for ${body.classroom}`,
      channel: "email",
      sent_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
