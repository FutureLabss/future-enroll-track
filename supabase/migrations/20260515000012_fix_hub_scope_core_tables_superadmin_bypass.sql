-- ── enrollments ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage enrollments" ON public.enrollments;
CREATE POLICY "Admins manage enrollments"
  ON public.enrollments FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = enrollments.program_id AND p.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = enrollments.program_id AND p.hub_id = public.get_my_hub_id()
    )
  );

-- ── invoices ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage invoices" ON public.invoices;
CREATE POLICY "Admins manage invoices"
  ON public.invoices FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.programs p ON p.id = e.program_id
      WHERE e.id = invoices.enrollment_id AND p.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.programs p ON p.id = e.program_id
      WHERE e.id = invoices.enrollment_id AND p.hub_id = public.get_my_hub_id()
    )
  );

-- ── installments (was completely unscoped) ────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage installments" ON public.installments;
CREATE POLICY "Admins manage installments"
  ON public.installments FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.enrollments e ON e.id = i.enrollment_id
      JOIN public.programs p    ON p.id = e.program_id
      WHERE i.id = installments.invoice_id AND p.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.enrollments e ON e.id = i.enrollment_id
      JOIN public.programs p    ON p.id = e.program_id
      WHERE i.id = installments.invoice_id AND p.hub_id = public.get_my_hub_id()
    )
  );

-- ── payments ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
CREATE POLICY "Admins manage payments"
  ON public.payments FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.enrollments e ON e.id = i.enrollment_id
      JOIN public.programs p    ON p.id = e.program_id
      WHERE i.id = payments.invoice_id AND p.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.enrollments e ON e.id = i.enrollment_id
      JOIN public.programs p    ON p.id = e.program_id
      WHERE i.id = payments.invoice_id AND p.hub_id = public.get_my_hub_id()
    )
  );

-- ── other_income ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage other income" ON public.other_income;
CREATE POLICY "Admins manage other income"
  ON public.other_income FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND hub_id = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND hub_id = public.get_my_hub_id()
  );
