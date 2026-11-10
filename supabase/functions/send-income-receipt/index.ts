import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml, firstName } from "../_shared/digestEmail.ts";

// Emails the payer of an other-income row: { other_income_id, receipt?, booking? }.
// Both emails are blind-copied to the hub's `receipt_copy_to` staff and to whoever sent them.
// `copy_only_to` (staff addresses) sends a copy to those staff only, without emailing the
// payer again or marking anything as sent; it accepts only the hub's admins, owners and
// managers, its receipt_copy_to list, and the superadmin.
// `receipt` sends a numbered payment receipt; `booking` sends the hall booking
// confirmation (date, time, facilities, inclusions, conditions). The caller must be
// able to see the row under their own JWT, i.e. an admin of its hub.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const METHODS: Record<string, string> = { bank_transfer: "Bank transfer", card: "Card", cash: "Cash", other: "Other" };
const method = (m: string) => METHODS[m] ?? m;
const naira = (n: number) => `₦${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
const longDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const clock = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

// Staff write lists as "- item" or "1. item" lines; anything else is a paragraph.
function textToHtml(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const ordered = lines.every((l) => /^\d+[.)]\s/.test(l));
  const bulleted = lines.every((l) => /^[-*•]\s/.test(l));
  if (ordered || bulleted) {
    const tag = ordered ? "ol" : "ul";
    const items = lines.map((l) => `<li style="margin:0 0 6px;">${escapeHtml(l.replace(/^(\d+[.)]|[-*•])\s+/, ""))}</li>`).join("");
    return `<${tag} style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.6;">${items}</${tag}>`;
  }
  return lines.map((l) => `<p style="font-size:14px;line-height:1.6;margin:0 0 10px;">${escapeHtml(l)}</p>`).join("");
}

const shell = (body: string) => `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f7f7fb;padding:24px;color:#0f172a;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 16px rgba(15,23,42,0.06);">${body}</div></body></html>`;

const row = (label: string, value: string) =>
  `<tr><td style="padding:8px 0;color:#64748b;font-size:14px;width:40%;">${escapeHtml(label)}</td><td style="padding:8px 0;font-size:14px;font-weight:600;">${escapeHtml(value)}</td></tr>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const { other_income_id, receipt = true, booking = true, copy_only_to } = await req.json().catch(() => ({}));
    if (!other_income_id) return json({ error: "other_income_id is required" }, 400);

    const { data: visible } = await userClient.from("other_income").select("id").eq("id", other_income_id).maybeSingle();
    if (!visible) return json({ error: "Not allowed" }, 403);

    const { data: income } = await db.from("other_income")
      .select("id, hub_id, category, payer_name, payer_email, amount, payment_date, payment_method, payment_reference, notes, receipt_number, hubs(name, contact_email)")
      .eq("id", other_income_id).single();
    const to = income?.payer_email?.trim();
    if (!to) return json({ error: "Add the payer's email first" }, 400);

    const { data: bookingRow } = await db.from("venue_bookings").select("*").eq("other_income_id", other_income_id).maybeSingle();
    const { data: defaults } = await db.from("venue_booking_defaults").select("address, contact, receipt_copy_to").eq("hub_id", income.hub_id).maybeSingle();
    const { data: { user: sender } } = await userClient.auth.getUser();
    const copyTo = [...new Set([...((defaults?.receipt_copy_to ?? []) as string[]), sender?.email ?? ""]
      .map((e) => e.trim().toLowerCase()).filter((e) => e && e !== to.toLowerCase()))];
    let copyOnly: string[] | null = null;
    if (Array.isArray(copy_only_to) && copy_only_to.length) {
      const { data: staffIds } = await db.from("hub_members").select("user_id").eq("hub_id", income.hub_id).in("hub_role", ["owner", "admin", "manager"]);
      const { data: staff } = await db.from("profiles").select("email").in("user_id", (staffIds ?? []).map((m) => m.user_id));
      const allowed = new Set([...(staff ?? []).map((p) => p.email), ...((defaults?.receipt_copy_to ?? []) as string[]), "manassehudim@gmail.com"]
        .filter(Boolean).map((e) => String(e).trim().toLowerCase()));
      copyOnly = copy_only_to.map((e: string) => String(e).trim().toLowerCase());
      const outsider = copyOnly.find((e) => !allowed.has(e));
      if (outsider) return json({ error: `${outsider} is not staff of this hub` }, 403);
    }
    const hub = (income.hubs as { name: string; contact_email: string | null } | null);
    const org = hub?.name || "FutureLabs";
    const replyTo = hub?.contact_email || Deno.env.get("PAYMENTS_REPLY_TO") || "hello@futurelabs.africa";
    const name = firstName(income.payer_name);
    const footer = `<p style="font-size:13px;color:#64748b;margin:20px 0 0;line-height:1.6;">${escapeHtml(org)}${defaults?.address ? ` · ${escapeHtml(defaults.address)}` : ""}${defaults?.contact ? ` · ${escapeHtml(defaults.contact)}` : ""}<br/>Questions? Reply to this email.</p>`;

    const send = async (subject: string, html: string, text: string, bcc: string[] = []) => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: Deno.env.get("MARKETING_FROM") || "FutureLabs <notifications@futurelabs.ng>",
          ...(copyOnly ? { to: copyOnly, subject: `Copy: ${subject}` } : { to: [to], ...(bcc.length ? { bcc } : {}), subject }),
          reply_to: replyTo, html, text,
        }),
      });
      if (!res.ok) throw new Error(`Email failed: ${(await res.text()).slice(0, 200)}`);
    };

    const sent: string[] = [];
    const what = bookingRow ? `${bookingRow.venue_name} rental` : `${income.category} payment`;
    const when = bookingRow
      ? `${longDate(bookingRow.usage_date)}${bookingRow.end_date && bookingRow.end_date !== bookingRow.usage_date ? ` to ${longDate(bookingRow.end_date)}` : ""}, ${clock(bookingRow.start_time)} to ${clock(bookingRow.end_time)}`
      : null;

    if (receipt) {
      const { data: number, error } = await db.rpc("assign_income_receipt_number", { p_income_id: other_income_id });
      if (error) throw error;
      const html = shell(`
