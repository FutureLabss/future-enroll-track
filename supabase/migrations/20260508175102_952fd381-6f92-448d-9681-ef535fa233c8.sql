
-- =====================================================================
-- 1. Update get_finance_summary & get_enrollment_performance to use
--    first_payment_date (fall back to created_at when null)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_finance_summary(
  p_months integer DEFAULT 12,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
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
  rev AS (
    SELECT date_trunc('month', COALESCE(e.first_payment_date::date, e.created_at::date))::date AS m,
           COALESCE(SUM(e.amount_paid), 0) AS total
    FROM public.enrollments e
    WHERE e.amount_paid > 0
    GROUP BY 1
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
  SELECT months.m,
         COALESCE(rev.total, 0),
         COALESCE(oi.total, 0),
         COALESCE(pr.total, 0),
         COALESCE(ex.total, 0),
         (COALESCE(rev.total, 0) + COALESCE(oi.total, 0)) - COALESCE(pr.total, 0) - COALESCE(ex.total, 0)
  FROM months
  LEFT JOIN rev ON rev.m = months.m
  LEFT JOIN oi  ON oi.m  = months.m
  LEFT JOIN pr  ON pr.m  = months.m
  LEFT JOIN ex  ON ex.m  = months.m
  ORDER BY months.m DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_enrollment_performance(
  p_months integer DEFAULT 12,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE(month date, target_count integer, actual_count integer, variance integer, achievement_pct numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _start date;
  _end date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can view enrollment performance';
  END IF;

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    _start := date_trunc('month', p_start_date)::date;
    _end := date_trunc('month', p_end_date)::date;
  ELSE
    _end := date_trunc('month', CURRENT_DATE)::date;
    _start := (date_trunc('month', CURRENT_DATE) - ((GREATEST(p_months,1)-1) || ' months')::interval)::date;
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(_start, _end, '1 month'::interval)::date AS m
  ),
  actual AS (
    SELECT date_trunc('month', COALESCE(e.first_payment_date::date, e.created_at::date))::date AS m,
           COUNT(*)::int AS cnt
    FROM public.enrollments e
    GROUP BY 1
  ),
  tgt AS (
    SELECT t.target_month AS m, t.target_count AS cnt FROM public.enrollment_targets t
  )
  SELECT months.m,
         COALESCE(tgt.cnt, 0)::int,
         COALESCE(actual.cnt, 0)::int,
         (COALESCE(actual.cnt,0) - COALESCE(tgt.cnt,0))::int,
         CASE WHEN COALESCE(tgt.cnt,0) > 0
              THEN ROUND((COALESCE(actual.cnt,0)::numeric / tgt.cnt::numeric) * 100, 1)
              ELSE NULL END
  FROM months
  LEFT JOIN actual ON actual.m = months.m
  LEFT JOIN tgt ON tgt.m = months.m
  ORDER BY months.m DESC;
END;
$function$;

-- =====================================================================
-- 2. Invoice change request workflow (admins propose, superadmin approves)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.invoice_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('edit','delete')),
  payload jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view invoice change requests"
ON public.invoice_change_requests FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Superadmin manages invoice change requests"
ON public.invoice_change_requests FOR ALL
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TRIGGER trg_invoice_change_requests_updated
BEFORE UPDATE ON public.invoice_change_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Submit a change request (admin)
CREATE OR REPLACE FUNCTION public.request_invoice_change(
  p_invoice_id uuid,
  p_action text,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can request invoice changes';
  END IF;
  IF p_action NOT IN ('edit','delete') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  INSERT INTO public.invoice_change_requests(invoice_id, action, payload, requested_by)
  VALUES (p_invoice_id, p_action, p_payload, auth.uid())
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'request_invoice_change', 'invoice', p_invoice_id,
          jsonb_build_object('request_id', _id, 'action', p_action));
  RETURN _id;
END;
$function$;

-- Approve and execute (superadmin only)
CREATE OR REPLACE FUNCTION public.approve_invoice_change(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.invoice_change_requests%ROWTYPE;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can approve invoice changes';
  END IF;
  SELECT * INTO r FROM public.invoice_change_requests WHERE id = p_request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Request already %', r.status; END IF;

  IF r.action = 'edit' THEN
    PERFORM public.admin_update_invoice(
      r.invoice_id,
      (r.payload->>'total_amount')::numeric,
      r.payload->'installments'
    );
  ELSIF r.action = 'delete' THEN
    PERFORM public.admin_delete_invoice(r.invoice_id);
  END IF;

  UPDATE public.invoice_change_requests
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'approve_invoice_change', 'invoice', r.invoice_id,
          jsonb_build_object('request_id', p_request_id, 'change_action', r.action));
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_invoice_change(p_request_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.invoice_change_requests%ROWTYPE;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can reject invoice changes';
  END IF;
  SELECT * INTO r FROM public.invoice_change_requests WHERE id = p_request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Request already %', r.status; END IF;

  UPDATE public.invoice_change_requests
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), reason = p_reason
   WHERE id = p_request_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'reject_invoice_change', 'invoice', r.invoice_id,
          jsonb_build_object('request_id', p_request_id, 'reason', p_reason));
END;
$function$;

-- Restrict admin_update_invoice / admin_delete_invoice to superadmin only.
-- (Approval flow uses SECURITY DEFINER so PERFORM still works because it
-- bypasses RLS; the role check is what we need to update.)
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

  UPDATE public.enrollments SET amount_paid = _new_paid, updated_at = now() WHERE id = _enrollment_id;

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
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can delete invoices directly. Use request_invoice_change for approval workflow.';
  END IF;

  SELECT enrollment_id, invoice_number INTO _enrollment_id, _invoice_number
  FROM public.invoices WHERE id = p_invoice_id;
  IF _enrollment_id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  DELETE FROM public.payments WHERE invoice_id = p_invoice_id;
  DELETE FROM public.installments WHERE invoice_id = p_invoice_id;
  DELETE FROM public.notifications
    WHERE enrollment_id = _enrollment_id AND message ILIKE '%' || _invoice_number || '%';
  DELETE FROM public.invoices WHERE id = p_invoice_id;
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
          jsonb_build_object('invoice_number', _invoice_number, 'enrollment_id', _enrollment_id, 'cascaded_enrollment', true));
