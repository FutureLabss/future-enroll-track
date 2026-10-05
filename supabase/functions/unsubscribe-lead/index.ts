import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token");
  const [id, supplied] = token?.split('.') || [];
  if (!id || !supplied || !Deno.env.get("UNSUBSCRIBE_SECRET")) return new Response("Invalid unsubscribe link", { status: 400 });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("UNSUBSCRIBE_SECRET")!), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = new Uint8Array(supplied.match(/.{2}/g)?.map(x => parseInt(x, 16)) || []);
  if (!await crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(id))) return new Response("Invalid unsubscribe link", { status: 400 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: delivery } = await db.from("marketing_email_deliveries").select("lead_id").eq("id", id).maybeSingle();
  if (!delivery) return new Response("Invalid unsubscribe link", { status: 404 });
  await db.from("crm_leads").update({ marketing_consent: false, suppressed_at: new Date().toISOString(), suppression_reason: "unsubscribed" }).eq("id", delivery.lead_id);
  await db.from("marketing_consent_history").insert({ lead_id: delivery.lead_id, consented: false, source: "email_unsubscribe" });
  await db.from("marketing_campaign_enrollments").update({ status: "stopped", stop_reason: "unsubscribed" }).eq("lead_id", delivery.lead_id).in("status", ["active", "paused"]);
  return new Response("You have been unsubscribed.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
});
