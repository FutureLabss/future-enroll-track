import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { planAmounts, validateReceipt } from '@/lib/registration';
import { matchesAttempt, validWebhookSignature } from '../../../supabase/functions/_shared/payment-validation';
import { createHmac, webcrypto } from 'node:crypto';

describe('registration pricing and receipt validation', () => {
  it('keeps rounded schedule totals equal to the course fee', () => {
    const amounts = planAmounts(100000, { label: 'Three', parts: [{ percent: 33.33, days: 0 }, { percent: 33.33, days: 30 }, { percent: 33.34, days: 60 }] });
    expect(amounts.map(p => p.amount)).toEqual([33330,33330,33340]);
    expect(amounts.reduce((sum,p) => sum+p.amount,0)).toBe(100000);
  });
  it('rejects unsupported or oversized receipts', () => {
    expect(() => validateReceipt(new File(['test'], 'receipt.html', { type: 'text/html' }))).toThrow(/Choose a PDF/);
    expect(() => validateReceipt(new File([new Uint8Array(5242881)], 'receipt.pdf', { type: 'application/pdf' }))).toThrow(/5 MB/);
    expect(() => validateReceipt(new File(['test'], 'receipt.pdf', { type: 'application/pdf' }))).not.toThrow();
  });
});
describe('actual Paystack transaction verification', () => {
  const attempt = { reference: 'PSK-test', amount: '50000.00', currency: 'NGN', invoice_id: 'invoice', installment_id: 'part' };
  const tx = { reference: 'PSK-test', amount: 5000000, currency: 'NGN', status: 'success', paid_at: '2026-10-19T10:00:00Z', metadata: { invoice_id: 'invoice', installment_id: 'part' } };
  it('accepts only the recorded amount, currency, reference, invoice and installment', () => {
    expect(matchesAttempt(tx, attempt)).toBe(true);
    for (const change of [{amount:1},{currency:'USD'},{reference:'other'},{status:'pending'},{metadata:{invoice_id:'other',installment_id:'part'}},{metadata:{invoice_id:'invoice',installment_id:'other'}}]) {
      expect(matchesAttempt({ ...tx,...change },attempt)).toBe(false);
    }
  });
  it('verifies the exact raw webhook bytes and rejects altered payloads', async () => {
    vi.stubGlobal('crypto',webcrypto);
    try {
      const raw = new TextEncoder().encode('{"event":"charge.success"}').buffer;
      const signature = createHmac('sha512','secret').update(new Uint8Array(raw)).digest('hex');
      expect(await validWebhookSignature('secret',raw,signature)).toBe(true);
      expect(await validWebhookSignature('different',raw,signature)).toBe(false);
      expect(await validWebhookSignature('secret',new TextEncoder().encode('{}').buffer,signature)).toBe(false);
      expect(await validWebhookSignature('secret',raw,'garbage')).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
});
