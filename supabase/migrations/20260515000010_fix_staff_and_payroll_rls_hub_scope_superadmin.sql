-- ── staff: hub-scope ALL access through get_my_hub_id() ──────────────────────
-- Previously is_superadmin() bypassed hub filtering entirely.
-- Superadmins use the hub switcher to set context, so get_my_hub_id() is correct.

DROP POLICY IF EXISTS "Admins read staff" ON public.staff;
CREATE POLICY "Admins read staff"
  ON public.staff FOR SELECT
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND hub_id = public.get_my_hub_id()
  );

DROP POLICY IF EXISTS "Superadmins manage staff" ON public.staff;
CREATE POLICY "Superadmins manage staff"
  ON public.staff FOR ALL
  USING  (public.is_superadmin() AND hub_id = public.get_my_hub_id())
  WITH CHECK (public.is_superadmin() AND hub_id = public.get_my_hub_id());

-- ── payroll_runs: hub-scope ALL access through staff.hub_id ──────────────────
-- Previously is_superadmin() allowed seeing payroll runs from every hub.

DROP POLICY IF EXISTS "Admins manage payroll runs"      ON public.payroll_runs;
DROP POLICY IF EXISTS "Superadmin manages payroll runs" ON public.payroll_runs;

CREATE POLICY "Admins manage payroll runs"
  ON public.payroll_runs FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.hub_id = public.get_my_hub_id()
    )
  );
