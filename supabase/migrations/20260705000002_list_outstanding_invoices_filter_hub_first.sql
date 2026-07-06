-- Performance audit finding B2: list_outstanding_invoices aggregated every
-- hub's entire payments/installments history before filtering to one hub.
-- Restructured to resolve the hub's candidate invoices first and aggregate
-- only over those. Signature, return shape and semantics unchanged.

CREATE OR REPLACE FUNCTION public.list_outstanding_invoices(p_only_overdue boolean DEFAULT false)
 RETURNS TABLE(invoice_id uuid, invoice_number text, enrollment_id uuid, full_name text, email text, phone text, program_name text, cohort_label text, total_amount numeric, amount_paid numeric, outstanding numeric, next_due_date date, earliest_overdue_date date, days_overdue integer, is_overdue boolean, invoice_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _hub uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only admins can view outstanding invoices';
  END IF;

  _hub := public.get_my_hub_id();

  RETURN QUERY
  WITH hub_invoices AS (
    SELECT inv.id            AS inv_id,
           inv.invoice_number AS inv_number,
           inv.total_amount  AS inv_total,
           inv.status        AS inv_status,
           e.id              AS enr_id,
           e.full_name       AS enr_name,
           e.email           AS enr_email,
           e.phone           AS enr_phone,
           pr.program_name   AS prog_name,
           c.cohort_label    AS coh_label
    FROM public.invoices inv
    JOIN public.enrollments e  ON e.id  = inv.enrollment_id
    JOIN public.programs    pr ON pr.id = e.program_id
    LEFT JOIN public.cohorts c ON c.id  = e.cohort_id
    WHERE pr.hub_id = _hub
      AND inv.status NOT IN ('paid', 'cancelled', 'draft')
  ),
  pay_agg AS (
    SELECT ap.inv_id, SUM(ap.paid_amt) AS paid_amt
    FROM (
      SELECT p.invoice_id AS inv_id, p.amount AS paid_amt
      FROM public.payments p
      WHERE p.invoice_id IN (SELECT hi.inv_id FROM hub_invoices hi)
      UNION ALL
      SELECT inst.invoice_id, inst.amount
      FROM public.installments inst
      WHERE inst.status = 'paid'
        AND inst.invoice_id IN (SELECT hi.inv_id FROM hub_invoices hi)
    ) ap
    GROUP BY ap.inv_id
  ),
  inst_agg AS (
    SELECT i.invoice_id AS inv_id,
           MIN(CASE WHEN i.status = 'pending' THEN i.due_date END)                               AS next_due,
           MIN(CASE WHEN i.status = 'pending' AND i.due_date < CURRENT_DATE THEN i.due_date END) AS earliest_overdue
    FROM public.installments i
    WHERE i.invoice_id IN (SELECT hi.inv_id FROM hub_invoices hi)
    GROUP BY i.invoice_id
  )
  SELECT
    hi.inv_id,
    hi.inv_number,
    hi.enr_id,
    hi.enr_name,
    hi.enr_email,
    hi.enr_phone,
    hi.prog_name,
    hi.coh_label,
    hi.inv_total,
    COALESCE(pa.paid_amt, 0)::numeric,
    GREATEST(hi.inv_total - COALESCE(pa.paid_amt, 0), 0)::numeric,
    ia.next_due,
    ia.earliest_overdue,
    CASE WHEN ia.earliest_overdue IS NOT NULL
         THEN (CURRENT_DATE - ia.earliest_overdue)::integer
         ELSE 0 END,
    (ia.earliest_overdue IS NOT NULL OR hi.inv_status = 'overdue'),
    hi.inv_status::text
  FROM hub_invoices hi
  LEFT JOIN pay_agg  pa ON pa.inv_id = hi.inv_id
  LEFT JOIN inst_agg ia ON ia.inv_id = hi.inv_id
  WHERE (hi.inv_total - COALESCE(pa.paid_amt, 0)) > 0
    AND (NOT p_only_overdue OR ia.earliest_overdue IS NOT NULL OR hi.inv_status = 'overdue')
  ORDER BY ia.earliest_overdue NULLS LAST, ia.next_due NULLS LAST;
END;
$function$;
