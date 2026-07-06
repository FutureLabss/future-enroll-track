-- Performance audit finding B7: get_finance_summary and
-- get_enrollment_performance aggregated the hub's entire history on every
-- call regardless of the requested window. Each CTE now bounds by the
-- requested range before aggregating. Results are unchanged: months outside
-- the window were discarded by the final join anyway.

CREATE OR REPLACE FUNCTION public.get_finance_summary(p_months integer DEFAULT 12, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(month date, revenue numeric, other_income_total numeric, payroll_total numeric, expenses_total numeric, profit numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _start date;
  _end   date;
  _cut   date; -- exclusive upper bound (first day after the window)
  _hub   uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only admins can view finance summary';
  END IF;

  _hub := public.get_my_hub_id();

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    _start := date_trunc('month', p_start_date)::date;
    _end   := date_trunc('month', p_end_date)::date;
  ELSE
    _end   := date_trunc('month', CURRENT_DATE)::date;
    _start := (date_trunc('month', CURRENT_DATE) - ((GREATEST(p_months, 1) - 1) || ' months')::interval)::date;
  END IF;
  _cut := (_end + interval '1 month')::date;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(_start, _end, '1 month'::interval)::date AS m
  ),
  rev AS (
    SELECT date_trunc('month', paid_at)::date AS m,
           SUM(amount)                        AS total
    FROM (
      -- RhemaHub: direct payments; exclude cancelled invoices
      SELECT p.created_at AS paid_at, p.amount
      FROM public.payments   p
      JOIN public.invoices   i  ON i.id  = p.invoice_id
      JOIN public.enrollments e ON e.id  = i.enrollment_id
      JOIN public.programs   pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
        AND i.status != 'cancelled'
        AND p.created_at >= _start AND p.created_at < _cut
      UNION ALL
      -- FutureLabs: installments by due_date; exclude cancelled invoices
      SELECT inst.due_date::timestamptz AS paid_at, inst.amount
      FROM public.installments inst
      JOIN public.invoices      i  ON i.id  = inst.invoice_id
      JOIN public.enrollments   e  ON e.id  = i.enrollment_id
      JOIN public.programs      pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
        AND inst.status = 'paid'
        AND i.status != 'cancelled'
        AND inst.due_date >= _start AND inst.due_date < _cut
    ) src
    GROUP BY 1
  ),
  oi AS (
    SELECT date_trunc('month', o.payment_date)::date AS m,
           COALESCE(SUM(o.amount), 0)               AS total
    FROM public.other_income o
    WHERE o.hub_id = _hub
      AND o.payment_date >= _start AND o.payment_date < _cut
    GROUP BY 1
  ),
  pr AS (
    -- Use pay_month (which month salary is for), not paid_at (when admin clicked Mark Paid).
    -- paid_at is often weeks later and causes payroll to land in the wrong month.
    SELECT p.pay_month                       AS m,
           COALESCE(SUM(p.amount), 0)        AS total
    FROM public.payroll_runs p
    JOIN public.staff        s ON s.id = p.staff_id
    WHERE s.hub_id = _hub
      AND p.status = 'paid'
      AND p.pay_month >= _start AND p.pay_month <= _end
    GROUP BY 1
  ),
  ex AS (
    SELECT date_trunc('month', e.payment_date)::date AS m,
           COALESCE(SUM(e.amount), 0)               AS total
    FROM public.expenses e
    WHERE e.hub_id = _hub
      AND e.payment_date >= _start AND e.payment_date < _cut
    GROUP BY 1
  )
  SELECT months.m,
         COALESCE(rev.total, 0),
         COALESCE(oi.total,  0),
         COALESCE(pr.total,  0),
         COALESCE(ex.total,  0),
         (COALESCE(rev.total, 0) + COALESCE(oi.total, 0))
           - COALESCE(pr.total, 0)
           - COALESCE(ex.total, 0)
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
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _start date;
  _end   date;
  _cut   date;
  _hub   uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only admins can view enrollment performance';
  END IF;

  _hub := public.get_my_hub_id();

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    _start := date_trunc('month', p_start_date)::date;
    _end   := date_trunc('month', p_end_date)::date;
  ELSE
    _end   := date_trunc('month', CURRENT_DATE)::date;
    _start := (date_trunc('month', CURRENT_DATE) - ((GREATEST(p_months, 1) - 1) || ' months')::interval)::date;
  END IF;
  _cut := (_end + interval '1 month')::date;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(_start, _end, '1 month'::interval)::date AS m
  ),
  first_payments AS (
    -- Upper bound only: dropping rows after the window can't change which
    -- in-window month a MIN lands in. A lower bound here could shift an
    -- earlier first payment into the window, so it stays outside.
    SELECT i.enrollment_id, MIN(inst.due_date)::date AS first_due
    FROM public.invoices i
    JOIN public.installments inst ON inst.invoice_id = i.id AND inst.status = 'paid'
    WHERE inst.due_date < _cut
    GROUP BY i.enrollment_id
  ),
  actual AS (
    SELECT date_trunc('month', fp.first_due)::date AS m,
           COUNT(*)::int AS cnt
    FROM public.enrollments e
    JOIN public.programs pr ON pr.id = e.program_id
    JOIN first_payments fp  ON fp.enrollment_id = e.id
    WHERE pr.hub_id = _hub
      AND e.enrollment_status NOT IN ('cancelled', 'withdrawn')
      AND fp.first_due >= _start
    GROUP BY 1
  ),
  tgt AS (
    SELECT t.target_month AS m, t.target_count AS cnt
    FROM public.enrollment_targets t
    WHERE t.hub_id = _hub
      AND t.target_month >= _start AND t.target_month <= _end
  )
  SELECT months.m,
         COALESCE(tgt.cnt, 0)::int,
         COALESCE(actual.cnt, 0)::int,
         (COALESCE(actual.cnt, 0) - COALESCE(tgt.cnt, 0))::int,
         CASE WHEN COALESCE(tgt.cnt, 0) > 0
              THEN ROUND((COALESCE(actual.cnt, 0)::numeric / tgt.cnt::numeric) * 100, 1)
              ELSE NULL END
  FROM months
  LEFT JOIN actual ON actual.m = months.m
  LEFT JOIN tgt    ON tgt.m   = months.m
  ORDER BY months.m DESC;
END;
$function$;
