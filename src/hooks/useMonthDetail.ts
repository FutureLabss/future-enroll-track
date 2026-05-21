import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface MonthDetail {
  payments: any[];
  otherIncome: any[];
  expenses: any[];
  payroll: any[];
  loading: boolean;
}

// month is ISO first-of-month: "2026-05-01"
export function useMonthDetail(month: string | null): MonthDetail {
  const [payments, setPayments] = useState<any[]>([]);
  const [otherIncome, setOtherIncome] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!month) return;
    setLoading(true);

    // end = first day of the following month
    const nextMonth = new Date(month);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const end = nextMonth.toISOString().slice(0, 10);

    Promise.all([
      // Mirror get_finance_summary rev UNION ALL:
      // leg 1 — installments bucketed by due_date (FutureLabs path)
      // leg 2 — payments bucketed by created_at (RhemaHub path)
      // Both are fetched and merged client-side.
      Promise.all([
        supabase
          .from('installments')
          .select('id, amount, due_date, paid_at, invoices(invoice_number, enrollments(full_name, email, programs(program_name)))')
          .eq('status', 'paid')
          .gte('due_date', month)
          .lt('due_date', end)
          .order('due_date', { ascending: false }),
        supabase
          .from('payments')
          .select('id, amount, created_at, payment_method, payment_reference, invoices(invoice_number, enrollments(full_name, email, programs(program_name)))')
          .gte('created_at', month)
          .lt('created_at', end)
          .order('created_at', { ascending: false }),
      ]).then(([instRes, payRes]) => ({
        data: [
          ...(instRes.data || []).map((r: any) => ({ ...r, _source: 'installment', _date: r.due_date })),
          ...(payRes.data || []).map((r: any) => ({ ...r, _source: 'payment', _date: r.created_at })),
        ].sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime()),
      })),
      supabase
        .from('other_income')
        .select('id, category, payer_name, amount, payment_date, payment_method, payment_reference, notes')
        .gte('payment_date', month)
        .lt('payment_date', end)
        .order('payment_date', { ascending: false }),
      supabase
        .from('expenses')
        .select('id, category, vendor_name, amount, payment_date, payment_method, payment_reference, notes')
        .gte('payment_date', month)
        .lt('payment_date', end)
        .order('payment_date', { ascending: false }),
      supabase
        .from('payroll_runs')
        .select('id, amount, status, notes, paid_at, created_at, staff(full_name, role_title)')
        .eq('pay_month', month)
        .order('created_at', { ascending: false }),
    ]).then(([p, o, e, r]) => {
      setPayments((p as any).data || []);
      setOtherIncome(o.data || []);
      setExpenses(e.data || []);
      setPayroll(r.data || []);
      setLoading(false);
    });
  }, [month]);

  return { payments, otherIncome, expenses, payroll, loading };
}
