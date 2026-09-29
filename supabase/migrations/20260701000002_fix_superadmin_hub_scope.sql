-- Root cause: switch_hub_context only UPDATE'd hub_members. If the superadmin
-- had no row there (they weren't seeded), get_my_hub_id() returned NULL, and
-- RLS policies with `is_superadmin() OR (has_role() AND hub_scope)` short-circuited
-- on is_superadmin() = TRUE, letting the superadmin see all hubs' data simultaneously.
--
-- Fix in three parts:
--   1. UPSERT in switch_hub_context so hub switching always takes effect.
--   2. Seed a FutureLabs hub_members row for the superadmin as the default context.
--   3. Rewrite all affected policies to (is_superadmin() OR has_role()) AND hub_scope
--      — now safe because the superadmin always has a hub context row.

-- ── 1. Fix switch_hub_context ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.switch_hub_context(p_hub_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only superadmins can switch hub context';
  END IF;

  INSERT INTO public.hub_members (user_id, hub_id, hub_role)
  VALUES (auth.uid(), p_hub_id, 'owner')
  ON CONFLICT (user_id) DO UPDATE SET hub_id = p_hub_id, hub_role = 'owner';

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'switch_hub_context', 'hub', p_hub_id,
          jsonb_build_object('to_hub_id', p_hub_id, 'switched_at', now()));
END;
$$;

-- ── 2. Seed superadmin into hub_members (FutureLabs as default) ──────────────
INSERT INTO public.hub_members (user_id, hub_id, hub_role)
SELECT u.id, '00000000-0000-0000-0000-000000000001'::uuid, 'owner'
FROM auth.users u
WHERE u.email = 'manassehudim@gmail.com'
ON CONFLICT (user_id) DO UPDATE
  SET hub_id   = EXCLUDED.hub_id,
      hub_role = EXCLUDED.hub_role;

-- ── 3. Rewrite RLS policies ───────────────────────────────────────────────────

-- enrollments
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
      WHERE p.id = program_id AND p.hub_id = public.get_my_hub_id()
    )
  );

-- invoices
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
      WHERE e.id = enrollment_id AND p.hub_id = public.get_my_hub_id()
    )
  );

-- installments
DROP POLICY IF EXISTS "Admins manage installments" ON public.installments;
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
      WHERE i.id = invoice_id AND p.hub_id = public.get_my_hub_id()
    )
  );

-- cohorts
DROP POLICY IF EXISTS "Admins manage cohorts" ON public.cohorts;
CREATE POLICY "Admins manage cohorts"
  ON public.cohorts FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = cohorts.program_id AND p.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_id AND p.hub_id = public.get_my_hub_id()
    )
  );

-- cohort_students
DROP POLICY IF EXISTS "Admins manage cohort_students" ON public.cohort_students;
CREATE POLICY "Admins manage cohort_students"
  ON public.cohort_students FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_cohort_classroom_hub_id(cohort_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_cohort_classroom_hub_id(cohort_id) = public.get_my_hub_id()
  );

-- classroom_staff
DROP POLICY IF EXISTS "Admins manage classroom_staff" ON public.classroom_staff;
CREATE POLICY "Admins manage classroom_staff"
  ON public.classroom_staff FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  );

-- classroom_students
DROP POLICY IF EXISTS "Admins manage classroom_students" ON public.classroom_students;
CREATE POLICY "Admins manage classroom_students"
  ON public.classroom_students FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  );

-- classroom_permissions
DROP POLICY IF EXISTS "Admins manage classroom_permissions" ON public.classroom_permissions;
CREATE POLICY "Admins manage classroom_permissions"
  ON public.classroom_permissions FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_staff_hub_id(classroom_staff_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_staff_hub_id(classroom_staff_id) = public.get_my_hub_id()
  );

-- staff_invitations
DROP POLICY IF EXISTS "Admins manage staff_invitations" ON public.staff_invitations;
CREATE POLICY "Admins manage staff_invitations"
  ON public.staff_invitations FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  );
