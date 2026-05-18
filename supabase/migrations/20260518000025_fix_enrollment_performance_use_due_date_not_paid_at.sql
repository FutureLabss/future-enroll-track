-- get_finance_summary buckets installment revenue by due_date (not paid_at).
-- get_enrollment_performance was using paid_at, causing backfilled enrollments
-- to all land in the month the data was entered rather than the correct month.
-- Align both to use due_date of the first paid installment.

CREATE OR REPLACE FUNCTION public.get_enrollment_performance(
  p_months integer DEFAULT 12,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE(month date, target_count integer, actual_count integer, variance integer, achievement_pct numeric)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  _start date;
  _end   date;
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

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(_start, _end, '1 month'::interval)::date AS m
  ),
  first_payments AS (
    -- Use due_date (same as get_finance_summary) so backfilled data
    -- lands in the correct month regardless of when paid_at was stamped.
    SELECT i.enrollment_id, MIN(inst.due_date)::date AS first_due
    FROM public.invoices i
    JOIN public.installments inst ON inst.invoice_id = i.id AND inst.status = 'paid'
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
    GROUP BY 1
  ),
  tgt AS (
    SELECT t.target_month AS m, t.target_count AS cnt
    FROM public.enrollment_targets t
    WHERE t.hub_id = _hub
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
$$;

-- Also fix admin_update_invoice to stamp first_payment_date from the
-- first paid installment's due_date (consistent with revenue bucketing).
CREATE OR REPLACE FUNCTION public.admin_update_invoice(
  p_invoice_id uuid,
  p_total_amount numeric,
  p_installments jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  _enrollment_id uuid;
  _inst jsonb;
  _new_paid numeric := 0;
  _all_paid boolean;
  _has_any boolean := false;
  _first_due timestamptz;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can edit invoices directly. Use request_invoice_change for approval workflow.';
  END IF;

  SELECT enrollment_id INTO _enrollment_id FROM public.invoices WHERE id = p_invoice_id;
  IF _enrollment_id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  UPDATE public.invoices SET total_amount = p_total_amount, updated_at = now() WHERE id = p_invoice_id;
  DELETE FROM public.installments WHERE invoice_id = p_invoice_id;

  IF p_installments IS NOT NULL AND jsonb_typeof(p_installments) = 'array' THEN
    FOR _inst IN SELECT * FROM jsonb_array_elements(p_installments) LOOP
      _has_any := true;
      INSERT INTO public.installments (invoice_id, amount, due_date, status, paid_at)
      VALUES (
        p_invoice_id,
        (_inst->>'amount')::numeric,
        (_inst->>'due_date')::date,
        COALESCE(_inst->>'status','pending'),
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

  -- first_payment_date = earliest due_date of paid installments (matches revenue bucketing)
  SELECT MIN(i.due_date)::timestamptz INTO _first_due
  FROM public.installments i
  JOIN public.invoices inv ON inv.id = i.invoice_id
  WHERE inv.enrollment_id = _enrollment_id AND i.status = 'paid';

  UPDATE public.enrollments
     SET amount_paid = _new_paid,
         first_payment_date = _first_due,
         updated_at = now()
   WHERE id = _enrollment_id;

  SELECT bool_and(i.status = 'paid') INTO _all_paid FROM public.installments i WHERE i.invoice_id = p_invoice_id;
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
$$;

-- Backfill first_payment_date on all enrollments using due_date of first paid installment
UPDATE public.enrollments e
SET first_payment_date = fp.first_due
FROM (
  SELECT inv.enrollment_id, MIN(inst.due_date)::timestamptz AS first_due
  FROM public.installments inst
  JOIN public.invoices inv ON inv.id = inst.invoice_id
  WHERE inst.status = 'paid'
  GROUP BY inv.enrollment_id
) fp
WHERE e.id = fp.enrollment_id
  AND (e.first_payment_date IS DISTINCT FROM fp.first_due);
