
CREATE OR REPLACE FUNCTION public.admin_delete_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _enrollment_id uuid;
  _new_paid numeric;
  _new_outstanding numeric;
  _total numeric;
BEGIN
  -- Only admins
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can delete invoices';
  END IF;

  SELECT enrollment_id INTO _enrollment_id
  FROM public.invoices WHERE id = p_invoice_id;

  IF _enrollment_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  -- Delete child rows
  DELETE FROM public.payments WHERE invoice_id = p_invoice_id;
  DELETE FROM public.installments WHERE invoice_id = p_invoice_id;
  DELETE FROM public.notifications
    WHERE enrollment_id = _enrollment_id
      AND (message ILIKE '%' || (SELECT invoice_number FROM public.invoices WHERE id = p_invoice_id) || '%');
  DELETE FROM public.invoices WHERE id = p_invoice_id;

  -- Recalculate enrollment totals from remaining paid installments
  SELECT COALESCE(SUM(i.amount), 0) INTO _new_paid
  FROM public.installments i
  JOIN public.invoices inv ON inv.id = i.invoice_id
  WHERE inv.enrollment_id = _enrollment_id AND i.status = 'paid';

  SELECT COALESCE(SUM(total_amount), 0) INTO _total
  FROM public.invoices WHERE enrollment_id = _enrollment_id;

  _new_outstanding := GREATEST(_total - _new_paid, 0);

  UPDATE public.enrollments
  SET amount_paid = _new_paid,
      outstanding_balance = _new_outstanding
  WHERE id = _enrollment_id;

  -- Audit log
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'delete', 'invoice', p_invoice_id, jsonb_build_object('cascaded', true));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_invoice(uuid) TO authenticated;
