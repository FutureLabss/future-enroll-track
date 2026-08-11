import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';

export type FinanceRow = {
  month: string;
  revenue: number;
  revenue_cash: number;
  other_income_total: number;
  payroll_total: number;
  expenses_total: number;
  profit: number;
};

export type FilterMode = 'preset' | 'custom';

interface Params {
  mode: FilterMode;
  months: number;
  startDate?: Date;
  endDate?: Date;
}

export function useFinanceSummary({ mode, months, startDate, endDate }: Params) {
  const queryKey = mode === 'custom' && startDate && endDate
    ? ['finance-summary', 'custom', format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')]
    : ['finance-summary', 'preset', months];

  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey,
    queryFn: async () => {
      const args = mode === 'custom' && startDate && endDate
        ? { p_months: 12, p_start_date: format(startDate, 'yyyy-MM-dd'), p_end_date: format(endDate, 'yyyy-MM-dd') }
        : { p_months: months };

      const { data, error } = await supabase.rpc('get_finance_summary', args);
      if (error) throw new Error(error.message);

      return (data || []).map((r: any) => ({
        month: r.month,
        revenue: Number(r.revenue) || 0,
        revenue_cash: Number(r.revenue_cash) || 0,
        other_income_total: Number(r.other_income_total) || 0,
        payroll_total: Number(r.payroll_total) || 0,
        expenses_total: Number(r.expenses_total) || 0,
        profit: Number(r.profit) || 0,
      })) as FinanceRow[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const rows = useMemo(() => data || [], [data]);
  const error = queryError ? (queryError as Error).message : null;

  const totals = useMemo(() => rows.reduce(
    (acc, r) => {
      acc.revenue += r.revenue + r.other_income_total;
      acc.revenueCash += r.revenue_cash + r.other_income_total;
      acc.payroll += r.payroll_total;
      acc.expenses += r.expenses_total;
      acc.profit += r.profit;
      return acc;
    },
    { revenue: 0, revenueCash: 0, payroll: 0, expenses: 0, profit: 0 }
  ), [rows]);

  return { rows, loading, error, totals };
}
