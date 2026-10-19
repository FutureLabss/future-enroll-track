import { corsHeaders, json, verifyAndRecord } from '../_shared/paystack.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const reference = new URL(req.url).searchParams.get('reference') || (await req.json()).reference;
    if (typeof reference !== 'string' || !reference) return json({ error: 'Reference required' }, 400);
    return json(await verifyAndRecord(reference));
  } catch (error) { return json({ status: 'failed', message: error instanceof Error ? error.message : 'Verification failed' }, 400); }
});
