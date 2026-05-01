import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!PAYSTACK_SECRET_KEY) throw new Error('PAYSTACK_SECRET_KEY not configured');

    const url = new URL(req.url);
    const reference = url.searchParams.get('reference') || (await req.json().catch(() => ({}))).reference;
    if (!reference) {
      return new Response(JSON.stringify({ error: 'reference required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verify with Paystack
    const psRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    const psJson = await psRes.json();
    if (!psRes.ok || !psJson.status || psJson.data?.status !== 'success') {
      return new Response(JSON.stringify({ status: 'failed', message: psJson.message || 'Verification failed', data: psJson.data }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tx = psJson.data;
    const amount = Number(tx.amount) / 100;
    const meta = tx.metadata || {};
    const invoice_id = meta.invoice_id;
    const installment_id = meta.installment_id || null;
    const enrollment_id = meta.enrollment_id;
    if (!invoice_id || !enrollment_id) {
      return new Response(JSON.stringify({ status: 'failed', message: 'Missing metadata' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Idempotency: skip if reference already recorded
    const { data: existing } = await admin.from('payments').select('id').eq('payment_reference', reference).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ status: 'success', already_recorded: true, reference }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await admin.from('payments').insert({
      invoice_id,
      installment_id,
      amount,
      payment_reference: reference,
      payment_method: 'paystack',
      notes: tx.channel ? `Paystack (${tx.channel})` : 'Paystack',
    });

    if (installment_id) {
      await admin.from('installments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', installment_id);
    }

    // Update enrollment totals
    const { data: enr } = await admin.from('enrollments').select('amount_paid, first_payment_date').eq('id', enrollment_id).single();
    if (enr) {
      const newPaid = Number(enr.amount_paid || 0) + amount;
      const updates: any = {
        amount_paid: newPaid,
        last_payment_date: new Date().toISOString(),
      };
      if (!enr.first_payment_date) {
        updates.first_payment_date = new Date().toISOString();
        updates.enrollment_status = 'active';
      }
      await admin.from('enrollments').update(updates).eq('id', enrollment_id);
    }

    // If invoice fully paid, mark paid
    const { data: remaining } = await admin.from('installments').select('id').eq('invoice_id', invoice_id).neq('status', 'paid');
    const isFullyPaid = remaining && remaining.length === 0;
    if (isFullyPaid) {
      await admin.from('invoices').update({ status: 'paid' }).eq('id', invoice_id);
      await admin.from('enrollments').update({ enrollment_status: 'completed' }).eq('id', enrollment_id);
    }

    // Send notification
    try {
      await admin.functions.invoke('send-notification', {
        body: {
          type: isFullyPaid ? 'invoice_settled' : 'payment_received',
          channel: 'both',
          enrollment_id,
          invoice_id,
          extra: {
            amount_paid: amount,
            payment_reference: reference,
            payment_method: 'paystack',
          },
        },
      });
    } catch (e) {
      console.error('notify failed', e);
    }

    return new Response(JSON.stringify({ status: 'success', reference, amount, fully_paid: isFullyPaid }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
