import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import QRCode from 'https://esm.sh/qrcode@1.5.4';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function center(page: any, font: any, text: string, size: number, y: number, color = rgb(0.08, 0.12, 0.2)) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (842 - width) / 2, y, size, font, color });
}

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ success: false, error: 'Service configuration is missing' }, 500);
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const authorization = req.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  const cronSecret = Deno.env.get('CRON_SECRET');
  let studentId: string | null = null;
  if (!cronSecret || token !== cronSecret) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return json({ success: false, error: 'Unauthorized' }, 401);
    const [{ data: roles }, { data: owner }] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', data.user.id),
      supabase.from('system_owners').select('user_id').eq('user_id', data.user.id).maybeSingle(),
    ]);
    const privileged = Boolean(owner) || (roles || []).some((row: any) => row.role === 'admin');
    studentId = privileged ? null : data.user.id;
  }

  let query = supabase.from('certificates').select('*').in('status', ['pending_generation', 'generation_failed']).lt('generation_attempts', 4).order('created_at').limit(20);
  if (studentId) query = query.eq('student_id', studentId);
  const { data: certificates, error: fetchError } = await query;
  if (fetchError) return json({ success: false, error: fetchError.message }, 500);

  const frontendUrl = (Deno.env.get('FRONTEND_URL') || '').replace(/\/$/, '');
  const results: Array<{ id: string; status: string; error?: string }> = [];
  for (const certificate of certificates || []) {
    try {
      await supabase.from('certificates').update({ generation_attempts: certificate.generation_attempts + 1, generation_error: null }).eq('id', certificate.id).eq('status', certificate.status);
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([842, 595]);
      const regular = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      page.drawRectangle({ x: 18, y: 18, width: 806, height: 559, borderWidth: 3, borderColor: rgb(0.08, 0.36, 0.48) });
      page.drawRectangle({ x: 28, y: 28, width: 786, height: 539, borderWidth: 1, borderColor: rgb(0.75, 0.62, 0.2) });
      center(page, bold, 'CORIFTECH SOLUTIONS LTD.', 16, 520, rgb(0.08, 0.36, 0.48));
      center(page, bold, 'CERTIFICATE OF COMPLETION', 30, 455);
      center(page, regular, 'This certificate is proudly presented to', 13, 410);
      center(page, bold, certificate.learner_name, 27, 365, rgb(0.08, 0.36, 0.48));
      center(page, regular, 'for successfully completing', 13, 330);
      center(page, bold, certificate.program_name, 21, 290);
      center(page, regular, `${certificate.cohort_label}  •  Completed ${new Date(certificate.completion_date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`, 12, 255);
      page.drawText('________________________', { x: 120, y: 120, size: 12, font: regular });
      page.drawText('Authorized Signatory', { x: 150, y: 100, size: 10, font: regular });
      page.drawText(`Certificate No: ${certificate.certificate_number}`, { x: 55, y: 48, size: 9, font: regular });
      const verifyUrl = `${frontendUrl}/verify-certificate/${certificate.verification_token}`;
      const qrData = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 220 });
      const qr = await pdf.embedPng(qrData);
      page.drawImage(qr, { x: 670, y: 58, width: 105, height: 105 });
      page.drawText('Scan to verify', { x: 690, y: 45, size: 8, font: regular });
      const bytes = await pdf.save();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
      const path = `${certificate.hub_id}/${certificate.cohort_id}/${certificate.id}-v${certificate.version}.pdf`;
      const { error: uploadError } = await supabase.storage.from('certificates').upload(path, bytes, { contentType: 'application/pdf', upsert: false });
      if (uploadError && !uploadError.message.toLowerCase().includes('already exists')) throw uploadError;
      const { error: updateError } = await supabase.from('certificates').update({ status: 'issued', pdf_storage_path: path, content_hash: hash, issued_at: new Date().toISOString(), generation_error: null }).eq('id', certificate.id).in('status', ['pending_generation', 'generation_failed']);
      if (updateError) throw updateError;
      results.push({ id: certificate.id, status: 'issued' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await supabase.from('certificates').update({ status: 'generation_failed', generation_error: message }).eq('id', certificate.id);
      results.push({ id: certificate.id, status: 'generation_failed', error: message });
    }
  }
  return json({ success: true, processed: results.length, results });
});
