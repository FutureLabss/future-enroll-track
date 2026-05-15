-- pay_agg CTE uses unqualified "invoice_id" which conflicts with the
-- RETURNS TABLE OUT parameter of the same name, causing
-- "column reference invoice_id is ambiguous" on every RPC call.
-- Fix: rename the intermediate alias to inv_id inside all_paid and pay_agg.

CREATE OR REPLACE FUNCTION public.list_outstanding_invoices(p_only_overdue boolean DEFAULT false)
RETURNS TABLE(
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
    SELECT p.invoice_id AS inv_id, p.amount AS paid_amt
    FROM public.payments p
    UNION ALL
    SELECT inst.invoice_id AS inv_id, inst.amount AS paid_amt
    FROM public.installments inst
    WHERE inst.status = 'paid'
  ),
  pay_agg AS (
    SELECT all_paid.inv_id, SUM(all_paid.paid_amt) AS paid_amt
    FROM all_paid
    GROUP BY all_paid.inv_id
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
  LEFT JOIN pay_agg           pa  ON pa.inv_id = inv.id
  LEFT JOIN inst_agg          ia  ON ia.invoice_id = inv.id
  WHERE pr.hub_id = _hub
    AND inv.status NOT IN ('paid', 'cancelled', 'draft')
    AND (inv.total_amount - COALESCE(pa.paid_amt, 0)) > 0
    AND (NOT p_only_overdue OR ia.earliest_overdue IS NOT NULL OR inv.status = 'overdue')
  ORDER BY ia.earliest_overdue NULLS LAST, ia.next_due NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_outstanding_invoices(boolean) TO authenticated;
