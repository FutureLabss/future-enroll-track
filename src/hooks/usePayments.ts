import { useQuery, QueryFunctionContext } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const PAYMENTS_ALL_KEY = ['payments-all'] as const;
export const PENDING_PAYMENTS_KEY = ['pending-payments'] as const;

// 15-second hard timeout merged with TanStack Query's own cancellation signal.
// Without this, a slow/hung DB query spins the loading indicator forever.
function withTimeout(signal: AbortSignal, ms = 15_000): AbortSignal {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(new Error(`Query timed out after ${ms}ms`)), ms);
  signal.addEventListener('abort', () => { clearTimeout(tid); controller.abort(signal.reason); });
  return controller.signal;
}

export async function fetchPaymentsAll({ signal }: QueryFunctionContext) {
  const s = withTimeout(signal);
  const [payRes, oiRes, invRes] = await Promise.all([
    supabase.from('payments')
      .select('*, invoices(invoice_number, enrollments(full_name, programs(program_name)))')
      .order('created_at', { ascending: false }).limit(100)
      .abortSignal(s),
    supabase.from('other_income').select('*').order('payment_date', { ascending: false }).limit(50)
      .abortSignal(s),
    supabase.from('invoices')
      .select('id, invoice_number, total_amount, status, created_at, enrollments(full_name, programs(program_name))')
      .order('created_at', { ascending: false }).limit(50)
      .abortSignal(s),
  ]);
  if (payRes.error) throw payRes.error;
  if (oiRes.error) throw oiRes.error;
  if (invRes.error) throw invRes.error;
  return [
    ...(payRes.data || []).map((p: any) => ({ ...p, _kind: 'tuition', _date: p.created_at })),
    ...(oiRes.data || []).map((o: any) => ({
      ...o, _kind: 'other', _date: o.payment_date,
      payment_reference: o.payment_reference || '—',
      invoices: { invoice_number: o.category, enrollments: { full_name: o.payer_name } },
    })),
    ...(invRes.data || []).map((inv: any) => ({
      id: `inv-${inv.id}`,
      _kind: 'invoice',
      _date: inv.created_at,
      created_at: inv.created_at,
      amount: inv.total_amount,
      payment_reference: inv.invoice_number,
      payment_method: inv.status,
      invoices: { invoice_number: inv.invoice_number, enrollments: inv.enrollments },
    })),
  ].sort((a: any, b: any) => new Date(b._date).getTime() - new Date(a._date).getTime());
}

export async function fetchPendingPayments({ signal }: QueryFunctionContext) {
  const s = withTimeout(signal);
  const { data, error } = await supabase
    .from('pending_payments')
    .select('*, invoices(invoice_number, enrollments(full_name, programs(program_name)))')
    .order('created_at', { ascending: false })
    .abortSignal(s);
  if (error) throw error;
  return data || [];
}

export function usePaymentsAll() {
  return useQuery({
    queryKey: PAYMENTS_ALL_KEY,
    queryFn: fetchPaymentsAll,
    staleTime: 30_000,
  });
}

export function usePendingPayments() {
  return useQuery({
    queryKey: PENDING_PAYMENTS_KEY,
    queryFn: fetchPendingPayments,
    staleTime: 30_000,
  });
}
