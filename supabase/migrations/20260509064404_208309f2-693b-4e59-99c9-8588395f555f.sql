
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
    SELECT generate_series(_start, _end, '1 month'::interval)::date AS m
  ),
  rev AS (
    SELECT date_trunc('month', e.first_payment_date::date)::date AS m,
           COALESCE(SUM(e.amount_paid), 0) AS total
    FROM public.enrollments e
    WHERE e.amount_paid > 0 AND e.first_payment_date IS NOT NULL
    GROUP BY 1
  ),
  oi AS (
    SELECT date_trunc('month', o.payment_date)::date AS m,
           COALESCE(SUM(o.amount), 0) AS total
    FROM public.other_income o
    GROUP BY 1
  ),
  pr AS (
    SELECT date_trunc('month', (pr.pay_month + INTERVAL '1 day'))::date AS m,
           COALESCE(SUM(pr.amount), 0) AS total
    FROM public.payroll_runs pr
    WHERE pr.status = 'paid'
    GROUP BY 1
  ),
  ex AS (
    SELECT date_trunc('month', e.payment_date)::date AS m,
           COALESCE(SUM(e.amount), 0) AS total
    FROM public.expenses e
    GROUP BY 1
  )
  SELECT months.m,
         COALESCE(rev.total, 0),
         COALESCE(oi.total, 0),
         COALESCE(pr.total, 0),
         COALESCE(ex.total, 0),
         (COALESCE(rev.total, 0) + COALESCE(oi.total, 0)) - COALESCE(pr.total, 0) - COALESCE(ex.total, 0)
  FROM months
  LEFT JOIN rev ON rev.m = months.m
  LEFT JOIN oi  ON oi.m  = months.m
  LEFT JOIN pr  ON pr.m  = months.m
  LEFT JOIN ex  ON ex.m  = months.m
  ORDER BY months.m DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_enrollment_performance(p_months integer DEFAULT 12, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(month date, target_count integer, actual_count integer, variance integer, achievement_pct numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _start date;
  _end date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can view enrollment performance';
  END IF;

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    _start := date_trunc('month', p_start_date)::date;
    _end := date_trunc('month', p_end_date)::date;
  ELSE
    _end := date_trunc('month', CURRENT_DATE)::date;
    _start := (date_trunc('month', CURRENT_DATE) - ((GREATEST(p_months,1)-1) || ' months')::interval)::date;
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(_start, _end, '1 month'::interval)::date AS m
  ),
  actual AS (
    SELECT date_trunc('month', e.first_payment_date::date)::date AS m,
           COUNT(*)::int AS cnt
    FROM public.enrollments e
    WHERE e.first_payment_date IS NOT NULL
    GROUP BY 1
  ),
  tgt AS (
    SELECT t.target_month AS m, t.target_count AS cnt FROM public.enrollment_targets t
  )
  SELECT months.m,
         COALESCE(tgt.cnt, 0)::int,
         COALESCE(actual.cnt, 0)::int,
         (COALESCE(actual.cnt,0) - COALESCE(tgt.cnt,0))::int,
         CASE WHEN COALESCE(tgt.cnt,0) > 0
              THEN ROUND((COALESCE(actual.cnt,0)::numeric / tgt.cnt::numeric) * 100, 1)
              ELSE NULL END
  FROM months
  LEFT JOIN actual ON actual.m = months.m
  LEFT JOIN tgt ON tgt.m = months.m
  ORDER BY months.m DESC;
END;
$function$;
