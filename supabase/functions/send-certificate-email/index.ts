import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml, firstName } from "../_shared/digestEmail.ts";

// Emails a student their certificate link: { certificate_id }. Called by the CEO or a
// training manager after issuing or approving (or to resend); the caller's permission
// is checked with can_approve_certificate under their JWT.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const { certificate_id } = await req.json().catch(() => ({}));
    if (!certificate_id) return json({ error: "certificate_id is required" }, 400);

    const { data: cert } = await db.from("certificates")
      .select("id, code, enrollment_id, student_name, program_name, revoked_at, hubs(name, contact_email), enrollments(email)")
      .eq("id", certificate_id)
      .maybeSingle<{ id: string; code: string; enrollment_id: string; student_name: string; program_name: string; revoked_at: string | null; hubs: { name: string; contact_email: string | null } | null; enrollments: { email: string } | null }>();
    if (!cert) return json({ error: "Certificate not found" }, 404);
    if (cert.revoked_at) return json({ error: "This certificate has been revoked" }, 400);

    const { data: allowed, error: permError } = await userClient.rpc("can_approve_certificate", { p_enrollment_id: cert.enrollment_id });
    if (permError || !allowed) return json({ error: "Not allowed" }, 403);

    const to = cert.enrollments?.email?.trim();
    if (!to) return json({ error: "This student has no email address" }, 400);

    const hub = cert.hubs?.name || "FutureLabs";
    const url = `${Deno.env.get("FRONTEND_URL") || "https://admin.futurelabs.ng"}/certificate/${cert.code}`;
    const name = firstName(cert.student_name);
    const html = `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f7f7fb;padding:24px;color:#0f172a;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
<h1 style="font-size:20px;margin:0 0 16px;color:#1e1b4b;">Congratulations, ${escapeHtml(name)}!</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Your certificate for <strong>${escapeHtml(cert.program_name)}</strong> from ${escapeHtml(hub)} has been issued.</p>
<p style="margin:0 0 24px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">View your certificate</a></p>
<p style="font-size:14px;line-height:1.6;color:#475569;margin:0;">You can download it as a PDF from that page, and share the link with employers: it shows anyone that the certificate is genuine. Certificate ID: ${escapeHtml(cert.code)}</p>
</div></body></html>`;
    const text = `Congratulations, ${name}!\n\nYour certificate for ${cert.program_name} from ${hub} has been issued.\nView, download or share it: ${url}\n\nCertificate ID: ${cert.code}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("MARKETING_FROM") || "FutureLabs <notifications@futurelabs.ng>",
        to: [to],
        ...(cert.hubs?.contact_email ? { reply_to: cert.hubs.contact_email } : {}),
        subject: `Your ${cert.program_name} certificate is ready`,
        html,
        text,
      }),
    });
    if (!res.ok) return json({ error: `Email failed: ${(await res.text()).slice(0, 200)}` }, 502);

    await db.from("certificates").update({ emailed_at: new Date().toISOString() }).eq("id", cert.id);
    return json({ sent_to: to });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
