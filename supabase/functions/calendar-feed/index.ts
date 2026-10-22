import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCalendarFeed, tokenFromUrl, type FeedEvent } from "./feed.ts";

Deno.serve(async (req) => {
  const token = tokenFromUrl(req.url);
  if (!token) return new Response("Invalid calendar link", { status: 400 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: tokenRow } = await db.from("calendar_feed_tokens").select("user_id").eq("token", token).maybeSingle();
  if (!tokenRow) return new Response("This calendar link is no longer valid. Get a new one from your FutureLabs profile.", { status: 404 });

  const { data, error } = await db.rpc("calendar_feed_events", { p_token: token });
  if (error) return new Response("Calendar is temporarily unavailable", { status: 500 });

  const body = buildCalendarFeed((data || []) as FeedEvent[], "FutureLabs Classes");
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="futurelabs.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
});
