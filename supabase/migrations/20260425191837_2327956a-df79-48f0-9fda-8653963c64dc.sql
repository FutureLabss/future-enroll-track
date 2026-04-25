-- Expenses table
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  vendor_name TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  payment_reference TEXT,
  notes TEXT,
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage expenses"
ON public.expenses
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Finance summary function: returns totals per month for the last N months.
-- Admins (and superadmin) can call it. Payroll is summed server-side so non-superadmin
-- admins see the aggregate without being able to query payroll_runs directly.
CREATE OR REPLACE FUNCTION public.get_finance_summary(p_months INT DEFAULT 12)
RETURNS TABLE (
  month DATE,
  revenue NUMERIC,
  other_income_total NUMERIC,
  payroll_total NUMERIC,
  expenses_total NUMERIC,
  profit NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can view finance summary';
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT date_trunc('month', (CURRENT_DATE - (n || ' months')::interval))::date AS month
    FROM generate_series(0, GREATEST(p_months, 1) - 1) n
  ),
  pay_rev AS (
    SELECT date_trunc('month', p.created_at)::date AS month,
           COALESCE(SUM(p.amount), 0) AS total
    FROM public.payments p
    GROUP BY 1
  ),
  oi AS (
    SELECT date_trunc('month', o.payment_date)::date AS month,
           COALESCE(SUM(o.amount), 0) AS total
    FROM public.other_income o
    GROUP BY 1
  ),
  pr AS (
    SELECT date_trunc('month', pr.pay_month)::date AS month,
           COALESCE(SUM(pr.amount), 0) AS total
    FROM public.payroll_runs pr
    WHERE pr.status = 'paid'
    GROUP BY 1
  ),
  ex AS (
    SELECT date_trunc('month', e.payment_date)::date AS month,
           COALESCE(SUM(e.amount), 0) AS total
    FROM public.expenses e
    GROUP BY 1
  )
  SELECT
    m.month,
    COALESCE(pay_rev.total, 0) AS revenue,
    COALESCE(oi.total, 0) AS other_income_total,
    COALESCE(pr.total, 0) AS payroll_total,
    COALESCE(ex.total, 0) AS expenses_total,
    (COALESCE(pay_rev.total, 0) + COALESCE(oi.total, 0))
      - COALESCE(pr.total, 0) - COALESCE(ex.total, 0) AS profit
  FROM months m
  LEFT JOIN pay_rev ON pay_rev.month = m.month
  LEFT JOIN oi ON oi.month = m.month
  LEFT JOIN pr ON pr.month = m.month
  LEFT JOIN ex ON ex.month = m.month
  ORDER BY m.month DESC;
END;
$$;