<p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin:0 0 4px;">Payment receipt</p>
<h1 style="font-size:22px;margin:0 0 4px;">${escapeHtml(number)}</h1>
<p style="font-size:15px;line-height:1.6;margin:12px 0 16px;">Hi ${escapeHtml(name)}, thank you. We have received your payment.</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin:0 0 16px;">
${row("Received from", income.payer_name)}
${row("For", what)}
${when ? row("Booking", when) : ""}
${row("Amount paid", naira(income.amount))}
${row("Date paid", longDate(income.payment_date))}
${income.payment_method ? row("Method", method(income.payment_method)) : ""}
${income.payment_reference ? row("Reference", income.payment_reference) : ""}
${row("Receipt number", number)}
</table>
<p style="font-size:14px;line-height:1.6;margin:0;">Keep this email as your proof of payment.${bookingRow ? " Your booking details and the hall conditions are in a separate email." : ""}</p>
${footer}`);
      const text = `Payment receipt ${number}\n\nHi ${name}, thank you. We have received your payment.\n\nReceived from: ${income.payer_name}\nFor: ${what}\n${when ? `Booking: ${when}\n` : ""}Amount paid: ${naira(income.amount)}\nDate paid: ${longDate(income.payment_date)}\n${income.payment_method ? `Method: ${method(income.payment_method)}\n` : ""}${income.payment_reference ? `Reference: ${income.payment_reference}\n` : ""}\n${org}`;
      await send(`Receipt ${number}: ${what}`, html, text, copyTo);
      if (!copyOnly) await db.from("other_income").update({ receipt_sent_at: new Date().toISOString() }).eq("id", other_income_id);
      sent.push("receipt");
    }

    if (booking && bookingRow) {
      const html = shell(`
<p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin:0 0 4px;">Booking confirmed</p>
<h1 style="font-size:22px;margin:0 0 12px;">${escapeHtml(bookingRow.venue_name)}</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${escapeHtml(name)}, your booking is confirmed. Here is everything you need for the day.</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin:0 0 20px;">
${row("Date", bookingRow.end_date && bookingRow.end_date !== bookingRow.usage_date ? `${longDate(bookingRow.usage_date)} to ${longDate(bookingRow.end_date)}` : longDate(bookingRow.usage_date))}
${row("Time", `${clock(bookingRow.start_time)} to ${clock(bookingRow.end_time)}`)}
${defaults?.address ? row("Venue", `${bookingRow.venue_name}, ${defaults.address}`) : row("Venue", bookingRow.venue_name)}
${bookingRow.purpose ? row("Event", bookingRow.purpose) : ""}
${bookingRow.guests ? row("Guests", String(bookingRow.guests)) : ""}
${row("Amount paid", naira(income.amount))}
</table>
<h2 style="font-size:16px;margin:0 0 8px;">Facilities you can use</h2>
${textToHtml(bookingRow.facilities)}
<h2 style="font-size:16px;margin:0 0 8px;">What your booking includes</h2>
${textToHtml(bookingRow.inclusions)}
<h2 style="font-size:16px;margin:0 0 8px;">Conditions of use</h2>
${textToHtml(bookingRow.conditions)}
<p style="font-size:14px;line-height:1.6;margin:0;">By using the hall you agree to these conditions. If anything needs to change, reply to this email as early as you can.</p>
${footer}`);
      const text = `Booking confirmed: ${bookingRow.venue_name}\n\nHi ${name}, your booking is confirmed.\n\nDate and time: ${when}\n${defaults?.address ? `Venue: ${bookingRow.venue_name}, ${defaults.address}\n` : ""}${bookingRow.purpose ? `Event: ${bookingRow.purpose}\n` : ""}${bookingRow.guests ? `Guests: ${bookingRow.guests}\n` : ""}Amount paid: ${naira(income.amount)}\n\nFacilities you can use:\n${bookingRow.facilities}\n\nWhat your booking includes:\n${bookingRow.inclusions}\n\nConditions of use:\n${bookingRow.conditions}\n\nBy using the hall you agree to these conditions.\n\n${org}`;
      await send(`Your booking of ${bookingRow.venue_name} on ${longDate(bookingRow.usage_date)}`, html, text, copyTo);
      if (!copyOnly) await db.from("venue_bookings").update({ details_sent_at: new Date().toISOString() }).eq("id", bookingRow.id);
      sent.push("booking");
    }

    return json({ sent_to: copyOnly ? copyOnly.join(", ") : to, sent });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
