import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "FutureLabs <notifications@futurelabs.ng>", to: [to], subject, html }),
  });
  if (!res.ok) throw new Error(`Resend [${res.status}]: ${await res.text()}`);
}

function signupEmail(name: string, signupUrl: string) {
  return `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f7f7fb;padding:24px;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
    <h1 style="font-size:20px;margin:0 0 16px;color:#1e1b4b;">Complete Your Account Setup</h1>
    <p style="font-size:15px;line-height:1.6;margin-bottom:16px;">Hi ${name || "there"},</p>
    <p style="font-size:15px;line-height:1.6;margin-bottom:24px;">
      You're enrolled at FutureLabs but haven't created your student account yet.
      Click the button below to set up your login and access your classroom.
    </p>
    <a href="${signupUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
      Create My Account
    </a>
    <p style="font-size:13px;color:#64748b;margin-top:24px;word-break:break-all;">${signupUrl}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
    <p style="font-size:12px;color:#94a3b8;margin:0;">FutureLabs · If you've already signed up, you can ignore this email.</p>
  </div></body></html>`;
}

function profileEmail(name: string, loginUrl: string) {
  return `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f7f7fb;padding:24px;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
    <h1 style="font-size:20px;margin:0 0 16px;color:#1e1b4b;">Complete Your Profile</h1>
    <p style="font-size:15px;line-height:1.6;margin-bottom:16px;">Hi ${name || "there"},</p>
    <p style="font-size:15px;line-height:1.6;margin-bottom:24px;">
      Your FutureLabs account is active but your profile is incomplete. Please log in and
      update your name so your tutors and classmates can identify you.
    </p>
    <a href="${loginUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
      Complete My Profile
    </a>
    <p style="font-size:13px;color:#64748b;margin-top:24px;word-break:break-all;">${loginUrl}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
    <p style="font-size:12px;color:#94a3b8;margin:0;">FutureLabs · Settings → Profile to update your details.</p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://admin.futurelabs.ng";

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin.from("user_roles").select("role")
      .eq("user_id", userRes.user.id).eq("role", "admin").maybeSingle();
    const { data: saRow } = !roleRow
      ? await admin.from("superadmins").select("user_id").eq("user_id", userRes.user.id).maybeSingle()
      : { data: null };
    if (!roleRow && !saRow) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { program_id } = await req.json();
    if (!program_id) {
      return new Response(JSON.stringify({ error: "program_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all active/pending enrollments for this program
    const { data: enrollments, error: enrollErr } = await admin
      .from("enrollments")
      .select("id, full_name, email, user_id")
      .eq("program_id", program_id)
      .in("enrollment_status", ["active", "pending"])
      .not("email", "is", null);
    if (enrollErr) throw enrollErr;

    // Split into: no account vs account but incomplete profile
    const noAccount = (enrollments || []).filter((e: any) => !e.user_id);
    const hasAccount = (enrollments || []).filter((e: any) => e.user_id);

    // Check profiles for those with accounts — flag empty full_name
    let incompleteProfile: any[] = [];
    if (hasAccount.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", hasAccount.map((e: any) => e.user_id));
      const emptyNames = new Set(
        (profiles || []).filter((p: any) => !p.full_name || p.full_name.trim() === "").map((p: any) => p.user_id)
      );
      incompleteProfile = hasAccount.filter((e: any) => emptyNames.has(e.user_id));
    }

    let signupSent = 0, profileSent = 0, failed = 0;
    const errors: string[] = [];

    for (const e of noAccount) {
      try {
        const url = `${FRONTEND_URL}/students/${e.id}`;
        await sendEmail(e.email, "Complete your FutureLabs account setup", signupEmail(e.full_name, url));
        signupSent++;
        await admin.from("notifications").insert({
          user_id: null, enrollment_id: e.id, type: "account_reminder",
          title: "Account setup reminder sent", message: `Signup link sent to ${e.email}`,
          channel: "email", sent_at: new Date().toISOString(),
        });
      } catch (err) {
        failed++;
        errors.push(`${e.email}: ${(err as Error).message}`);
      }
    }

    for (const e of incompleteProfile) {
      try {
        const url = `${FRONTEND_URL}/profile`;
        await sendEmail(e.email, "Please complete your FutureLabs profile", profileEmail(e.full_name, url));
        profileSent++;
        await admin.from("notifications").insert({
          user_id: e.user_id, enrollment_id: e.id, type: "profile_reminder",
          title: "Profile completion reminder sent", message: `Profile reminder sent to ${e.email}`,
          channel: "email", sent_at: new Date().toISOString(),
        });
      } catch (err) {
        failed++;
        errors.push(`${e.email}: ${(err as Error).message}`);
      }
    }

    await admin.from("audit_logs").insert({
      user_id: userRes.user.id, action: "account_reminders", entity_type: "notification", entity_id: null,
      details: { program_id, signup_sent: signupSent, profile_sent: profileSent, failed },
    });

    return new Response(JSON.stringify({ signup_sent: signupSent, profile_sent: profileSent, failed, errors: errors.slice(0, 10) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
