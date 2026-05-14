-- FutureLabs tracks payments via installments; RhemaHub uses the payments table.
-- Both get_finance_summary and list_outstanding_invoices must sum from both sources.
-- Revenue = payments UNION paid installments per hub (no double-counting since hubs
-- use one system or the other for the same invoices).

-- ── 1. get_finance_summary: revenue = payments UNION paid installments ─────────
CREATE OR REPLACE FUNCTION public.get_finance_summary(
  p_months     int     DEFAULT 12,
  p_start_date date    DEFAULT NULL,
  p_end_date   date    DEFAULT NULL
)
RETURNS TABLE (
  month               date,
  revenue             numeric,
  other_income_total  numeric,
  payroll_total       numeric,
  expenses_total      numeric,
  profit              numeric
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _start date;
  _end   date;
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

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(_start, _end, '1 month'::interval)::date AS m
  ),
  rev AS (
    SELECT date_trunc('month', paid_at)::date AS m,
           SUM(amount)                        AS total
    FROM (
      SELECT p.created_at AS paid_at, p.amount
      FROM public.payments   p
      JOIN public.invoices   i  ON i.id  = p.invoice_id
      JOIN public.enrollments e ON e.id  = i.enrollment_id
      JOIN public.programs   pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
      UNION ALL
      SELECT inst.paid_at, inst.amount
      FROM public.installments inst
      JOIN public.invoices      i  ON i.id  = inst.invoice_id
      JOIN public.enrollments   e  ON e.id  = i.enrollment_id
      JOIN public.programs      pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
        AND inst.status  = 'paid'
        AND inst.paid_at IS NOT NULL
    ) src
    GROUP BY 1
  ),
  oi AS (
    SELECT date_trunc('month', o.payment_date)::date AS m,
           COALESCE(SUM(o.amount), 0)               AS total
    FROM public.other_income o
    WHERE o.hub_id = _hub
    GROUP BY 1
  ),
  pr AS (
    SELECT date_trunc('month', (p.pay_month + INTERVAL '1 day'))::date AS m,
           COALESCE(SUM(p.amount), 0)                                  AS total
    FROM public.payroll_runs p
    JOIN public.staff        s ON s.id = p.staff_id
    WHERE s.hub_id = _hub AND p.status = 'paid'
    GROUP BY 1
  ),
  ex AS (
    SELECT date_trunc('month', e.payment_date)::date AS m,
           COALESCE(SUM(e.amount), 0)               AS total
    FROM public.expenses e
    WHERE e.hub_id = _hub
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
$$;

GRANT EXECUTE ON FUNCTION public.get_finance_summary(int, date, date) TO authenticated;

-- ── 2. list_outstanding_invoices: amount_paid = payments + paid installments ───
CREATE OR REPLACE FUNCTION public.list_outstanding_invoices(p_only_overdue boolean DEFAULT false)
RETURNS TABLE (
  invoice_id            uuid,
  invoice_number        text,
  enrollment_id         uuid,
  full_name             text,
  email                 text,
  phone                 text,
  program_name          text,
  cohort_label          text,
  total_amount          numeric,
  amount_paid           numeric,
  outstanding           numeric,
  next_due_date         date,
  earliest_overdue_date date,
  days_overdue          integer,
  is_overdue            boolean,
  invoice_status        text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _hub uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only admins can view outstanding invoices';
  END IF;

  _hub := public.get_my_hub_id();

  RETURN QUERY
  WITH all_paid AS (
    SELECT p.invoice_id, p.amount AS paid_amt
    FROM public.payments p
    UNION ALL
    SELECT inst.invoice_id, inst.amount AS paid_amt
    FROM public.installments inst
    WHERE inst.status = 'paid'
  ),
  pay_agg AS (
    SELECT invoice_id, SUM(paid_amt) AS paid_amt
    FROM all_paid
    GROUP BY invoice_id
  ),
  inst_agg AS (
    SELECT i.invoice_id,
           MIN(CASE WHEN i.status = 'pending' THEN i.due_date END)                               AS next_due,
           MIN(CASE WHEN i.status = 'pending' AND i.due_date < CURRENT_DATE THEN i.due_date END) AS earliest_overdue
    FROM public.installments i
    GROUP BY i.invoice_id
  )
  SELECT
    inv.id,
    inv.invoice_number,
    e.id,
    e.full_name,
    e.email,
    e.phone,
    pr.program_name,
    c.cohort_label,
    inv.total_amount,
    COALESCE(pa.paid_amt, 0)::numeric,
    GREATEST(inv.total_amount - COALESCE(pa.paid_amt, 0), 0)::numeric,
    ia.next_due,
    ia.earliest_overdue,
    CASE WHEN ia.earliest_overdue IS NOT NULL
         THEN (CURRENT_DATE - ia.earliest_overdue)::integer
         ELSE 0 END,
    (ia.earliest_overdue IS NOT NULL OR inv.status = 'overdue'),
    inv.status::text
  FROM public.invoices inv
  JOIN public.enrollments e   ON e.id  = inv.enrollment_id
  JOIN public.programs    pr  ON pr.id = e.program_id
  LEFT JOIN public.cohorts    c   ON c.id  = e.cohort_id
  LEFT JOIN pay_agg           pa  ON pa.invoice_id = inv.id
  LEFT JOIN inst_agg          ia  ON ia.invoice_id = inv.id
  WHERE pr.hub_id = _hub
    AND inv.status NOT IN ('paid', 'cancelled', 'draft')
    AND (inv.total_amount - COALESCE(pa.paid_amt, 0)) > 0
    AND (NOT p_only_overdue OR ia.earliest_overdue IS NOT NULL OR inv.status = 'overdue')
  ORDER BY ia.earliest_overdue NULLS LAST, ia.next_due NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_outstanding_invoices(boolean) TO authenticated;
