import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderDigestEmail, signUnsubscribeToken } from "../_shared/digestEmail.ts";

// Runs on a 10-minute cron (x-cron-secret) to start due weekly digests and
// work through their delivery queue. Admins can also call it with their JWT:
//   { action: "test", subject, body }  → sends one preview to the admin only
//   { action: "run" }                  → processes the queue now ("Send now")

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface ClaimedDelivery {
  delivery_id: string;
  digest_id: string;
  hub_id: string;
  normalized_email: string;
  full_name: string | null;
  subject: string;
  body: string;
  hub_name: string | null;
}

const BATCH = 50;
const CONCURRENCY = 5;
const TIME_BUDGET_MS = 100_000;

async function sendViaResend(to: string, subject: string, html: string, text: string, unsubscribeUrl: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("MARKETING_FROM") || "FutureLabs <notifications@futurelabs.ng>",
      to: [to],
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

function unsubscribeLink(token: string) {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-unsubscribe?token=${encodeURIComponent(token)}`;
}

async function processQueue(db: ReturnType<typeof createClient>) {
  const secret = Deno.env.get("UNSUBSCRIBE_SECRET");
  if (!secret) throw new Error("UNSUBSCRIBE_SECRET not configured");
  const started = Date.now();
  const { data: startedCount, error: startError } = await db.rpc("start_due_digests");
  if (startError) throw startError;

  let sent = 0, failed = 0;
  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data, error } = await db.rpc("claim_digest_deliveries", { p_limit: BATCH });
    if (error) throw error;
    const rows = (data || []) as ClaimedDelivery[];
    if (!rows.length) break;

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      await Promise.all(rows.slice(i, i + CONCURRENCY).map(async (r) => {
        try {
          const url = unsubscribeLink(await signUnsubscribeToken(secret, r.hub_id, r.normalized_email));
          const email = renderDigestEmail({ subject: r.subject, body: r.body, name: r.full_name, hubName: r.hub_name, unsubscribeUrl: url });
          const provider = await sendViaResend(r.normalized_email, email.subject, email.html, email.text, url);
          await db.from("email_digest_deliveries")
            .update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: provider.id, error_message: null })
            .eq("id", r.delivery_id);
          sent++;
        } catch (e) {
          await db.from("email_digest_deliveries")
            .update({ status: "failed", error_message: (e as Error).message.slice(0, 500) })
            .eq("id", r.delivery_id);
          failed++;
        }
      }));
    }
  }

  const { data: finished } = await db.rpc("finish_digests");
  return { started: startedCount ?? 0, sent, failed, finished: finished ?? 0 };
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

    if (body.action === "test") {
      if (!user.email) return json({ error: "Your account has no email address" }, 400);
      if (!String(body.subject || "").trim()) return json({ error: "Subject is required" }, 400);
      const { data: member } = await db.from("hub_members").select("hub_id, hubs(name)").eq("user_id", user.id).maybeSingle<{ hub_id: string; hubs: { name: string } | null }>();
      const { data: profile } = await db.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-unsubscribe?preview=1`;
      const email = renderDigestEmail({
        subject: String(body.subject),
        body: String(body.body || ""),
        name: profile?.full_name || null,
        hubName: member?.hubs?.name || null,
        unsubscribeUrl: url,
      });
      await sendViaResend(user.email, `[Test] ${email.subject}`, email.html, email.text, url);
      return json({ sent_to: user.email });
    }

    if (body.action === "run") {
      return json(await processQueue(db));
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
