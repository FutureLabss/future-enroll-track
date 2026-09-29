import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ImportedContact {
  email: string;
  name: string;
}

interface Payload {
  subject: string;
  message: string;
  audience_type?: "students" | "staff" | "students_and_staff";
  imported_contacts?: ImportedContact[];
  filters?: {
    program_id?: string;
    cohort_id?: string;
    enrollment_status?: string;
    audience?: "all" | "outstanding" | "paid";
    staff_type?: "teaching" | "non_teaching"; // filter by classroom_staff.staff_type
  };
}

interface Recipient {
  email: string;
  name: string;
  outstanding?: number;
  enrollment_id?: string | null;
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

    const admin = createClient(supabaseUrl, serviceKey);

    // Allow CLI/service-role invocation (supabase functions invoke --no-verify-jwt)
    const isServiceRoleCall = auth === `Bearer ${serviceKey}`;

    let actingUserId: string | null = null;

    if (!isServiceRoleCall) {
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
      actingUserId = userRes.user.id;

      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", actingUserId)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "Admin only" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Scope audience-wide sends to the acting admin's hub — the service role
    // bypasses RLS, so without this a bare audience_type fetched every
    // student/staff member on the platform
    let hubId: string | null = null;
    if (actingUserId) {
      const { data: member } = await admin
        .from("hub_members")
        .select("hub_id")
        .eq("user_id", actingUserId)
        .maybeSingle();
      hubId = member?.hub_id ?? null;
    }

    const body = (await req.json()) as Payload;
    if (!body.subject || !body.message) {
      return new Response(JSON.stringify({ error: "subject and message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audienceType = body.audience_type ?? "students";
    const f = body.filters || {};
    const recipients: Recipient[] = [];

    // Students from enrollments
    if (audienceType === "students" || audienceType === "students_and_staff") {
      let q = admin
        .from("enrollments")
        .select("id, full_name, email, total_amount, amount_paid, outstanding_balance")
        .limit(2000);
      if (f.program_id) q = q.eq("program_id", f.program_id);
      if (f.cohort_id) q = q.eq("cohort_id", f.cohort_id);
      if (f.enrollment_status) q = q.eq("enrollment_status", f.enrollment_status);
      if (!f.program_id && !f.cohort_id && hubId) {
        const { data: hubPrograms } = await admin.from("programs").select("id").eq("hub_id", hubId);
        q = q.in("program_id", (hubPrograms || []).map((p: any) => p.id));
      }

      const { data: enrollments, error: enrollErr } = await q;
      if (enrollErr) throw enrollErr;

      let list = (enrollments || []).filter((e: any) => e.email);
      if (f.audience === "outstanding") {
        list = list.filter((e: any) => Number(e.outstanding_balance ?? (e.total_amount - e.amount_paid)) > 0);
      } else if (f.audience === "paid") {
        list = list.filter((e: any) => Number(e.outstanding_balance ?? (e.total_amount - e.amount_paid)) <= 0);
      }

      for (const e of list) {
        recipients.push({
          email: e.email.toLowerCase(),
          name: e.full_name || "",
          outstanding: Number(e.outstanding_balance ?? (e.total_amount - e.amount_paid)),
          enrollment_id: e.id,
        });
      }
    }

    // Staff — optionally filtered by classroom_staff.staff_type
    if (audienceType === "staff" || audienceType === "students_and_staff") {
      let staffRows: any[] = [];

      if (f.staff_type) {
        // Join through classroom_staff to filter by teaching/non_teaching
        const { data, error: staffErr } = await admin
          .from("classroom_staff")
          .select("staff:staff_id(id, full_name, email, active)")
          .eq("staff_type", f.staff_type)
          .eq("status", "active");
        if (staffErr) throw staffErr;
        // Dedupe: a tutor may appear in multiple classrooms
        const seen = new Map<string, any>();
        for (const row of data || []) {
          const s = (row as any).staff;
          if (s && s.active && s.email && !seen.has(s.email)) seen.set(s.email, s);
        }
        staffRows = Array.from(seen.values());
      } else {
        let staffQ = admin
          .from("staff")
          .select("id, full_name, email")
          .eq("active", true);
        if (hubId) staffQ = staffQ.eq("hub_id", hubId);
        const { data, error: staffErr } = await staffQ;
        if (staffErr) throw staffErr;
        staffRows = data || [];
      }

      for (const s of staffRows) {
        if (s.email) {
          recipients.push({ email: s.email.toLowerCase(), name: s.full_name || "" });
        }
      }
    }

    // Imported contacts (also used for cc / oversight recipients)
    for (const c of body.imported_contacts || []) {
      if (c.email) {
        recipients.push({ email: c.email.toLowerCase(), name: c.name || "" });
      }
    }

    // Dedupe by email (first occurrence wins)
    const seen = new Map<string, Recipient>();
    for (const r of recipients) {
      if (!seen.has(r.email)) seen.set(r.email, r);
    }
    const deduped = Array.from(seen.values());

    // Send in bounded concurrent batches; record the audit rows in one insert
    const CONCURRENCY = 10;
    let sent = 0, failed = 0;
    const errors: string[] = [];
    const notifRows: Record<string, unknown>[] = [];

    for (let i = 0; i < deduped.length; i += CONCURRENCY) {
      const batch = deduped.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(async (r) => {
        const personalized = body.message
          .replace(/\{\{\s*name\s*\}\}/gi, r.name || "")
          .replace(/\{\{\s*outstanding\s*\}\}/gi, r.outstanding != null
            ? `₦${Number(r.outstanding).toLocaleString("en-NG")}`
            : "");
        try {
          await sendEmail(r.email, body.subject, buildHtml(body.subject, personalized));
          return { ok: true as const, r, personalized };
        } catch (e) {
          return { ok: false as const, r, err: (e as Error).message };
        }
      }));
      for (const res of results) {
        if (res.ok) {
          sent++;
          notifRows.push({
            user_id: null,
            enrollment_id: res.r.enrollment_id ?? null,
            type: "bulk_announcement",
            title: body.subject,
            message: res.personalized.slice(0, 500),
            channel: "email",
            sent_at: new Date().toISOString(),
          });
        } else {
          failed++;
          errors.push(`${res.r.email}: ${res.err}`);
        }
      }
    }

    if (notifRows.length > 0) {
      await admin.from("notifications").insert(notifRows);
    }

    await admin.from("audit_logs").insert({
      user_id: actingUserId,
      action: "bulk_email",
      entity_type: "notification",
      entity_id: null,
      details: {
        subject: body.subject,
        sent,
        failed,
        total: deduped.length,
        audience_type: audienceType,
        imported: (body.imported_contacts || []).length,
        filters: f,
      },
    });

    return new Response(JSON.stringify({ sent, failed, total: deduped.length, errors: errors.slice(0, 10) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
