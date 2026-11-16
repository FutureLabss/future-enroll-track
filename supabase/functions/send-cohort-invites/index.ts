import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCohortIcs, describePattern } from "../_shared/cohortInvite.ts";

// Runs on a 10-minute cron (x-cron-secret). Emails each cohort member and its tutor
// one recurring calendar invite for the cohort's weekly classes, an updated one when
// the pattern or a class changes, and a cancellation to anyone who left.

interface Due {
  cohort_id: string;
  normalized_email: string;
  full_name: string | null;
  role: "student" | "tutor";
  cancel: boolean;
  invite_sequence: number;
  cohort_label: string | null;
  program_name: string | null;
  first_date: string;
  end_date: string;
  class_days: string[];
  class_start_time: string;
  class_end_time: string;
  class_location: string | null;
  class_meeting_link: string | null;
  tutor_name: string | null;
  exdates: string[];
}

const FROM_EMAIL = "notifications@futurelabs.ng";
const FROM_NAME = "FutureLabs";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });

function emailFor(r: Due, title: string) {
  const when = describePattern(r.class_days, r.class_start_time, r.class_end_time);
  const first = (r.full_name || "").trim().split(/\s+/)[0] || "there";
  if (r.cancel) {
    return {
      subject: `Cancelled: ${title}`,
      html: `<p>Hi ${esc(first)},</p><p>You're no longer in <strong>${esc(title)}</strong>, so these classes have been removed from your calendar.</p><p>If this is a mistake, reply to this email.</p>`,
    };
  }
  const extra = r.exdates.length ? `<p>No class on: ${r.exdates.map(day).join(", ")}.</p>` : "";
  return {
    subject: `Class schedule: ${title} (${when})`,
    html: `<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <p>Hi ${esc(first)},</p>
      <p>Here are your classes for <strong>${esc(title)}</strong>. Accept this invite to add them all to your calendar; you'll get a reminder 30 minutes before each class.</p>
      <table style="font-size: 14px; border-collapse: collapse; margin: 12px 0;">
        <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">When</td><td style="padding: 4px 0; font-weight: 600;">${esc(when)} (WAT)</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">From</td><td style="padding: 4px 0; font-weight: 600;">${day(r.first_date)} to ${day(r.end_date)}</td></tr>
        ${r.class_location ? `<tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Where</td><td style="padding: 4px 0; font-weight: 600;">${esc(r.class_location)}</td></tr>` : ""}
        ${r.class_meeting_link ? `<tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Online</td><td style="padding: 4px 0;"><a href="${esc(r.class_meeting_link)}">${esc(r.class_meeting_link)}</a></td></tr>` : ""}
        ${r.tutor_name && r.role === "student" ? `<tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Tutor</td><td style="padding: 4px 0; font-weight: 600;">${esc(r.tutor_name)}</td></tr>` : ""}
      </table>
      ${extra}
      <p>If the schedule changes, you'll get an updated invite that replaces this one.</p>
    </div>`,
  };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await db.rpc("cohort_invites_due", { p_limit: 100 });
  if (error) return json({ error: error.message }, 500);

  let sent = 0, failed = 0;
  for (const r of (data || []) as Due[]) {
    const title = [r.program_name, r.cohort_label].filter(Boolean).join(" · ") || "Class";
    const method = r.cancel ? "CANCEL" : "REQUEST";
    try {
      const ics = buildCohortIcs({
        cohortId: r.cohort_id,
        sequence: r.cancel ? r.invite_sequence + 1 : r.invite_sequence,
        method,
        title,
        firstDate: r.first_date,
        endDate: r.end_date,
        days: r.class_days,
        startTime: r.class_start_time,
        endTime: r.class_end_time,
        exdates: r.exdates,
        location: r.class_location,
        meetingLink: r.class_meeting_link,
        organizerEmail: FROM_EMAIL,
        organizerName: FROM_NAME,
        attendeeEmail: r.normalized_email,
        attendeeName: r.full_name,
      });
      const { subject, html } = emailFor(r, title);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: [r.normalized_email],
          reply_to: Deno.env.get("PAYMENTS_REPLY_TO") || "hello@futurelabs.africa",
          subject,
          html,
          attachments: [{
            filename: method === "CANCEL" ? "cancel.ics" : "invite.ics",
            content: btoa(String.fromCharCode(...new TextEncoder().encode(ics))),
            content_type: `text/calendar; charset=UTF-8; method=${method}`,
          }],
        }),
      });
      if (!res.ok) throw new Error(`Resend [${res.status}]: ${(await res.text()).slice(0, 300)}`);
      const provider = await res.json() as { id: string };
      await db.rpc("record_cohort_invite", {
        p_cohort_id: r.cohort_id, p_email: r.normalized_email, p_full_name: r.full_name, p_role: r.role,
        p_sequence: r.invite_sequence, p_cancelled: r.cancel, p_provider_message_id: provider.id, p_error: null,
      });
      sent++;
    } catch (e) {
      await db.rpc("record_cohort_invite", {
        p_cohort_id: r.cohort_id, p_email: r.normalized_email, p_full_name: r.full_name, p_role: r.role,
        p_sequence: r.invite_sequence, p_cancelled: r.cancel, p_provider_message_id: null, p_error: (e as Error).message.slice(0, 500),
      });
      failed++;
    }
  }
  return json({ sent, failed });
});
