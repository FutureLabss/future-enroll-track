-- Invoice pages were timing out and installments could not be marked paid:
-- the finance policies inlined invoices→enrollments→programs joins, and each
-- referenced table expanded ITS policies recursively (a PK lookup on
-- installments planned to a 142KB tree with 252 subplans and 54 hub_members
-- scans; planning alone exceeded the statement timeout).
-- SECURITY DEFINER plpgsql helpers make the membership checks opaque to the
-- planner: no inner RLS expansion, cached plans, identical semantics.

CREATE OR REPLACE FUNCTION public.invoice_in_my_hub(_invoice_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.enrollments e ON e.id = i.enrollment_id
    JOIN public.programs p ON p.id = e.program_id
    WHERE i.id = _invoice_id AND p.hub_id = public.get_my_hub_id());
END; $$;

CREATE OR REPLACE FUNCTION public.invoice_is_mine(_invoice_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.enrollments e ON e.id = i.enrollment_id
    WHERE i.id = _invoice_id AND e.user_id = auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION public.enrollment_in_my_hub(_enrollment_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.programs p ON p.id = e.program_id
    WHERE e.id = _enrollment_id AND p.hub_id = public.get_my_hub_id());
END; $$;

CREATE OR REPLACE FUNCTION public.enrollment_is_mine(_enrollment_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.id = _enrollment_id AND e.user_id = auth.uid());
END; $$;

GRANT EXECUTE ON FUNCTION public.invoice_in_my_hub(uuid), public.invoice_is_mine(uuid),
  public.enrollment_in_my_hub(uuid), public.enrollment_is_mine(uuid) TO authenticated;

ALTER POLICY "Admins manage installments" ON public.installments
  USING ((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND public.invoice_in_my_hub(invoice_id))
  WITH CHECK ((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND public.invoice_in_my_hub(invoice_id));

ALTER POLICY "Students can view own installments" ON public.installments
  USING (public.invoice_is_mine(invoice_id));

ALTER POLICY "Admins manage invoices" ON public.invoices
  USING ((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND public.enrollment_in_my_hub(enrollment_id))
  WITH CHECK ((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND public.enrollment_in_my_hub(enrollment_id));

ALTER POLICY "Students can view own invoices" ON public.invoices
  USING (public.enrollment_is_mine(enrollment_id));

ALTER POLICY "Admins manage payments" ON public.payments
  USING ((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND public.invoice_in_my_hub(invoice_id))
  WITH CHECK ((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND public.invoice_in_my_hub(invoice_id));

ALTER POLICY "Students can view own payments" ON public.payments
  USING (public.invoice_is_mine(invoice_id));
