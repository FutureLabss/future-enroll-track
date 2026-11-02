// WhatsApp through Twilio. Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
// TWILIO_WHATSAPP_NUMBER ("whatsapp:+234..."); throws when they aren't set.
// Meta only delivers business-started messages as approved templates, so when
// TWILIO_TEMPLATES ({"overdue_paused": "HX…", …}, see docs/whatsapp-templates.md)
// names a template for the message, it goes out as that template; otherwise as free
// text, which only arrives in the Twilio sandbox or within 24h of the person's reply.
// Nigerian numbers arrive as 0803…, +234 803… or 234803…; Twilio wants +234803….
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return `+${digits}`;
}

export function whatsappConfigured(): boolean {
  return Boolean(Deno.env.get("TWILIO_ACCOUNT_SID") && Deno.env.get("TWILIO_AUTH_TOKEN") && Deno.env.get("TWILIO_WHATSAPP_NUMBER"));
}

export interface WhatsAppTemplate {
  key: string;
  vars: string[];
}

function templateSid(key: string): string | undefined {
  try {
    return JSON.parse(Deno.env.get("TWILIO_TEMPLATES") || "{}")[key];
  } catch {
    return undefined;
  }
}

export async function sendWhatsApp(to: string, body: string, template?: WhatsAppTemplate) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_WHATSAPP_NUMBER");
  if (!accountSid || !authToken || !fromNumber) throw new Error("Twilio credentials not fully configured");

  const params = new URLSearchParams();
  params.append("From", fromNumber);
  params.append("To", to.startsWith("whatsapp:") ? to : `whatsapp:${toE164(to)}`);
  const sid = template && templateSid(template.key);
  if (sid) {
    params.append("ContentSid", sid);
    params.append("ContentVariables", JSON.stringify(Object.fromEntries(template.vars.map((v, i) => [String(i + 1), v]))));
  } else {
    params.append("Body", body);
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Twilio API error [${res.status}]: ${await res.text()}`);
  return await res.json();
}
