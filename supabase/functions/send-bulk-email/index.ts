import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  subject: string;
  message: string; // plain text or simple html
  filters?: {
    program_id?: string;
    cohort_id?: string;
    enrollment_status?: string;
    audience?: "all" | "outstanding" | "paid";
  };
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

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildHtml(subject: string, message: string) {
  // Allow simple {{name}} substitution; keep paragraphs.
  const safe = escapeHtml(message).replace(/\\n/g, "<br/>");
  return `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f7f7fb;padding:24px;color:#0f172a;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
      <h1 style="font-size:18px;margin:0 0 16px;color:#1e1b4b;">${escapeHtml(subject)}</h1>
      <div style="font-size:15px;line-height:1.6;">${safe}</div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
      <p style="font-size:12px;color:#64748b;margin:0;">FutureLabs Invoicing & Enrollment</p>
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
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Payload;
    if (!body.subject || !body.message) {
      return new Response(JSON.stringify({ error: "subject and message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let q = admin.from("enrollments").select("id, full_name, email, total_amount, amount_paid, outstanding_balance, program_id, cohort_id, enrollment_status");
    const f = body.filters || {};
    if (f.program_id) q = q.eq("program_id", f.program_id);
    if (f.cohort_id) q = q.eq("cohort_id", f.cohort_id);
    if (f.enrollment_status) q = q.eq("enrollment_status", f.enrollment_status);

    const { data: enrollments, error } = await q;
    if (error) throw error;

    let recipients = (enrollments || []).filter((e: any) => e.email);
    if (f.audience === "outstanding") {
      recipients = recipients.filter((e: any) => Number(e.outstanding_balance ?? (e.total_amount - e.amount_paid)) > 0);
    } else if (f.audience === "paid") {
      recipients = recipients.filter((e: any) => Number(e.outstanding_balance ?? (e.total_amount - e.amount_paid)) <= 0);
    }

    // Dedupe by email
    const seen = new Set<string>();
    recipients = recipients.filter((e: any) => {
      const k = e.email.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    let sent = 0, failed = 0;
    const errors: string[] = [];
    for (const r of recipients) {
      try {
        const personalized = body.message
          .replace(/\{\{\s*name\s*\}\}/gi, r.full_name || "")
          .replace(/\{\{\s*outstanding\s*\}\}/gi, `₦${Number(r.outstanding_balance ?? (r.total_amount - r.amount_paid)).toLocaleString("en-NG")}`);
        await sendEmail(r.email, body.subject, buildHtml(body.subject, personalized));
        sent++;
        await admin.from("notifications").insert({
          user_id: null,
          enrollment_id: r.id,
          type: "bulk_announcement",
          title: body.subject,
          message: personalized.slice(0, 500),
          channel: "email",
          sent_at: new Date().toISOString(),
        });
      } catch (e) {
        failed++;
        errors.push(`${r.email}: ${(e as Error).message}`);
      }
    }

    await admin.from("audit_logs").insert({
      user_id: userRes.user.id,
      action: "bulk_email",
      entity_type: "notification",
      entity_id: null,
      details: { subject: body.subject, sent, failed, total: recipients.length, filters: f },
    });

    return new Response(JSON.stringify({ sent, failed, total: recipients.length, errors: errors.slice(0, 10) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
