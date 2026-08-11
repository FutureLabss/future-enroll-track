import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface MonthDetail {
  payments: any[];
  otherIncome: any[];
  expenses: any[];
  payroll: any[];
  loading: boolean;
}

// month is ISO first-of-month: "2026-05-01"
// basis: 'due' (default) matches the dashboard's due-date revenue bucketing;
// 'paid' matches the opt-in cash-basis (revenue_cash) view — see get_finance_summary.
export function useMonthDetail(month: string | null, basis: 'due' | 'paid' = 'due'): MonthDetail {
  const { data, isLoading: loading } = useQuery({
    queryKey: ['month-detail', month, basis],
    queryFn: async () => {
      const nextMonth = new Date(month!);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const end = nextMonth.toISOString().slice(0, 10);
      const instDateCol = basis === 'paid' ? 'paid_at' : 'due_date';

      const [paymentsResult, otherIncomeRes, expensesRes, payrollRes] = await Promise.all([
        Promise.all([
          supabase
            .from('installments')
            .select('id, amount, due_date, paid_at, invoices(invoice_number, enrollments(full_name, email, programs(program_name)))')
            .eq('status', 'paid')
            .gte(instDateCol, month!)
            .lt(instDateCol, end)
            .order(instDateCol, { ascending: false }),
          supabase
            .from('payments')
            .select('id, amount, created_at, payment_method, payment_reference, invoices(invoice_number, enrollments(full_name, email, programs(program_name)))')
            .gte('created_at', month!)
            .lt('created_at', end)
            .order('created_at', { ascending: false }),
        ]).then(([instRes, payRes]) => ({
          data: [
            ...(instRes.data || []).map((r: any) => ({ ...r, _source: 'installment', _date: r[instDateCol] })),
            ...(payRes.data || []).map((r: any) => ({ ...r, _source: 'payment', _date: r.created_at })),
          ].sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime()),
        })),
        supabase
          .from('other_income')
          .select('id, category, payer_name, amount, payment_date, payment_method, payment_reference, notes')
          .gte('payment_date', month!)
          .lt('payment_date', end)
          .order('payment_date', { ascending: false }),
        supabase
          .from('expenses')
          .select('id, category, vendor_name, amount, payment_date, payment_method, payment_reference, notes')
          .gte('payment_date', month!)
          .lt('payment_date', end)
          .order('payment_date', { ascending: false }),
        supabase
          .from('payroll_runs')
          .select('id, amount, status, notes, paid_at, created_at, staff(full_name, role_title)')
          .eq('pay_month', month!)
          .order('created_at', { ascending: false }),
      ]);

      return {
        payments: (paymentsResult as any).data || [],
        otherIncome: otherIncomeRes.data || [],
        expenses: expensesRes.data || [],
        payroll: payrollRes.data || [],
      };
    },
    enabled: Boolean(month),
    staleTime: 1000 * 60 * 5,
  });

  return {
    payments: data?.payments ?? [],
    otherIncome: data?.otherIncome ?? [],
    expenses: data?.expenses ?? [],
    payroll: data?.payroll ?? [],
    loading,
  };
}
