-- admin_update_invoice rebuilds an invoice by DELETEing every installment and
-- re-INSERTing from the submitted JSON. That INSERT never carried the three
-- reconciliation columns added in 20260909000003, so a single invoice edit
-- silently discarded the bank evidence for that invoice: paid_at_actual,
-- paid_at_source and bank_transaction_id all came back NULL/'unknown', and the
-- Finance Dashboard's cash basis quietly fell back to the staff-typed paid_at.
--
-- The edit payload (EditInvoicePage.tsx) sends no installment ids, so rows
-- cannot be re-associated by key. They are re-associated on (amount, due_date)
-- instead, which is what the user sees and edits on that form. Duplicate
-- (amount, due_date) pairs within one invoice are paired off in order via
-- row_number so two identical installments never both claim the same evidence
-- -- one bank transaction backing two installments is the double-claim bug we
-- already had to unpick once by hand.
--
-- Evidence is deliberately dropped when the row it belonged to no longer exists
-- or is no longer 'paid': an installment whose amount or due date was edited is
-- not the row the bank matched, and re-attaching a timestamp to it would be the
-- guess that CLAUDE.md forbids. NULL falls back to the old basis, which is honest.

CREATE OR REPLACE FUNCTION public.admin_update_invoice(
  p_invoice_id uuid,
  p_total_amount numeric,
  p_installments jsonb DEFAULT NULL::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Snapshot bank evidence before the rows carrying it are deleted.
  CREATE TEMP TABLE _recon_snapshot ON COMMIT DROP AS
  SELECT i.amount,
         i.due_date,
         i.paid_at_actual,
         i.paid_at_source,
         i.bank_transaction_id,
         row_number() OVER (PARTITION BY i.amount, i.due_date ORDER BY i.id) AS dup_rank
  FROM public.installments i
  WHERE i.invoice_id = p_invoice_id
    AND i.status = 'paid'
    AND i.bank_transaction_id IS NOT NULL;

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

  -- Re-attach the snapshot to the rebuilt rows, pairing duplicates off in order.
  WITH rebuilt AS (
    SELECT i.id, i.amount, i.due_date,
           row_number() OVER (PARTITION BY i.amount, i.due_date ORDER BY i.id) AS dup_rank
    FROM public.installments i
    WHERE i.invoice_id = p_invoice_id AND i.status = 'paid'
  )
  UPDATE public.installments tgt
     SET paid_at_actual      = s.paid_at_actual,
         paid_at_source      = s.paid_at_source,
         bank_transaction_id = s.bank_transaction_id,
         -- The bank timestamp is the better answer to "when did this land" than
         -- whatever the form re-submitted, so keep them consistent.
         paid_at             = COALESCE(s.paid_at_actual, tgt.paid_at)
    FROM rebuilt r
    JOIN _recon_snapshot s
      ON s.amount = r.amount AND s.due_date = r.due_date AND s.dup_rank = r.dup_rank
   WHERE tgt.id = r.id;

  DROP TABLE _recon_snapshot;

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
$function$;

GRANT EXECUTE ON FUNCTION public.admin_update_invoice(uuid, numeric, jsonb) TO authenticated;
