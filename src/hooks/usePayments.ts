import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const PAYMENTS_ALL_KEY = ['payments-all'] as const;
export const PENDING_PAYMENTS_KEY = ['pending-payments'] as const;

export async function fetchPaymentsAll() {
  const [payRes, oiRes, invRes] = await Promise.all([
    supabase.from('payments')
      .select('*, invoices(invoice_number, enrollments(full_name, programs(program_name)))')
      .order('created_at', { ascending: false }).limit(100),
    supabase.from('other_income').select('*').order('payment_date', { ascending: false }).limit(50),
    supabase.from('invoices')
      .select('id, invoice_number, total_amount, status, created_at, enrollments(full_name, programs(program_name))')
      .order('created_at', { ascending: false }).limit(50),
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

export async function fetchPendingPayments() {
  const { data, error } = await supabase
    .from('pending_payments')
    .select('*, invoices(invoice_number, enrollments(full_name, programs(program_name)))')
    .order('created_at', { ascending: false });
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
