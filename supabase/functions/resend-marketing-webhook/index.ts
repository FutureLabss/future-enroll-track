import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhook } from "npm:svix@1.24.0";
Deno.serve(async (req) => {
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) return new Response("Webhook secret missing", { status: 500 });
  const raw = await req.text();
  let event: any;
  try { event = new Webhook(secret).verify(raw, { "svix-id": req.headers.get("svix-id") || "", "svix-timestamp": req.headers.get("svix-timestamp") || "", "svix-signature": req.headers.get("svix-signature") || "" }); }
  catch { return new Response("Invalid signature", { status: 401 }); }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: delivery } = await db.from("marketing_email_deliveries").select("*").eq("provider_message_id", event.data?.email_id).maybeSingle();
  if (!delivery) return new Response("ok");
  const at = new Date().toISOString(); const changes: Record<string, unknown> = { status: event.type };
  if (event.type === "email.delivered") changes.delivered_at = at;
  if (event.type === "email.opened") changes.opened_at = delivery.opened_at || at;
  if (event.type === "email.clicked") changes.clicked_at = delivery.clicked_at || at;
  if (event.type === "email.bounced") changes.bounced_at = at;
  await db.from("marketing_email_deliveries").update(changes).eq("id", delivery.id);
  if (event.type === "email.opened") await db.rpc("record_lead_score_event", { p_lead_id: delivery.lead_id, p_event_type: "email_open", p_external_key: delivery.id });
  if (event.type === "email.clicked") await db.rpc("record_lead_score_event", { p_lead_id: delivery.lead_id, p_event_type: "email_click", p_external_key: delivery.id });
  if (event.type === "email.bounced") { await db.from("crm_leads").update({ suppressed_at: at, suppression_reason: "hard_bounce" }).eq("id", delivery.lead_id); await db.from("marketing_campaign_enrollments").update({ status: "stopped", stop_reason: "hard_bounce" }).eq("lead_id", delivery.lead_id).eq("status", "active"); }
  return new Response("ok");
});
