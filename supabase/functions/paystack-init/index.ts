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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { invoice_id, installment_id, amount, callback_url } = await req.json();
    if (!invoice_id || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: 'invoice_id and amount required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verify invoice belongs to this user
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, invoice_number, enrollment_id, enrollments!inner(user_id, email, full_name)')
      .eq('id', invoice_id)
      .single();
    if (!invoice) return new Response(JSON.stringify({ error: 'Invoice not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const enr: any = invoice.enrollments;
    if (enr.user_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const reference = `PSK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const psRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: enr.email,
        amount: Math.round(Number(amount) * 100), // kobo
        reference,
        currency: 'NGN',
        callback_url,
        metadata: {
          invoice_id,
          installment_id: installment_id || null,
          enrollment_id: invoice.enrollment_id,
          invoice_number: invoice.invoice_number,
          student_name: enr.full_name,
        },
      }),
    });
    const psJson = await psRes.json();
    if (!psRes.ok || !psJson.status) {
      console.error('Paystack init failed', psJson);
      return new Response(JSON.stringify({ error: psJson.message || 'Paystack init failed' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      authorization_url: psJson.data.authorization_url,
      access_code: psJson.data.access_code,
      reference: psJson.data.reference,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
