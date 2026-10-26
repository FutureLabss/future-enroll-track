import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderDigestEmail, signUnsubscribeToken } from "../_shared/digestEmail.ts";

// Runs on a 10-minute cron (x-cron-secret) and sends every onboarding step that
// has come due. Admins can also call it with their JWT:
//   { action: "test", subject, body }  → sends one preview to the admin only

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface ClaimedEmail {
  delivery_id: string;
  hub_id: string;
  normalized_email: string;
  full_name: string | null;
  subject: string;
  body: string;
  hub_name: string | null;
  reply_to: string | null;
  program_name: string | null;
  cohort_label: string | null;
  cohort_start: string | null;
}

const BATCH = 50;
const CONCURRENCY = 5;
const TIME_BUDGET_MS = 100_000;

function formatStart(date: string | null) {
  return date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";
}

function templateVars(hub: string | null, program: string | null, cohort: string | null, start: string | null) {
  return {
    hub: hub || "FutureLabs",
    program: program || "your programme",
    cohort: cohort || "",
    start_date: formatStart(start),
  };
}

const footerFor = (hub: string | null) =>
  `You're receiving this because you recently enrolled with ${hub || "FutureLabs"}.`;

async function sendViaResend(to: string, subject: string, html: string, text: string, unsubscribeUrl: string, replyTo: string | null) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("MARKETING_FROM") || "FutureLabs <notifications@futurelabs.ng>",
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (!res.ok) throw new Error(`Resend [${res.status}]: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as { id: string };
}

async function processQueue(db: ReturnType<typeof createClient>) {
  const secret = Deno.env.get("UNSUBSCRIBE_SECRET");
  if (!secret) throw new Error("UNSUBSCRIBE_SECRET not configured");
  const started = Date.now();

  let sent = 0, failed = 0;
  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data, error } = await db.rpc("claim_onboarding_emails", { p_limit: BATCH });
    if (error) throw error;
    const rows = (data || []) as ClaimedEmail[];
    if (!rows.length) break;

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      await Promise.all(rows.slice(i, i + CONCURRENCY).map(async (r) => {
        try {
          const token = await signUnsubscribeToken(secret, r.hub_id, r.normalized_email);
          const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-unsubscribe?token=${encodeURIComponent(token)}`;
          const email = renderDigestEmail({
            subject: r.subject,
            body: r.body,
            name: r.full_name,
            hubName: r.hub_name,
            unsubscribeUrl: url,
            vars: templateVars(r.hub_name, r.program_name, r.cohort_label, r.cohort_start),
            footer: footerFor(r.hub_name),
          });
          const provider = await sendViaResend(r.normalized_email, email.subject, email.html, email.text, url, r.reply_to);
          await db.from("onboarding_deliveries")
            .update({ status: "sent", sent_at: new Date().toISOString(), subject: email.subject, provider_message_id: provider.id, error_message: null })
            .eq("id", r.delivery_id);
          sent++;
        } catch (e) {
          await db.from("onboarding_deliveries")
            .update({ status: "failed", error_message: (e as Error).message.slice(0, 500) })
            .eq("id", r.delivery_id);
          failed++;
        }
      }));
    }
  }
  return { sent, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) {
      return json(await processQueue(db));
    }

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "Not authenticated" }, 401);
    const { data: roleRow } = await db.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    if (body.action !== "test") return json({ error: "Unknown action" }, 400);
    if (!user.email) return json({ error: "Your account has no email address" }, 400);
    if (!String(body.subject || "").trim()) return json({ error: "Subject is required" }, 400);

    const { data: member } = await db.from("hub_members").select("hub_id, hubs(name, contact_email)").eq("user_id", user.id).maybeSingle<{ hub_id: string; hubs: { name: string; contact_email: string | null } | null }>();
    const { data: profile } = await db.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
    const { data: program } = await db.from("programs").select("program_name").eq("hub_id", member?.hub_id ?? "").eq("active", true).limit(1).maybeSingle();
    const hubName = member?.hubs?.name || null;
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-unsubscribe?preview=1`;
    const email = renderDigestEmail({
      subject: String(body.subject),
      body: String(body.body || ""),
      name: profile?.full_name || null,
      hubName,
      unsubscribeUrl: url,
      vars: templateVars(hubName, program?.program_name || null, "Sample cohort", new Date().toISOString().slice(0, 10)),
      footer: footerFor(hubName),
    });
    await sendViaResend(user.email, `[Test] ${email.subject}`, email.html, email.text, url, member?.hubs?.contact_email || null);
    return json({ sent_to: user.email });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
