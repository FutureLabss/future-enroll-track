
CREATE OR REPLACE FUNCTION public.admin_delete_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _enrollment_id uuid;
  _invoice_number text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can delete invoices';
  END IF;

  SELECT enrollment_id, invoice_number INTO _enrollment_id, _invoice_number
  FROM public.invoices WHERE id = p_invoice_id;

  IF _enrollment_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  -- Delete payments and installments tied to this invoice
  DELETE FROM public.payments WHERE invoice_id = p_invoice_id;
  DELETE FROM public.installments WHERE invoice_id = p_invoice_id;

  -- Delete notifications associated with this enrollment & invoice number
  DELETE FROM public.notifications
    WHERE enrollment_id = _enrollment_id
      AND message ILIKE '%' || _invoice_number || '%';

  -- Delete invoice itself
  DELETE FROM public.invoices WHERE id = p_invoice_id;

  -- Now also delete the enrollment and its dependent records
  -- (any other invoices for the same enrollment, their payments/installments, field values, and enrollment notifications)
  DELETE FROM public.payments
    WHERE invoice_id IN (SELECT id FROM public.invoices WHERE enrollment_id = _enrollment_id);
  DELETE FROM public.installments
    WHERE invoice_id IN (SELECT id FROM public.invoices WHERE enrollment_id = _enrollment_id);
  DELETE FROM public.invoices WHERE enrollment_id = _enrollment_id;
  DELETE FROM public.field_values WHERE enrollment_id = _enrollment_id;
  DELETE FROM public.notifications WHERE enrollment_id = _enrollment_id;
  DELETE FROM public.enrollments WHERE id = _enrollment_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'delete', 'invoice', p_invoice_id,
          jsonb_build_object(
            'invoice_number', _invoice_number,
            'enrollment_id', _enrollment_id,
            'cascaded_enrollment', true
          ));
END;
$function$;
