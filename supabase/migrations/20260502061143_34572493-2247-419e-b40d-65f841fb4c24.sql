
-- Audit logs with user email
CREATE OR REPLACE FUNCTION public.list_audit_logs(p_limit int DEFAULT 200)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  user_email text,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can view audit logs';
  END IF;

  RETURN QUERY
  SELECT al.id, al.user_id, u.email::text AS user_email,
         al.action, al.entity_type, al.entity_id, al.details, al.created_at
  FROM public.audit_logs al
  LEFT JOIN auth.users u ON u.id = al.user_id
  ORDER BY al.created_at DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

-- Admin update invoice (total + installments)
CREATE OR REPLACE FUNCTION public.admin_update_invoice(
  p_invoice_id uuid,
  p_total_amount numeric,
  p_installments jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Replace installments
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

  -- Recalculate enrollment totals from ALL invoices for this enrollment
  SELECT COALESCE(SUM(i.amount), 0) INTO _new_paid
  FROM public.installments i
  JOIN public.invoices inv ON inv.id = i.invoice_id
  WHERE inv.enrollment_id = _enrollment_id AND i.status = 'paid';

  UPDATE public.enrollments
     SET amount_paid = _new_paid,
         outstanding_balance = GREATEST(total_amount - _new_paid, 0),
         updated_at = now()
   WHERE id = _enrollment_id;

  -- Update invoice status based on its own installments
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
$$;
