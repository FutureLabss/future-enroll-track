-- admin_update_invoice recalculates enrollments.amount_paid on every edit
-- (correctly), but never touched enrollments.total_amount — so editing an
-- invoice's total (adding/removing installments, changing amounts) left
-- the enrollment's cached total frozen at whatever it was before the edit,
-- forever out of sync with the real invoice. outstanding_balance is a
-- generated column (total_amount - amount_paid), so it silently inherited
-- the wrong number too.
--
-- Concrete case: INV-001019 (Bla, Godiya Danjuma) was edited on
-- 2026-07-15 down to a single ₦50,000 installment — the invoice itself
-- and amount_paid both correctly show ₦50,000, but enrollments.total_amount
-- stayed at ₦100,000, so every page reading the enrollment (Cohort
-- students table, Reports, Admin Dashboard) showed ₦50,000 outstanding on
-- a fully-paid invoice while the Invoice detail page correctly showed ₦0.
-- 6 enrollments found with this exact drift (see backfill below) — some
-- with total_amount too high, some too low, all from post-creation edits.

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
  _new_total numeric := 0;
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

  -- Sum across ALL of this enrollment's non-cancelled invoices, same scope
  -- as the amount_paid calc above — an enrollment can have more than one.
  SELECT COALESCE(SUM(inv.total_amount), 0) INTO _new_total
  FROM public.invoices inv
  WHERE inv.enrollment_id = _enrollment_id AND inv.status != 'cancelled';

  -- first_payment_date = earliest paid_at of paid installments.
  SELECT MIN(i.paid_at) INTO _first_paid_at
  FROM public.installments i
  JOIN public.invoices inv ON inv.id = i.invoice_id
  WHERE inv.enrollment_id = _enrollment_id AND i.status = 'paid';

  UPDATE public.enrollments
     SET amount_paid = _new_paid,
         total_amount = _new_total,
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

-- Backfill the 6 enrollments already found drifted — recompute total_amount
-- from their real, current, non-cancelled invoices.
UPDATE public.enrollments e
SET total_amount = it.inv_total,
    updated_at = now()
FROM (
  SELECT enrollment_id, SUM(total_amount) AS inv_total
  FROM public.invoices
  WHERE status != 'cancelled'
  GROUP BY enrollment_id
) it
WHERE e.id = it.enrollment_id
  AND e.total_amount IS DISTINCT FROM it.inv_total;
