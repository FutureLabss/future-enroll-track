import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { adminClient, corsHeaders, json } from '../_shared/paystack.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!secret) throw new Error('Online payment is not configured');
    const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    });
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const { invoice_id, installment_id, callback_url } = await req.json();
    const admin = adminClient();
    const { data: invoice } = await admin.from('invoices').select('*, enrollments!inner(user_id,email,full_name,registration_flow_version,registration_payment_option,custom_amount_status,amount_paid,initial_payment_amount)').eq('id', invoice_id).single();
    if (!invoice || invoice.enrollments.user_id !== user.id) return json({ error: 'Invoice not found' }, 404);
    if (invoice.status === 'cancelled' || invoice.status === 'paid') throw new Error('Invoice is not payable');
    const enrollment = invoice.enrollments;
    if (enrollment.registration_flow_version === 2 && enrollment.registration_payment_option === 'custom'
      && enrollment.custom_amount_status !== 'approved' && Number(enrollment.amount_paid) >= Number(enrollment.initial_payment_amount)) {
      throw new Error('Wait for approval of the remaining custom payment schedule');
    }
    const { data: parts } = await admin.from('installments').select('*').eq('invoice_id', invoice_id).order('due_date').order('created_at').order('id');
    const { data: payments } = await admin.from('payments').select('amount').eq('invoice_id', invoice_id);
    const paid = Math.max((payments || []).reduce((sum, p) => sum + Number(p.amount), 0),
      (parts || []).filter(p => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount), 0));
    const outstanding = Number(invoice.total_amount) - paid;
    const part = installment_id ? parts?.find(p => p.id === installment_id && p.status !== 'paid') : parts?.find(p => p.status !== 'paid');
    if (installment_id && !part) throw new Error('Installment is unavailable');
    const preceding = part ? (parts || []).slice(0, parts!.indexOf(part)).reduce((sum, p) => sum + Number(p.amount), 0) : 0;
    const amount = part ? Math.min(outstanding, preceding + Number(part.amount) - paid) : outstanding;
    if (amount <= 0) throw new Error('Nothing to pay');
    const frontend = Deno.env.get('FRONTEND_URL');
    if (!frontend || new URL(callback_url).origin !== new URL(frontend).origin) throw new Error('Invalid payment return URL');
    const reference = `PSK-${crypto.randomUUID()}`;
    const { error } = await admin.from('registration_payment_attempts').insert({ reference, invoice_id, installment_id: part?.id || null, amount });
    if (error) throw error;
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: invoice.enrollments.email, amount: Math.round(amount * 100), currency: 'NGN', reference, callback_url,
        metadata: { invoice_id, installment_id: part?.id || null, enrollment_id: invoice.enrollment_id } }),
    });
    const result = await response.json();
    if (!response.ok || !result.status) throw new Error(result.message || 'Could not start payment');
    return json({ authorization_url: result.data.authorization_url, reference });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Payment initialization failed' }, 400); }
});
