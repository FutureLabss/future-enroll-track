import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-client-info, apikey" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    if (!body.full_name || (!body.email && !body.phone)) throw new Error("full_name and email or phone are required");
    if (body.website) return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const slug = String(body.source || "website").toLowerCase();
    const { data: source } = await admin.from("lead_sources").select("id").eq("slug", slug).maybeSingle();
    const payload = { full_name: String(body.full_name).trim().slice(0, 200), email: body.email ? String(body.email).trim().toLowerCase().slice(0, 320) : null, phone: body.phone ? String(body.phone).trim().slice(0, 50) : null, source_id: source?.id || null, source_detail: body.source_detail?.slice(0, 300) || null, utm_source: body.utm_source?.slice(0, 200) || null, utm_medium: body.utm_medium?.slice(0, 200) || null, utm_campaign: body.utm_campaign?.slice(0, 200) || null, referral_detail: body.referral_detail?.slice(0, 500) || null, marketing_consent: body.marketing_consent === true, consented_at: body.marketing_consent === true ? new Date().toISOString() : null, consent_source: body.marketing_consent === true ? slug : null };
    const { data: existing } = payload.email ? await admin.from("crm_leads").select("id").eq("normalized_email", payload.email).maybeSingle() : { data: null };
    const result = existing ? await admin.from("crm_leads").update(payload).eq("id", existing.id).select().single() : await admin.from("crm_leads").insert(payload).select().single();
    if (result.error) throw result.error;
    const lead = result.data;
    await admin.from("lead_activities").insert({ lead_id: lead.id, activity_type: "form_submission", title: "Public form submitted", details: { source: slug } });
    if (body.marketing_consent === true) await admin.from("marketing_consent_history").insert({ lead_id: lead.id, consented: true, source: slug });
    await admin.rpc("record_lead_score_event", { p_lead_id: lead.id, p_event_type: "form_submission" });
    return new Response(JSON.stringify({ ok: true, id: lead.id }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) { return new Response(JSON.stringify({ error: (error as Error).message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } }); }
});
