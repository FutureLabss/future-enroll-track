import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { QueryFunctionContext } from '@tanstack/react-query';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from } }));
import { fetchPendingPayments, PENDING_PAYMENTS_KEY } from '@/hooks/usePayments';

function builder(result: { data: unknown[] | null; error: unknown }) {
  return { select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockResolvedValue(result) };
}
const context = () => ({ queryKey: PENDING_PAYMENTS_KEY, signal: new AbortController().signal } as QueryFunctionContext);
beforeEach(() => { from.mockReset(); vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('pending payment lookup without an invoice foreign key', () => {
  it('loads receipts directly and resolves each invoice separately without duplicating receipt rows', async () => {
    const receipts = builder({ data: [{ id: 'receipt-1', invoice_id: 'invoice-1' }, { id: 'receipt-2', invoice_id: 'invoice-1' }], error: null });
    const invoice = { id: 'invoice-1', invoice_number: 'INV-1', enrollments: { full_name: 'Applicant', registration_flow_version: 2 } };
    const invoices = builder({ data: [invoice], error: null });
    from.mockImplementation(table => table === 'pending_payments' ? receipts : invoices);
    const result = await fetchPendingPayments(context());
    expect(receipts.select).toHaveBeenCalledWith('*');
    expect(invoices.in).toHaveBeenCalledWith('id', ['invoice-1']);
    expect(result).toEqual([{ id: 'receipt-1', invoice_id: 'invoice-1', invoices: invoice }, { id: 'receipt-2', invoice_id: 'invoice-1', invoices: invoice }]);
  });
  it('returns an empty list only when the receipt query succeeds without rows', async () => {
    from.mockReturnValue(builder({ data: [], error: null }));
    expect(await fetchPendingPayments(context())).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });
  it('propagates receipt and invoice failures rather than reporting no submissions', async () => {
    const error = { message: 'Database request failed' };
    from.mockReturnValue(builder({ data: null, error }));
    await expect(fetchPendingPayments(context())).rejects.toEqual(error);
    from.mockImplementation(table => builder(table === 'pending_payments' ? { data: [{ id: 'receipt-1', invoice_id: 'invoice-1' }], error: null } : { data: null, error }));
    await expect(fetchPendingPayments(context())).rejects.toEqual(error);
  });
  it('keeps receipts visible when their invoice is unavailable', async () => {
    from.mockImplementation(table => builder({ data: table === 'pending_payments' ? [{ id: 'receipt-1', invoice_id: 'missing' }] : [], error: null }));
    expect(await fetchPendingPayments(context())).toEqual([{ id: 'receipt-1', invoice_id: 'missing', invoices: null }]);
  });
});
