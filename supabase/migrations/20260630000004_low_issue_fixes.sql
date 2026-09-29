-- 1. Add STABLE marker to get_finance_summary so Postgres can cache
--    results for repeated calls within the same transaction.
ALTER FUNCTION public.get_finance_summary(integer, date, date) STABLE;

-- 2. Make the two indexes from the original migrations idempotent so
--    fresh DB restores don't error when replaying migration history.
CREATE INDEX IF NOT EXISTS idx_payroll_runs_month ON public.payroll_runs(pay_month);
CREATE INDEX IF NOT EXISTS idx_other_income_date  ON public.other_income(payment_date);
