UPDATE public.payroll_runs
SET pay_month = (pay_month + interval '1 month')::date;
