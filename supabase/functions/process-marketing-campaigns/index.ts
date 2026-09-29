import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const personalize = (value: string, lead: any, hub: any, owner: any) => value
  .replace(/{{\s*name\s*}}/gi, lead.full_name || "")
  .replace(/{{\s*source\s*}}/gi, lead.lead_sources?.name || "")
  .replace(/{{\s*owner\s*}}/gi, owner?.full_name || "")
  .replace(/{{\s*program\s*}}/gi, lead.programs?.program_name || "")
  .replace(/{{\s*hub\s*}}/gi, hub?.name || "");

async function unsubscribeToken(id: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("UNSUBSCRIBE_SECRET")!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id));
  return `${id}.${Array.from(new Uint8Array(signature)).map(x => x.toString(16).padStart(2, "0")).join("")}`;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return new Response("Unauthorized", { status: 401 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows, error } = await db.from("marketing_campaign_enrollments").select("*,marketing_campaigns!inner(status),crm_leads(*,lead_sources(name),programs(program_name)),hubs(name)").eq("status", "active").eq("marketing_campaigns.status", "active").lte("next_send_at", new Date().toISOString()).limit(100);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  let sent = 0, failed = 0;
  for (const enrollment of rows || []) {
    const lead = enrollment.crm_leads;
    if (!lead?.email || !lead.marketing_consent || lead.suppressed_at || ["registered", "not_interested"].includes(lead.lifecycle_status)) { await db.from("marketing_campaign_enrollments").update({ status: "stopped", stop_reason: "ineligible" }).eq("id", enrollment.id); continue; }
    const { data: step } = await db.from("marketing_campaign_steps").select("*,marketing_email_templates(*)").eq("campaign_id", enrollment.campaign_id).eq("step_order", enrollment.next_step_order).maybeSingle();
    if (!step) { await db.from("marketing_campaign_enrollments").update({ status: "completed" }).eq("id", enrollment.id); continue; }
    const reservation = await db.from("marketing_email_deliveries").insert({ hub_id: enrollment.hub_id, campaign_enrollment_id: enrollment.id, campaign_step_id: step.id, lead_id: lead.id }).select().single();
    if (reservation.error) continue;
    try {
      const { data: owner } = lead.owner_id ? await db.from("profiles").select("full_name").eq("user_id", lead.owner_id).maybeSingle() : { data: null };
      const unsubscribe = `${Deno.env.get("SUPABASE_URL")}/functions/v1/unsubscribe-lead?token=${await unsubscribeToken(reservation.data.id)}`;
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: Deno.env.get("MARKETING_FROM") || "FutureLabs <notifications@futurelabs.ng>", to: [lead.email], subject: personalize(step.marketing_email_templates.subject, lead, enrollment.hubs, owner), html: `${personalize(step.marketing_email_templates.html_body, lead, enrollment.hubs, owner)}<p style="font-size:12px;color:#64748b"><a href="${unsubscribe}">Unsubscribe</a></p>` }) });
      if (!response.ok) throw new Error(await response.text());
      const provider = await response.json();
      await db.from("marketing_email_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: provider.id }).eq("id", reservation.data.id);
      const { data: next } = await db.from("marketing_campaign_steps").select("step_order,delay_hours").eq("campaign_id", enrollment.campaign_id).gt("step_order", step.step_order).order("step_order").limit(1).maybeSingle();
      await db.from("marketing_campaign_enrollments").update(next ? { next_step_order: next.step_order, next_send_at: new Date(Date.now() + next.delay_hours * 3600000).toISOString() } : { status: "completed" }).eq("id", enrollment.id); sent++;
    } catch (error) { failed++; await db.from("marketing_email_deliveries").update({ status: "failed", error_message: (error as Error).message }).eq("id", reservation.data.id); }
  }
  return new Response(JSON.stringify({ sent, failed }), { headers: { "Content-Type": "application/json" } });
});
