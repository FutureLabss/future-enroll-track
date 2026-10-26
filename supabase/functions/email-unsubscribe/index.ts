import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyUnsubscribeToken } from "../_shared/digestEmail.ts";

// The unsubscribe link in every weekly digest. GET (a person clicking) and
// POST (mail clients' one-click List-Unsubscribe-Post) both unsubscribe; the
// signed token carries the hub and email, so no login is needed.

const page = (title: string, message: string, status = 200) =>
  new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:Inter,Arial,sans-serif;background:#f7f7fb;padding:48px 16px;color:#0f172a;">
<div style="max-width:440px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;text-align:center;">
<h1 style="font-size:20px;margin:0 0 12px;">${title}</h1><p style="margin:0;color:#475569;">${message}</p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("preview")) {
    return page("This is a test email", "Unsubscribe links in test emails don't do anything.");
  }

  const secret = Deno.env.get("UNSUBSCRIBE_SECRET");
  const target = secret ? await verifyUnsubscribeToken(secret, url.searchParams.get("token") || "") : null;
  if (!target) return page("Link not recognised", "This unsubscribe link is invalid or incomplete.", 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await db.rpc("unsubscribe_email", {
    p_hub_id: target.hubId,
    p_email: target.email,
    p_source: req.method === "POST" ? "one_click" : "digest_link",
  });
  if (error) return page("Something went wrong", "Please try the link again in a few minutes.", 500);

  return page("You're unsubscribed", `${target.email} won't receive the weekly digest or other newsletters from us again.`);
});