END;
$function$;

-- =====================================================================
-- 3. Staff invoices → expenses workflow
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.staff_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid,
  submitted_by uuid,
  staff_name text NOT NULL,
  title text NOT NULL,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  evidence_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  expense_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_invoices ENABLE ROW LEVEL SECURITY;

-- Staff (matched by email) can submit & view own invoices
CREATE POLICY "Staff can view own invoices"
ON public.staff_invoices FOR SELECT
USING (
  submitted_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.staff s
    JOIN auth.users u ON LOWER(u.email) = LOWER(s.email)
    WHERE u.id = auth.uid() AND s.id = staff_invoices.staff_id
  )
  OR public.has_role(auth.uid(),'admin'::app_role)
);

CREATE POLICY "Authenticated staff can submit invoices"
ON public.staff_invoices FOR INSERT TO authenticated
WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "Superadmin manages staff invoices"
ON public.staff_invoices FOR ALL
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TRIGGER trg_staff_invoices_updated
BEFORE UPDATE ON public.staff_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.approve_staff_invoice(p_id uuid, p_payment_date date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.staff_invoices%ROWTYPE;
  _expense_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can approve staff invoices';
  END IF;
  SELECT * INTO r FROM public.staff_invoices WHERE id = p_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Staff invoice not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Staff invoice already %', r.status; END IF;

  INSERT INTO public.expenses(category, vendor_name, amount, payment_date, payment_method, notes, recorded_by)
  VALUES ('Staff Reimbursement', r.staff_name, r.amount,
          COALESCE(p_payment_date, CURRENT_DATE), 'bank_transfer',
          COALESCE(r.title,'') || COALESCE(' - ' || NULLIF(r.description,''),'') || ' [staff invoice]',
          auth.uid())
  RETURNING id INTO _expense_id;

  UPDATE public.staff_invoices
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), expense_id = _expense_id
   WHERE id = p_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'approve_staff_invoice', 'staff_invoice', p_id,
          jsonb_build_object('expense_id', _expense_id, 'amount', r.amount));
  RETURN _expense_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_staff_invoice(p_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can reject staff invoices';
  END IF;
  UPDATE public.staff_invoices
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_reason
   WHERE id = p_id AND status = 'pending';

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'reject_staff_invoice', 'staff_invoice', p_id,
          jsonb_build_object('reason', p_reason));
END;
$function$;
