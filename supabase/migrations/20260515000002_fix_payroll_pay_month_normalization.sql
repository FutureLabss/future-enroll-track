-- pay_month was seeded as end-of-month (2026-01-31) but the UI sends first-of-month.
-- Normalize all existing rows to first-of-month so .eq() filters match.
UPDATE public.payroll_runs
SET pay_month = date_trunc('month', pay_month)::date
WHERE pay_month != date_trunc('month', pay_month)::date;
