CREATE OR REPLACE FUNCTION public.sync_enrollment_first_due_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _invoice_id uuid;
  _enrollment_id uuid;
  _first_due date;
BEGIN
  _invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT inv.enrollment_id INTO _enrollment_id
  FROM public.invoices inv
  WHERE inv.id = _invoice_id;

  IF _enrollment_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT MIN(inst.due_date)::date INTO _first_due
  FROM public.installments inst
  JOIN public.invoices inv ON inv.id = inst.invoice_id
  WHERE inv.enrollment_id = _enrollment_id;

  UPDATE public.enrollments
  SET first_payment_date = CASE WHEN _first_due IS NULL THEN NULL ELSE _first_due::timestamptz END,
      updated_at = now()
  WHERE id = _enrollment_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS sync_enrollment_first_due_date_on_installments ON public.installments;
CREATE TRIGGER sync_enrollment_first_due_date_on_installments
AFTER INSERT OR UPDATE OF due_date, invoice_id OR DELETE ON public.installments
FOR EACH ROW
EXECUTE FUNCTION public.sync_enrollment_first_due_date();

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
  _first_due date;
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

  SELECT MIN(i.due_date)::date INTO _first_due
  FROM public.installments i
  JOIN public.invoices inv ON inv.id = i.invoice_id
  WHERE inv.enrollment_id = _enrollment_id;

  UPDATE public.enrollments
     SET amount_paid = _new_paid,
         first_payment_date = CASE WHEN _first_due IS NULL THEN NULL ELSE _first_due::timestamptz END,
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