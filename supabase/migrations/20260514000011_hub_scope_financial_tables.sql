-- Hub-scope RLS for enrollments, invoices, payments, expenses, other_income.
-- Previously these tables had no hub isolation — any admin could see all rows.
-- Also adds hub_id column to expenses and other_income, and a trigger to
-- auto-set hub_id on programs INSERT based on the inserting user's hub.

-- ── 1. Enrollments ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage enrollments" ON public.enrollments;

CREATE POLICY "Admins manage enrollments"
  ON public.enrollments FOR ALL
  USING (
    public.is_superadmin()
    OR (has_role(auth.uid(), 'admin'::app_role)
        AND EXISTS (SELECT 1 FROM public.programs p
                    WHERE p.id = enrollments.program_id
                      AND p.hub_id = public.get_my_hub_id()))
  )
  WITH CHECK (
    public.is_superadmin()
    OR (has_role(auth.uid(), 'admin'::app_role)
        AND EXISTS (SELECT 1 FROM public.programs p
                    WHERE p.id = program_id
                      AND p.hub_id = public.get_my_hub_id()))
  );

-- ── 2. Invoices ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage invoices" ON public.invoices;

CREATE POLICY "Admins manage invoices"
  ON public.invoices FOR ALL
  USING (
    public.is_superadmin()
    OR (has_role(auth.uid(), 'admin'::app_role)
        AND EXISTS (SELECT 1 FROM public.enrollments e
                    JOIN public.programs p ON p.id = e.program_id
                    WHERE e.id = invoices.enrollment_id
                      AND p.hub_id = public.get_my_hub_id()))
  )
  WITH CHECK (
    public.is_superadmin()
    OR (has_role(auth.uid(), 'admin'::app_role)
        AND EXISTS (SELECT 1 FROM public.enrollments e
                    JOIN public.programs p ON p.id = e.program_id
                    WHERE e.id = enrollment_id
                      AND p.hub_id = public.get_my_hub_id()))
  );

-- ── 3. Payments ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage payments" ON public.payments;

CREATE POLICY "Admins manage payments"
  ON public.payments FOR ALL
  USING (
    public.is_superadmin()
    OR (has_role(auth.uid(), 'admin'::app_role)
        AND EXISTS (SELECT 1 FROM public.invoices i
                    JOIN public.enrollments e ON e.id = i.enrollment_id
                    JOIN public.programs p ON p.id = e.program_id
                    WHERE i.id = payments.invoice_id
                      AND p.hub_id = public.get_my_hub_id()))
  );

-- ── 4. hub_id on expenses ─────────────────────────────────────────────────────
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS hub_id uuid REFERENCES public.hubs(id);
UPDATE public.expenses SET hub_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE hub_id IS NULL;

DROP POLICY IF EXISTS "Admins can manage expenses" ON public.expenses;
CREATE POLICY "Admins manage expenses"
  ON public.expenses FOR ALL
  USING (public.is_superadmin() OR (has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()))
  WITH CHECK (public.is_superadmin() OR (has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

-- ── 5. hub_id on other_income ─────────────────────────────────────────────────
ALTER TABLE public.other_income ADD COLUMN IF NOT EXISTS hub_id uuid REFERENCES public.hubs(id);
UPDATE public.other_income SET hub_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE hub_id IS NULL;

DROP POLICY IF EXISTS "Admins can manage other income" ON public.other_income;
CREATE POLICY "Admins manage other income"
  ON public.other_income FOR ALL
  USING (public.is_superadmin() OR (has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()))
  WITH CHECK (public.is_superadmin() OR (has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

-- ── 6. Trigger: auto-set hub_id on programs INSERT ───────────────────────────
CREATE OR REPLACE FUNCTION public.programs_set_hub_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.hub_id IS NULL OR NEW.hub_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    NEW.hub_id := COALESCE(public.get_my_hub_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_programs_set_hub_id ON public.programs;
CREATE TRIGGER trg_programs_set_hub_id
  BEFORE INSERT ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.programs_set_hub_id();
