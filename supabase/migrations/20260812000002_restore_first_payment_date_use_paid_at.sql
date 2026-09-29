-- first_payment_date (which ReportsPage.tsx uses to bucket revenue by month)
-- was switched from paid_at to due_date on 2026-05-18
-- (20260518000025_fix_enrollment_performance_use_due_date_not_paid_at.sql)
-- because paid_at was unreliable then — batch data-entry sessions stamped it
-- with whenever staff got around to clicking, not the real payment date, so
-- backfilled enrollments all landed in the entry month instead of the correct
-- one. That's the same root cause fixed today (20260812000001: payments now
-- have a real, staff-editable payment_date; every "mark paid" flow now asks
-- for the actual date instead of silently stamping now()). With paid_at
-- trustworthy again, first_payment_date reverts to what it's actually
-- supposed to mean: the date of the first paid installment, not the date it
-- was originally due.
--
-- get_enrollment_performance (enrollment counts vs targets, not revenue)
-- still uses the due_date workaround from the same 2026-05-18 migration —
-- deliberately left untouched here; that's a separate metric this change
-- wasn't asked to touch.

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
  _first_paid_at timestamptz;
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

  -- first_payment_date = earliest paid_at of paid installments (reverted to
  -- match revenue's actual cash-basis meaning — see header note).
  SELECT MIN(i.paid_at) INTO _first_paid_at
  FROM public.installments i
  JOIN public.invoices inv ON inv.id = i.invoice_id
  WHERE inv.enrollment_id = _enrollment_id AND i.status = 'paid';

  UPDATE public.enrollments
     SET amount_paid = _new_paid,
         first_payment_date = _first_paid_at,
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
