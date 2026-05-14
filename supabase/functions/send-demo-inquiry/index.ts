const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  name: string;
  email: string;
  organization: string;
  size: string;
  message: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const payload: Payload = await req.json();
    const { name, email, organization, size, message } = payload;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f4f4f5;margin:0;padding:40px 20px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
      <div style="width:36px;height:36px;background:#7c3aed;border-radius:8px;display:flex;align-items:center;justify-content:center">
        <span style="color:#fff;font-weight:700;font-size:16px">F</span>
      </div>
      <span style="font-size:18px;font-weight:700"><span style="color:#7c3aed">Future</span>Labs LMS</span>
    </div>

    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700">New Demo Inquiry 🎉</h2>
    <p style="margin:0 0 28px;color:#6b7280;font-size:14px">Someone is interested in getting started with FutureLabs LMS.</p>

    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:130px">Name</td>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600">${name}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px">Email</td>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px">
          <a href="mailto:${email}" style="color:#7c3aed">${email}</a>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px">Organization</td>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px">${organization || '—'}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px">School size</td>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px">${size || '—'}</td>
      </tr>
      ${message ? `
      <tr>
        <td style="padding:10px 0;color:#6b7280;font-size:13px;vertical-align:top">Message</td>
        <td style="padding:10px 0;font-size:14px">${message}</td>
      </tr>` : ''}
    </table>

    <div style="margin-top:28px;padding:16px;background:#f5f3ff;border-radius:10px">
      <p style="margin:0;font-size:13px;color:#7c3aed;font-weight:600">Suggested next step</p>
      <p style="margin:4px 0 0;font-size:13px;color:#6b7280">Reply to <a href="mailto:${email}" style="color:#7c3aed">${email}</a> within 24 hours to schedule an onboarding call.</p>
    </div>
  </div>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "FutureLabs LMS <no-reply@futurelabs.ng>",
        to: ["manny@futurelabs.com.ng"],
        reply_to: email,
        subject: `Demo inquiry from ${name}${organization ? ` — ${organization}` : ''}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Email send failed");
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
