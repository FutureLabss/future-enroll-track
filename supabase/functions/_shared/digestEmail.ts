export interface DigestEmail {
  subject: string;
  body: string;
  name: string | null;
  hubName: string | null;
  unsubscribeUrl: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function firstName(name: string | null): string {
  const first = (name || '').trim().split(/\s+/)[0];
  return first || 'there';
}

export function personalize(text: string, name: string | null): string {
  return text
    .replace(/{{\s*first_name\s*}}/gi, firstName(name))
    .replace(/{{\s*name\s*}}/gi, (name || '').trim() || 'there');
}

// Plain text in, safe HTML out: blank lines make paragraphs, single newlines
// become <br>, bare URLs become links. Nothing the author types is treated as HTML.
export function bodyToHtml(body: string): string {
  return body
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .filter(p => p.trim())
    .map(p => {
      const html = escapeHtml(p)
        .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" style="color:#4f46e5;">$1</a>')
        .replace(/\n/g, '<br/>');
      return `<p style="margin:0 0 16px;">${html}</p>`;
    })
    .join('');
}

export function renderDigestEmail(e: DigestEmail): { subject: string; html: string; text: string } {
  const subject = personalize(e.subject, e.name);
  const body = personalize(e.body, e.name);
  const hub = escapeHtml(e.hubName || 'FutureLabs');
  const html = `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f7f7fb;padding:24px;color:#0f172a;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
<h1 style="font-size:18px;margin:0 0 16px;color:#1e1b4b;">${escapeHtml(subject)}</h1>
<div style="font-size:15px;line-height:1.6;">${bodyToHtml(body)}</div>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
<p style="font-size:12px;color:#64748b;margin:0;">You're receiving the ${hub} weekly digest because you've studied with, worked with or enquired at ${hub}.
<a href="${escapeHtml(e.unsubscribeUrl)}" style="color:#64748b;">Unsubscribe</a></p>
</div></body></html>`;
  const text = `${body}\n\n—\nUnsubscribe: ${e.unsubscribeUrl}`;
  return { subject, html, text };
}

// Unsubscribe tokens: base64url(JSON {h: hub_id, e: email}) + "." + hex HMAC-SHA256.
// The email address is the identity (contacts, leads and staff share one
// suppression list), so the token must be unforgeable rather than secret.
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), c => c.charCodeAt(0));
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  return Array.from(sig).map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function signUnsubscribeToken(secret: string, hubId: string, email: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ h: hubId, e: email.trim().toLowerCase() })));
  return `${payload}.${await hmacHex(secret, payload)}`;
}

export async function verifyUnsubscribeToken(secret: string, token: string): Promise<{ hubId: string; email: string } | null> {
  const [payload, sig] = (token || '').split('.');
  if (!payload || !sig || !/^[0-9a-f]{64}$/.test(sig)) return null;
  const expected = await hmacHex(secret, payload);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const { h, e } = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return typeof h === 'string' && typeof e === 'string' && e.includes('@') ? { hubId: h, email: e } : null;
  } catch {
    return null;
  }
}
