import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return new Response("Unauthorized", { status: 401 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const horizon = new Date(Date.now() + 24 * 3600000).toISOString();
  const { data: tasks, error } = await db.from("lead_follow_ups").select("id,owner_id,title,due_at,crm_leads(full_name)").eq("status", "pending").is("reminder_sent_at", null).lte("due_at", horizon).limit(250);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  for (const task of tasks || []) {
    await db.from("notifications").insert({ user_id: task.owner_id, type: "lead_follow_up", title: task.title, message: `${task.crm_leads?.full_name || "Lead"} is due ${new Date(task.due_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}`, channel: "in_app" });
    await db.from("lead_follow_ups").update({ reminder_sent_at: new Date().toISOString() }).eq("id", task.id).is("reminder_sent_at", null);
  }
  return new Response(JSON.stringify({ reminded: tasks?.length || 0 }), { headers: { "Content-Type": "application/json" } });
});
