-- Admin: cascade-delete an enrollment and all related data
CREATE OR REPLACE FUNCTION public.admin_delete_enrollment(p_enrollment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _full_name text;
  _email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can delete enrollments';
  END IF;

  SELECT full_name, email INTO _full_name, _email
  FROM public.enrollments WHERE id = p_enrollment_id;

  IF _full_name IS NULL THEN
    RAISE EXCEPTION 'Enrollment not found';
  END IF;

  DELETE FROM public.payments
    WHERE invoice_id IN (SELECT id FROM public.invoices WHERE enrollment_id = p_enrollment_id);
  DELETE FROM public.installments
    WHERE invoice_id IN (SELECT id FROM public.invoices WHERE enrollment_id = p_enrollment_id);
  DELETE FROM public.invoices WHERE enrollment_id = p_enrollment_id;
  DELETE FROM public.field_values WHERE enrollment_id = p_enrollment_id;
  DELETE FROM public.notifications WHERE enrollment_id = p_enrollment_id;
  DELETE FROM public.enrollments WHERE id = p_enrollment_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'delete', 'enrollment', p_enrollment_id,
          jsonb_build_object('full_name', _full_name, 'email', _email));
END;
$$;

-- Replace finance summary: revenue from enrollments.amount_paid; supports date range
DROP FUNCTION IF EXISTS public.get_finance_summary(integer);
DROP FUNCTION IF EXISTS public.get_finance_summary(integer, date, date);

CREATE OR REPLACE FUNCTION public.get_finance_summary(
  p_months integer DEFAULT 12,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE(
  month date,
  revenue numeric,
  other_income_total numeric,
  payroll_total numeric,
  expenses_total numeric,
  profit numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  rev AS (
    -- Use enrollment.amount_paid keyed by last/first payment date or updated_at
    SELECT date_trunc('month',
             COALESCE(e.last_payment_date, e.first_payment_date, e.updated_at)
           )::date AS month,
           COALESCE(SUM(e.amount_paid), 0) AS total
    FROM public.enrollments e
    WHERE e.amount_paid > 0
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
$$;