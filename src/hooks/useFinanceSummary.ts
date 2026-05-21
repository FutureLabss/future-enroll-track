import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';

export type FinanceRow = {
  month: string;
  revenue: number;
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
  const [rows, setRows] = useState<FinanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const args =
      mode === 'custom' && startDate && endDate
        ? { p_months: 12, p_start_date: format(startDate, 'yyyy-MM-dd'), p_end_date: format(endDate, 'yyyy-MM-dd') }
        : { p_months: months };

    supabase.rpc('get_finance_summary', args).then(({ data, error: err }) => {
      if (!active) return;
      if (err) {
        setError(err.message);
        setRows([]);
      } else {
        setRows(
          (data || []).map((r: any) => ({
            month: r.month,
            revenue: Number(r.revenue) || 0,
            other_income_total: Number(r.other_income_total) || 0,
            payroll_total: Number(r.payroll_total) || 0,
            expenses_total: Number(r.expenses_total) || 0,
            profit: Number(r.profit) || 0,
          }))
        );
      }
      setLoading(false);
    });

    return () => { active = false; };
  }, [mode, months, startDate, endDate]);

  const totals = rows.reduce(
    (acc, r) => {
      acc.revenue += r.revenue + r.other_income_total;
      acc.payroll += r.payroll_total;
      acc.expenses += r.expenses_total;
      acc.profit += r.profit;
      return acc;
    },
    { revenue: 0, payroll: 0, expenses: 0, profit: 0 }
  );

  return { rows, loading, error, totals };
}
