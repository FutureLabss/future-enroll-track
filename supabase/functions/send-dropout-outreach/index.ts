import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml, firstName } from "../_shared/digestEmail.ts";
import { sendWhatsApp, whatsappConfigured } from "../_shared/whatsapp.ts";

// Daily (cron, x-cron-secret): asks students who stopped coming to choose between
// rejoining the next cohort and withdrawing. One message when detect_dropouts opens
// the case, one reminder a week later; after that it's the tutor's call.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Outreach {
  case_id: string;
  token: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  program_name: string;
  cohort_label: string;
  next_cohort_label: string | null;
  next_cohort_start: string | null;
  hub_name: string | null;
  reply_to: string | null;
  message_no: number;
}

const FRONTEND = Deno.env.get("FRONTEND_URL") || "https://admin.futurelabs.ng";

function compose(o: Outreach) {
  const hub = o.hub_name || "FutureLabs";
  const name = firstName(o.full_name);
  const link = `${FRONTEND}/reconnect/${o.token}`;
  const next = o.next_cohort_label
    ? `the next ${o.program_name} cohort${o.next_cohort_start ? `, starting ${new Date(`${o.next_cohort_start}T00:00:00`).toLocaleDateString("en-NG", { day: "numeric", month: "long" })}` : ""}`
    : `the next ${o.program_name} cohort`;
  const subject = o.message_no > 1 ? `${name}, we still have a place for you` : `We've missed you in ${o.program_name}, ${name}`;
  const lead = o.message_no > 1
    ? `We wrote last week because you haven't been in ${o.program_name} class for a while, and we haven't heard back.`
    : `We noticed you haven't been in ${o.program_name} class for about three weeks. Life gets busy, and that's okay.`;
  const html = `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f7f7fb;padding:24px;color:#0f172a;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">${escapeHtml(lead)}</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Please let us know what you'd like to do. You can <strong>rejoin ${escapeHtml(next)}</strong> and pick up where you left off, or <strong>withdraw</strong> from the programme.</p>
<p style="margin:0 0 24px;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#F57F20;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Choose what happens next</a></p>
<p style="font-size:14px;line-height:1.6;color:#475569;margin:0;">It takes a minute. If something is in the way, whether that's time, money or the material itself, tell us on that page or reply to this email.</p>
<p style="font-size:14px;line-height:1.6;color:#475569;margin:16px 0 0;">The ${escapeHtml(hub)} team</p>
</div></body></html>`;
  const text = `Hi ${name},\n\n${lead}\n\nPlease let us know what you'd like to do: rejoin ${next}, or withdraw from the programme.\n\nChoose here: ${link}\n\nIf something is in the way, tell us on that page or reply to this email.\n\nThe ${hub} team`;
  const whatsapp = `Hi ${name}, it's ${hub}. ${lead}\n\nWould you like to rejoin ${next}, or withdraw? Choose here: ${link}`;
  return { subject, html, text, whatsapp };
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) return json({ error: "Not allowed" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await db.rpc("claim_dropout_outreach");
  if (error) return json({ error: error.message }, 500);

  let emailed = 0, whatsapped = 0, failed = 0;
  for (const o of (data || []) as Outreach[]) {
    const msg = compose(o);
    if (o.email) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: Deno.env.get("MARKETING_FROM") || "FutureLabs <notifications@futurelabs.ng>",
            to: [o.email],
            reply_to: o.reply_to || Deno.env.get("PAYMENTS_REPLY_TO") || "hello@futurelabs.africa",
            subject: msg.subject, html: msg.html, text: msg.text,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        emailed++;
      } catch {
        failed++;
      }
    }
    if (o.phone && whatsappConfigured()) {
      try { await sendWhatsApp(o.phone, msg.whatsapp); whatsapped++; } catch { failed++; }
    }
  }
  return json({ cases: (data || []).length, emailed, whatsapped, failed });
});
