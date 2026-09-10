-- get_finance_summary's cash-basis leg now prefers the bank's timestamp where one
-- has been reconciled, falling back to the existing basis when paid_at_actual is
-- NULL (which is every historical row until the statement import is matched).
-- Same signature and return type as 20260812000001, so REPLACE is enough.

-- ---------------------------------------------------------------------------
-- 3. Revenue buckets on the actual date when we have one
-- ---------------------------------------------------------------------------
-- Identical to 20260812000001 except the two rev_cash legs, which now prefer
-- paid_at_actual and fall back to the previous basis. Same signature and return
-- type, so CREATE OR REPLACE is enough.
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
    -- Due-date basis (unchanged) - the documented accrual view. See CLAUDE.md.
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
    -- Payment-date basis (the dashboard default). Prefers the bank's timestamp
    -- where one has been matched; falls back to the staff-entered date, which is
    -- all that exists for historical rows.
    SELECT date_trunc('month', paid_at)::date AS m,
           SUM(amount)                        AS total
    FROM (
      SELECT COALESCE(p.paid_at_actual, p.payment_date::timestamptz) AS paid_at, p.amount
      FROM public.payments   p
      JOIN public.invoices   i  ON i.id  = p.invoice_id
      JOIN public.enrollments e ON e.id  = i.enrollment_id
      JOIN public.programs   pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
        AND i.status != 'cancelled'
        AND COALESCE(p.paid_at_actual, p.payment_date::timestamptz) >= _start
        AND COALESCE(p.paid_at_actual, p.payment_date::timestamptz) <  _cut
      UNION ALL
      SELECT COALESCE(inst.paid_at_actual, inst.paid_at) AS paid_at, inst.amount
      FROM public.installments inst
      JOIN public.invoices      i  ON i.id  = inst.invoice_id
      JOIN public.enrollments   e  ON e.id  = i.enrollment_id
      JOIN public.programs      pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
        AND inst.status = 'paid'
        AND i.status != 'cancelled'
        AND COALESCE(inst.paid_at_actual, inst.paid_at) >= _start
        AND COALESCE(inst.paid_at_actual, inst.paid_at) <  _cut
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
