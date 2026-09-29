-- Add an opt-in cash-basis revenue column to get_finance_summary alongside the
-- existing due-date-basis `revenue`. FutureLabs revenue is bucketed by
-- installments.due_date by design (see CLAUDE.md / 20260518000025 — paid_at is
-- unreliable for backfilled data), but that means a payment approved today can
-- land months back in the dashboard. `revenue_cash` buckets the same FutureLabs
-- installments by paid_at instead, purely additive: `revenue`/`profit` and every
-- other column are unchanged. RhemaHub's leg is already payments.created_at
-- (cash-basis), so it's reused unchanged in both CTEs.
--
-- Return type is changing (new output column), so CREATE OR REPLACE isn't
-- enough — the function must be dropped first.
DROP FUNCTION IF EXISTS public.get_finance_summary(integer, date, date);

CREATE FUNCTION public.get_finance_summary(p_months integer DEFAULT 12, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(month date, revenue numeric, revenue_cash numeric, other_income_total numeric, payroll_total numeric, expenses_total numeric, profit numeric)
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
    -- Due-date basis (unchanged) — the documented default. See CLAUDE.md.
    SELECT date_trunc('month', paid_at)::date AS m,
           SUM(amount)                        AS total
    FROM (
      SELECT p.created_at AS paid_at, p.amount
      FROM public.payments   p
      JOIN public.invoices   i  ON i.id  = p.invoice_id
      JOIN public.enrollments e ON e.id  = i.enrollment_id
      JOIN public.programs   pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
        AND i.status != 'cancelled'
        AND p.created_at >= _start AND p.created_at < _cut
      UNION ALL
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
  rev_cash AS (
    -- Payment-date basis (new) — same shape as `rev`, FutureLabs leg keyed on
    -- paid_at instead of due_date. RhemaHub leg is identical to `rev` since
    -- payments.created_at is already a payment date.
    SELECT date_trunc('month', paid_at)::date AS m,
           SUM(amount)                        AS total
    FROM (
      SELECT p.created_at AS paid_at, p.amount
      FROM public.payments   p
      JOIN public.invoices   i  ON i.id  = p.invoice_id
      JOIN public.enrollments e ON e.id  = i.enrollment_id
      JOIN public.programs   pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
        AND i.status != 'cancelled'
        AND p.created_at >= _start AND p.created_at < _cut
      UNION ALL
      SELECT inst.paid_at, inst.amount
      FROM public.installments inst
      JOIN public.invoices      i  ON i.id  = inst.invoice_id
      JOIN public.enrollments   e  ON e.id  = i.enrollment_id
      JOIN public.programs      pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
        AND inst.status = 'paid'
        AND i.status != 'cancelled'
        AND inst.paid_at >= _start AND inst.paid_at < _cut
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
         COALESCE(rev_cash.total, 0),
         COALESCE(oi.total,  0),
         COALESCE(pr.total,  0),
         COALESCE(ex.total,  0),
         (COALESCE(rev.total, 0) + COALESCE(oi.total, 0))
           - COALESCE(pr.total, 0)
           - COALESCE(ex.total, 0)
  FROM months
  LEFT JOIN rev      ON rev.m      = months.m
  LEFT JOIN rev_cash ON rev_cash.m = months.m
  LEFT JOIN oi       ON oi.m       = months.m
  LEFT JOIN pr       ON pr.m       = months.m
  LEFT JOIN ex       ON ex.m       = months.m
  ORDER BY months.m DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_finance_summary(integer, date, date) TO authenticated;
