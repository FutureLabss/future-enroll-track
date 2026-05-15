import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  email: string;
  name: string;
  // Classroom invitation fields (optional for payroll-only onboarding)
  classroom?: string;
  token?: string;
  staffType?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://admin.futurelabs.ng";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });

    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userRes.user.id)
      .eq("role", "admin")
      .maybeSingle();

    // Also allow superadmins
    const { data: saRow } = !roleRow
      ? await admin.from("superadmins").select("user_id").eq("user_id", userRes.user.id).maybeSingle()
      : { data: null };

    if (!roleRow && !saRow) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Payload;
    if (!body.email || !body.name) {
      return new Response(JSON.stringify({ error: "email and name are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isClassroomInvite = !!(body.token && body.classroom);

    // Redirect target depends on invite type
    const redirectTo = isClassroomInvite
      ? `${FRONTEND_URL}/accept-invitation?token=${body.token}`
      : `${FRONTEND_URL}/staff/classrooms`;

    // Primary path: Supabase invite flow.
    // New users → account created, Supabase-managed email sent.
    // Existing users → falls back to Resend.
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(body.email, {
      redirectTo,
      data: { full_name: body.name },
    });

    if (inviteError) {
      // User already has an account — send a plain email via Resend.
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

      let subject: string;
      let html: string;

      if (isClassroomInvite) {
        const role = body.staffType === "teaching" ? "Teaching Staff" : "Non-Teaching Staff";
        subject = `You've been invited to ${body.classroom}`;
        html = `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f7f7fb;padding:24px;color:#0f172a;">
          <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
            <h1 style="font-size:20px;margin:0 0 16px;color:#1e1b4b;">Classroom Invitation</h1>
            <p style="font-size:15px;line-height:1.6;margin-bottom:16px;">Hello ${body.name},</p>
            <p style="font-size:15px;line-height:1.6;margin-bottom:24px;">
              You have been added to <strong>${body.classroom}</strong> as <strong>${role}</strong>.
            </p>
            <a href="${redirectTo}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
              Accept Invitation
            </a>
            <p style="font-size:13px;color:#64748b;margin-top:24px;word-break:break-all;">${redirectTo}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
            <p style="font-size:12px;color:#94a3b8;margin:0;">FutureLabs · This link expires in 7 days.</p>
          </div></body></html>`;
      } else {
        subject = "You've been added as staff — access your account";
        html = `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f7f7fb;padding:24px;color:#0f172a;">
          <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
            <h1 style="font-size:20px;margin:0 0 16px;color:#1e1b4b;">Welcome to the Team</h1>
            <p style="font-size:15px;line-height:1.6;margin-bottom:16px;">Hello ${body.name},</p>
            <p style="font-size:15px;line-height:1.6;margin-bottom:24px;">
              You have been added as a staff member. Click the button below to access your staff portal.
            </p>
            <a href="${redirectTo}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
              Go to Staff Portal
            </a>
            <p style="font-size:13px;color:#64748b;margin-top:24px;word-break:break-all;">${redirectTo}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
            <p style="font-size:12px;color:#94a3b8;margin:0;">FutureLabs · If you were not expecting this email, you can ignore it.</p>
          </div></body></html>`;
      }

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "FutureLabs <noreply@futurelabs.ng>",
          to: [body.email],
          subject,
          html,
        }),
      });
      if (!resendRes.ok) throw new Error(`Resend error: ${await resendRes.text()}`);
    }

    const notifMessage = isClassroomInvite
      ? `${body.name} invited to ${body.classroom} as ${body.staffType}`
      : `${body.name} invited as staff (payroll onboarding)`;

    await admin.from("notifications").insert({
      user_id: null,
      type: "staff_invitation",
      title: `Invitation sent to ${body.email}`,
      message: notifMessage,
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
