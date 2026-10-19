import { json, verifyAndRecord } from '../_shared/paystack.ts';
import { validWebhookSignature } from '../_shared/payment-validation.ts';
// https://paystack.com/docs/payments/webhooks/#signature-validation
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!secret) throw new Error('Payment secret not configured');
    const raw = await req.arrayBuffer();
    const signature = req.headers.get('x-paystack-signature') || '';
    if (!await validWebhookSignature(secret, raw, signature)) return new Response('Invalid signature', { status: 401 });
    const event = JSON.parse(new TextDecoder().decode(raw));
    if (event.event === 'charge.success') await verifyAndRecord(event.data.reference);
    return json({ received: true });
  } catch (error) {
    console.error('Paystack webhook failed', error);
    return new Response('Could not record payment', { status: 500 });
  }
});
