-- Fix RLS on enrollments, invoices, installments so is_superadmin() truly bypasses
-- hub-scoped EXISTS check. Prior policies AND'd the hub check with is_superadmin(),
-- causing NULL = hub_id comparison to silently fail for the superadmin user.

-- ── enrollments ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage enrollments" ON public.enrollments;
CREATE POLICY "Admins manage enrollments"
  ON public.enrollments FOR ALL
  USING (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.programs p
        WHERE p.id = enrollments.program_id AND p.hub_id = public.get_my_hub_id()
      )
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.programs p
        WHERE p.id = enrollments.program_id AND p.hub_id = public.get_my_hub_id()
      )
    )
  );

-- ── invoices ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage invoices" ON public.invoices;
CREATE POLICY "Admins manage invoices"
  ON public.invoices FOR ALL
  USING (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.enrollments e
        JOIN public.programs p ON p.id = e.program_id
        WHERE e.id = invoices.enrollment_id AND p.hub_id = public.get_my_hub_id()
      )
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.enrollments e
        JOIN public.programs p ON p.id = e.program_id
        WHERE e.id = invoices.enrollment_id AND p.hub_id = public.get_my_hub_id()
      )
    )
  );

-- ── installments ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage installments" ON public.installments;
CREATE POLICY "Admins manage installments"
  ON public.installments FOR ALL
  USING (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.invoices i
        JOIN public.enrollments e ON e.id = i.enrollment_id
        JOIN public.programs p    ON p.id = e.program_id
        WHERE i.id = installments.invoice_id AND p.hub_id = public.get_my_hub_id()
      )
    )
  );
