import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "FutureLabs <notifications@futurelabs.ng>", to: [to], subject, html }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

async function sendWhatsApp(to: string, body: string) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_WHATSAPP_NUMBER");
  if (!sid || !token || !from) throw new Error("Twilio credentials not configured");
  const toWA = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const params = new URLSearchParams({ From: from, To: toWA, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Twilio error ${res.status}: ${await res.text()}`);
}

function buildEmail(item: any, daysOut: number | 'overdue'): { subject: string; html: string } {
  const amt = `₦${Number(item.amount).toLocaleString("en-NG")}`;
  const due = new Date(item.next_due_date).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });
  const isOverdue = daysOut === 'overdue';
  const urgency = isOverdue ? "⛔ OVERDUE" : daysOut === 1 ? "⚠️ Tomorrow" : `in ${daysOut} days`;
  const accentColor = isOverdue ? "#ef4444" : "#f59e0b";
  const subject = isOverdue
    ? `Overdue Payment: ${amt} was due ${due} — ${item.payer_name}`
    : `Payment Reminder: ${amt} due ${urgency} — ${item.payer_name}`;
  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:24px;">FutureLabs</h1>
      </div>
      <div style="padding:32px;">
        <h2 style="color:#1a1a2e;margin-top:0;">${isOverdue ? 'Overdue Payment Notice' : 'Payment Reminder'}</h2>
        <p>Hi ${item.payer_name},</p>
        <p>${isOverdue
          ? 'Your recurring payment below is <strong>overdue</strong>. Please settle it as soon as possible.'
          : `This is a reminder that your recurring payment is due <strong>${urgency}</strong>.`
        }</p>
        <div style="background:${isOverdue ? '#fef2f2' : '#fffbeb'};border-radius:8px;padding:20px;margin:16px 0;border-left:4px solid ${accentColor};">
          <p style="margin:4px 0;"><strong>Amount:</strong> ${amt}</p>
          <p style="margin:4px 0;"><strong>Due Date:</strong> ${due}</p>
          <p style="margin:4px 0;"><strong>Category:</strong> <span style="text-transform:capitalize;">${item.category}</span></p>
          <p style="margin:4px 0;"><strong>Frequency:</strong> <span style="text-transform:capitalize;">${item.frequency}</span></p>
        </div>
        <p>${isOverdue ? 'Please contact us immediately if you have any questions.' : 'Please ensure payment is made on time. Contact us if you have any questions.'}</p>
      </div>
      <div style="background:#f9fafb;padding:20px;text-align:center;font-size:12px;color:#6b7280;">
        <p>FutureLabs Payment Tracking System</p>
      </div>
    </div>`;
  return { subject, html };
}

function buildWhatsAppText(item: any, daysOut: number | 'overdue'): string {
  const amt = `₦${Number(item.amount).toLocaleString("en-NG")}`;
  const due = new Date(item.next_due_date).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });
  const isOverdue = daysOut === 'overdue';
  const urgency = isOverdue ? "OVERDUE" : daysOut === 1 ? "tomorrow" : `in ${daysOut} days`;
  const icon = isOverdue ? "⛔" : "⏰";
  return `${icon} *${isOverdue ? 'Overdue Payment' : 'Payment Reminder'} — FutureLabs*\n\nHi ${item.payer_name},\n\nYour recurring payment of *${amt}* ${isOverdue ? `was due on ${due} and is now *overdue*` : `is due *${urgency}* (${due})`}.\n\nCategory: ${item.category}\nFrequency: ${item.frequency}\n\n${isOverdue ? 'Please settle this as soon as possible.' : 'Please ensure timely payment.'}`;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const in1Day = addDays(today, 1).toISOString().slice(0, 10);
    const in3Days = addDays(today, 3).toISOString().slice(0, 10);

    // Fetch upcoming (1d, 3d) and overdue items in one query
    const { data: items, error } = await supabase
      .from("recurring_income")
      .select("*")
      .eq("active", true)
      .or(`next_due_date.in.(${in1Day},${in3Days}),next_due_date.lt.${todayStr}`);

    if (error) throw error;

    let sent = 0;
    const log: string[] = [];

    for (const item of items || []) {
      // A payment recorded on/after the current due date means this cycle is
      // settled, even if next_due_date was never advanced (e.g. the admin
      // recorded the payment by editing the template instead of posting it).
      if (item.last_posted_date && item.last_posted_date >= item.next_due_date) {
        log.push(`${item.id}: paid (last_posted ${item.last_posted_date} >= due ${item.next_due_date})`);
        continue;
      }

      const isOverdue = item.next_due_date < todayStr;
      const daysOut: number | 'overdue' = isOverdue ? 'overdue' : item.next_due_date === in1Day ? 1 : 3;
      const sentField = isOverdue ? "overdue_sent_at" : daysOut === 3 ? "reminder_3d_sent_at" : "reminder_1d_sent_at";

      if (item[sentField]) {
        log.push(`${item.id} (${daysOut}): already sent`);
        continue;
      }

      const { subject, html } = buildEmail(item, daysOut);
      const whatsappText = buildWhatsAppText(item, daysOut);
      const errors: string[] = [];

      if (item.payer_email) {
        try { await sendEmail(item.payer_email, subject, html); } catch (e: any) { errors.push(`email: ${e.message}`); }
      }
      if (item.payer_phone) {
        try { await sendWhatsApp(item.payer_phone, whatsappText); } catch (e: any) { errors.push(`wa: ${e.message}`); }
      }

      await supabase.from("recurring_income").update({ [sentField]: new Date().toISOString() }).eq("id", item.id);
      sent++;
      log.push(`${item.payer_name} (${daysOut})${errors.length ? ` ERRORS: ${errors.join(", ")}` : " OK"}`);
    }

    return new Response(JSON.stringify({ success: true, sent, log }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
