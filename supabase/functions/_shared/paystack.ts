import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { matchesAttempt, type PaystackTransaction } from './payment-validation.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
export const adminClient = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

export async function verifyAndRecord(reference: string) {
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) throw new Error('Online payment is not configured');
  const admin = adminClient();
  const { data: savedAttempt, error } = await admin.from('registration_payment_attempts').select('*').eq('reference', reference).maybeSingle();
  if (error) throw error;
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
  const result = await response.json();
  if (!response.ok || !result.status) throw new Error('Could not verify payment; please retry');
  const tx = result.data as PaystackTransaction;
  let attempt = savedAttempt;
  // Preserve checkouts initialized by the old handler immediately before deployment.
  // Their successful transaction metadata is obtained from Paystack, never from the browser.
  if (!attempt && /^PSK-\d{13}-[A-Z0-9]{6}$/.test(reference) && tx.reference === reference && tx.status === 'success') {
    const { data: legacy } = await admin.from('invoices').select('id,enrollment_id,currency,enrollments!inner(registration_flow_version)').eq('id', tx.metadata?.invoice_id).single();
    const legacyEnrollment = Array.isArray(legacy?.enrollments) ? legacy.enrollments[0] : legacy?.enrollments;
    if (!legacy || legacyEnrollment?.registration_flow_version !== 1 || legacy.enrollment_id !== tx.metadata?.enrollment_id
      || legacy.currency !== tx.currency || !Number.isSafeInteger(tx.amount) || tx.amount <= 0) throw new Error('Unrecognized legacy payment');
    if (tx.metadata.installment_id) {
      const { data: part } = await admin.from('installments').select('id').eq('id', tx.metadata.installment_id).eq('invoice_id', legacy.id).single();
      if (!part) throw new Error('Legacy installment mismatch');
    }
    const { error: restoreError } = await admin.from('registration_payment_attempts').upsert({
      reference, invoice_id: legacy.id, installment_id: tx.metadata.installment_id || null, amount: tx.amount / 100, currency: tx.currency,
    }, { onConflict: 'reference', ignoreDuplicates: true });
    if (restoreError) throw restoreError;
    const { data: restored, error: readError } = await admin.from('registration_payment_attempts').select('*').eq('reference',reference).single();
    if (readError) throw readError;
    attempt = restored;
  }
  if (!attempt) throw new Error('Unknown payment reference');
  if (!matchesAttempt(tx, attempt)) throw new Error('Payment is incomplete or does not match the invoice');
  const { data: invoice } = await admin.from('invoices').select('enrollment_id').eq('id', attempt.invoice_id).single();
  if (!invoice || tx.metadata.enrollment_id !== invoice.enrollment_id) throw new Error('Payment registration mismatch');
  const { data: recorded, error: recordError } = await admin.rpc('complete_paystack_attempt', { p_reference: reference, p_paid_at: tx.paid_at });
  if (recordError) throw recordError;
  const { data: updated } = await admin.from('invoices').select('status').eq('id', attempt.invoice_id).single();
  if (recorded) {
    try {
      const { error } = await admin.functions.invoke('send-notification', { body: {
        type: updated?.status === 'paid' ? 'invoice_settled' : 'payment_received', channel: 'both',
        enrollment_id: invoice.enrollment_id, invoice_id: attempt.invoice_id,
        extra: { amount_paid: Number(attempt.amount), payment_reference: reference, payment_method: 'paystack' },
      } });
      if (error) console.error('Payment recorded; notification failed', error);
    } catch (error) { console.error('Payment recorded; notification failed', error); }
  }
  return { status: 'success', reference, amount: Number(attempt.amount), fully_paid: updated?.status === 'paid' };
}
