-- Superadmin was blocked because get_my_hub_id() returns NULL for them,
-- making the hub_id filter always false. Split into superadmin bypass + hub-scoped admin.
DROP POLICY IF EXISTS "Admins manage invoice change requests" ON public.invoice_change_requests;

CREATE POLICY "Admins manage invoice change requests"
ON public.invoice_change_requests
FOR ALL
USING (
  is_superadmin()
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      JOIN public.enrollments e ON e.id = i.enrollment_id
      JOIN public.programs p    ON p.id = e.program_id
      WHERE i.id = invoice_change_requests.invoice_id
        AND p.hub_id = get_my_hub_id()
    )
  )
)
WITH CHECK (
  is_superadmin()
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      JOIN public.enrollments e ON e.id = i.enrollment_id
      JOIN public.programs p    ON p.id = e.program_id
      WHERE i.id = invoice_change_requests.invoice_id
        AND p.hub_id = get_my_hub_id()
    )
  )
);
