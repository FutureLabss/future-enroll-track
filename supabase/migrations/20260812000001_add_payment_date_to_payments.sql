-- `payments` had no date column besides `created_at` (row-insertion time) —
-- no way to record when a payment actually happened separately from when
-- staff got around to entering it. When a backlog of overdue installments
-- gets cleared in one sitting, everything in that sitting lands on that
-- day (17 installments with Jan-Mar due dates all landed on 2026-04-28
-- alone), which directly corrupts monthly revenue now that
-- get_finance_summary defaults to cash basis.
--
-- Adds an explicit, staff-editable `payment_date`, matching the pattern
-- other_income/expenses already use. RhemaHub's leg of both `rev` and
-- `rev_cash` now buckets by this instead of `created_at`. Everything else
-- in the function is unchanged from 20260811000001 — same signature, same
-- return type, so CREATE OR REPLACE is enough this time (no DROP needed).

ALTER TABLE public.payments ADD COLUMN payment_date date;

-- Backfill: created_at is the best available proxy for existing rows —
-- doesn't invent accuracy that isn't there, just preserves current
-- behaviour for historical data instead of defaulting it to "today".
UPDATE public.payments SET payment_date = created_at::date WHERE payment_date IS NULL;

ALTER TABLE public.payments ALTER COLUMN payment_date SET DEFAULT CURRENT_DATE;
ALTER TABLE public.payments ALTER COLUMN payment_date SET NOT NULL;

CREATE OR REPLACE FUNCTION public.get_finance_summary(p_months integer DEFAULT 12, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
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
    -- Due-date basis (unchanged) — the documented accrual view. See CLAUDE.md.
    SELECT date_trunc('month', paid_at)::date AS m,
           SUM(amount)                        AS total
    FROM (
      SELECT p.payment_date::timestamptz AS paid_at, p.amount
      FROM public.payments   p
      JOIN public.invoices   i  ON i.id  = p.invoice_id
      JOIN public.enrollments e ON e.id  = i.enrollment_id
      JOIN public.programs   pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
        AND i.status != 'cancelled'
        AND p.payment_date >= _start AND p.payment_date < _cut
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
    -- Payment-date basis (default view) — same shape as `rev`, FutureLabs leg
    -- keyed on paid_at instead of due_date. RhemaHub leg now uses the
    -- staff-editable payments.payment_date instead of created_at.
    SELECT date_trunc('month', paid_at)::date AS m,
           SUM(amount)                        AS total
    FROM (
      SELECT p.payment_date::timestamptz AS paid_at, p.amount
      FROM public.payments   p
      JOIN public.invoices   i  ON i.id  = p.invoice_id
      JOIN public.enrollments e ON e.id  = i.enrollment_id
      JOIN public.programs   pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
        AND i.status != 'cancelled'
        AND p.payment_date >= _start AND p.payment_date < _cut
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
