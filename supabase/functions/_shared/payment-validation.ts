export interface PaystackTransaction {
  reference: string; status: string; amount: number; currency: string; paid_at: string;
  metadata: { invoice_id?: string; enrollment_id?: string; installment_id?: string | null };
}
export interface PaymentAttempt {
  reference: string; amount: number | string; currency: string; invoice_id: string; installment_id: string | null;
}
export function matchesAttempt(tx: PaystackTransaction, attempt: PaymentAttempt) {
  return tx.status === 'success' && tx.reference === attempt.reference && tx.currency === attempt.currency
    && Number.isSafeInteger(tx.amount) && tx.amount === Math.round(Number(attempt.amount) * 100)
    && tx.metadata?.invoice_id === attempt.invoice_id
    && (tx.metadata?.installment_id || null) === attempt.installment_id;
}
export async function validWebhookSignature(secret: string, raw: ArrayBuffer, signature: string) {
  if (!/^[a-f0-9]{128}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/../g)!, byte => parseInt(byte, 16));
  return crypto.subtle.verify('HMAC', key, bytes, raw);
}
