-- Fix admin_update_invoice: do not write to generated outstanding_balance column
CREATE OR REPLACE FUNCTION public.admin_update_invoice(p_invoice_id uuid, p_total_amount numeric, p_installments jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _enrollment_id uuid;
  _inst jsonb;
  _new_paid numeric := 0;
  _all_paid boolean;
  _has_any boolean := false;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can edit invoices';
  END IF;

  SELECT enrollment_id INTO _enrollment_id FROM public.invoices WHERE id = p_invoice_id;
  IF _enrollment_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  UPDATE public.invoices
     SET total_amount = p_total_amount,
         updated_at = now()
   WHERE id = p_invoice_id;

  DELETE FROM public.installments WHERE invoice_id = p_invoice_id;

  IF p_installments IS NOT NULL AND jsonb_typeof(p_installments) = 'array' THEN
    FOR _inst IN SELECT * FROM jsonb_array_elements(p_installments)
    LOOP
      _has_any := true;
      INSERT INTO public.installments (invoice_id, amount, due_date, status, paid_at)
      VALUES (
        p_invoice_id,
        (_inst->>'amount')::numeric,
        (_inst->>'due_date')::date,
        COALESCE(_inst->>'status', 'pending'),
        CASE WHEN COALESCE(_inst->>'status','pending') = 'paid'
             THEN COALESCE((_inst->>'paid_at')::timestamptz, now())
             ELSE NULL END
      );
    END LOOP;
  END IF;

  SELECT COALESCE(SUM(i.amount), 0) INTO _new_paid
  FROM public.installments i
  JOIN public.invoices inv ON inv.id = i.invoice_id
  WHERE inv.enrollment_id = _enrollment_id AND i.status = 'paid';

  -- outstanding_balance is a generated column; only update amount_paid
  UPDATE public.enrollments
     SET amount_paid = _new_paid,
         updated_at = now()
   WHERE id = _enrollment_id;

  SELECT bool_and(i.status = 'paid') INTO _all_paid
  FROM public.installments i WHERE i.invoice_id = p_invoice_id;

  IF _has_any AND _all_paid THEN
    UPDATE public.invoices SET status = 'paid' WHERE id = p_invoice_id;
  ELSE
    UPDATE public.invoices SET status = 'active' WHERE id = p_invoice_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'update', 'invoice', p_invoice_id,
          jsonb_build_object('total_amount', p_total_amount,
                             'installment_count', COALESCE(jsonb_array_length(p_installments), 0)));
END;
$function$;

-- Fix get_finance_summary: alias month columns to avoid ambiguity with RETURNS TABLE column "month"
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
      )::date AS m
    FROM public.enrollments e
    WHERE e.amount_paid > 0
  ),
  rev AS (
    SELECT m, COALESCE(SUM(amount_paid), 0) AS total
    FROM enrollment_due
    GROUP BY m
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
  SELECT
    months.m,
    COALESCE(rev.total, 0),
    COALESCE(oi.total, 0),
    COALESCE(pr.total, 0),
    COALESCE(ex.total, 0),
    (COALESCE(rev.total, 0) + COALESCE(oi.total, 0))
      - COALESCE(pr.total, 0) - COALESCE(ex.total, 0)
  FROM months
  LEFT JOIN rev ON rev.m = months.m
  LEFT JOIN oi ON oi.m = months.m
  LEFT JOIN pr ON pr.m = months.m
  LEFT JOIN ex ON ex.m = months.m
  ORDER BY months.m DESC;
END;
$function$;

-- New: list outstanding & overdue invoices for admins
CREATE OR REPLACE FUNCTION public.list_outstanding_invoices(p_only_overdue boolean DEFAULT false)
 RETURNS TABLE(
   invoice_id uuid,
   invoice_number text,
   enrollment_id uuid,
   full_name text,
   email text,
   phone text,
   program_name text,
   cohort_label text,
   total_amount numeric,
   amount_paid numeric,
   outstanding numeric,
   next_due_date date,
   earliest_overdue_date date,
   days_overdue integer,
   is_overdue boolean,
   invoice_status text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can view outstanding invoices';
  END IF;

  RETURN QUERY
  WITH inst_agg AS (
    SELECT
      i.invoice_id,
      MIN(CASE WHEN i.status = 'pending' THEN i.due_date END) AS next_due,
      MIN(CASE WHEN i.status = 'pending' AND i.due_date < CURRENT_DATE THEN i.due_date END) AS earliest_overdue,
      SUM(CASE WHEN i.status = 'paid' THEN i.amount ELSE 0 END) AS paid_inst
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
    p.program_name,
    c.cohort_label,
    inv.total_amount,
    COALESCE(ia.paid_inst, 0)::numeric AS amount_paid,
    GREATEST(inv.total_amount - COALESCE(ia.paid_inst, 0), 0)::numeric AS outstanding,
    ia.next_due,
    ia.earliest_overdue,
    CASE WHEN ia.earliest_overdue IS NOT NULL
         THEN (CURRENT_DATE - ia.earliest_overdue)::integer
         ELSE 0 END AS days_overdue,
    (ia.earliest_overdue IS NOT NULL) AS is_overdue,
    inv.status
  FROM public.invoices inv
  JOIN public.enrollments e ON e.id = inv.enrollment_id
  LEFT JOIN public.programs p ON p.id = e.program_id
  LEFT JOIN public.cohorts c ON c.id = e.cohort_id
  LEFT JOIN inst_agg ia ON ia.invoice_id = inv.id
  WHERE (inv.total_amount - COALESCE(ia.paid_inst, 0)) > 0
    AND (NOT p_only_overdue OR ia.earliest_overdue IS NOT NULL)
  ORDER BY ia.earliest_overdue NULLS LAST, ia.next_due NULLS LAST;
END;
$function$;