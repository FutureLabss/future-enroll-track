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
      // Use installments.paid_at — same source the get_finance_summary RPC uses for revenue
      supabase
        .from('installments')
        .select('id, amount, paid_at, due_date, invoices(invoice_number, enrollments(full_name, email, programs(program_name)))')
        .eq('status', 'paid')
        .gte('paid_at', month)
        .lt('paid_at', end)
        .order('paid_at', { ascending: false }),
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
      setPayments(p.data || []);
      setOtherIncome(o.data || []);
      setExpenses(e.data || []);
      setPayroll(r.data || []);
      setLoading(false);
    });
  }, [month]);

  return { payments, otherIncome, expenses, payroll, loading };
}
