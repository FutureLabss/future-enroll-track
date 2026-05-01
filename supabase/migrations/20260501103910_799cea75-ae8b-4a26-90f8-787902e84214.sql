CREATE OR REPLACE FUNCTION public.get_finance_summary(p_months integer DEFAULT 12, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(month date, revenue numeric, other_income_total numeric, payroll_total numeric, expenses_total numeric, profit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _start date;
  _end date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can view finance summary';
  END IF;

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    _start := date_trunc('month', p_start_date)::date;
    _end := date_trunc('month', p_end_date)::date;
  ELSE
    _end := date_trunc('month', CURRENT_DATE)::date;
    _start := (date_trunc('month', CURRENT_DATE) - ((GREATEST(p_months, 1) - 1) || ' months')::interval)::date;
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(_start, _end, '1 month'::interval)::date AS month
  ),
  -- Revenue is attributed to the month the invoice/enrollment was first DUE
  -- (earliest installment due date, fallback to invoice creation, fallback to enrollment creation)
  enrollment_due AS (
    SELECT
      e.id AS enrollment_id,
      e.amount_paid,
      date_trunc(
        'month',
        COALESCE(
          (SELECT MIN(i2.due_date)
             FROM public.installments i2
             JOIN public.invoices inv2 ON inv2.id = i2.invoice_id
            WHERE inv2.enrollment_id = e.id),
          (SELECT MIN(inv3.created_at)::date
             FROM public.invoices inv3
            WHERE inv3.enrollment_id = e.id),
          e.created_at::date
        )
      )::date AS month
    FROM public.enrollments e
    WHERE e.amount_paid > 0
  ),
  rev AS (
    SELECT month, COALESCE(SUM(amount_paid), 0) AS total
    FROM enrollment_due
    GROUP BY month
  ),
  oi AS (
    SELECT date_trunc('month', o.payment_date)::date AS month,
           COALESCE(SUM(o.amount), 0) AS total
    FROM public.other_income o
    GROUP BY 1
  ),
  pr AS (
    -- pay_month is stored as the last day of the payroll month; add 1 day before truncating
    -- so a value like 2026-03-31 attributes correctly to March (some legacy rows may sit on
    -- the last day of the prior month).
    SELECT date_trunc('month', (pr.pay_month + INTERVAL '1 day'))::date AS month,
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
    COALESCE(rev.total, 0) AS revenue,
    COALESCE(oi.total, 0) AS other_income_total,
    COALESCE(pr.total, 0) AS payroll_total,
    COALESCE(ex.total, 0) AS expenses_total,
    (COALESCE(rev.total, 0) + COALESCE(oi.total, 0))
      - COALESCE(pr.total, 0) - COALESCE(ex.total, 0) AS profit
  FROM months m
  LEFT JOIN rev ON rev.month = m.month
  LEFT JOIN oi ON oi.month = m.month
  LEFT JOIN pr ON pr.month = m.month
  LEFT JOIN ex ON ex.month = m.month
  ORDER BY m.month DESC;
END;
$function$;