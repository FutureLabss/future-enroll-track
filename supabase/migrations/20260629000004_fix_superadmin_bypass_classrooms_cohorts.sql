-- Fix the same superadmin RLS bypass bug from 20260629000002, now for classroom
-- and cohort tables. The broken pattern:
--   (is_superadmin() OR has_role(...)) AND hub_fn() = get_my_hub_id()
-- For superadmin get_my_hub_id() returns NULL, so NULL = anything is FALSE,
-- blocking the superadmin despite the OR. Fix: wrap hub check in the non-superadmin
-- branch only.
--
-- Tables fixed: cohorts, cohort_students, classroom_staff, classroom_students,
--               classroom_permissions, staff_invitations

-- ── cohorts ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage cohorts" ON public.cohorts;
CREATE POLICY "Admins manage cohorts"
  ON public.cohorts FOR ALL
  USING (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.programs p
        WHERE p.id = cohorts.program_id AND p.hub_id = public.get_my_hub_id()
      )
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.programs p
        WHERE p.id = program_id AND p.hub_id = public.get_my_hub_id()
      )
    )
  );

-- ── cohort_students ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage cohort_students" ON public.cohort_students;
CREATE POLICY "Admins manage cohort_students"
  ON public.cohort_students FOR ALL
  USING (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND public.get_cohort_classroom_hub_id(cohort_id) = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND public.get_cohort_classroom_hub_id(cohort_id) = public.get_my_hub_id()
    )
  );

-- ── classroom_staff ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage classroom_staff" ON public.classroom_staff;
CREATE POLICY "Admins manage classroom_staff"
  ON public.classroom_staff FOR ALL
  USING (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
    )
  );

-- ── classroom_students ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage classroom_students" ON public.classroom_students;
CREATE POLICY "Admins manage classroom_students"
  ON public.classroom_students FOR ALL
  USING (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
    )
  );

-- ── classroom_permissions ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage classroom_permissions" ON public.classroom_permissions;
CREATE POLICY "Admins manage classroom_permissions"
  ON public.classroom_permissions FOR ALL
  USING (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND public.get_classroom_staff_hub_id(classroom_staff_id) = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND public.get_classroom_staff_hub_id(classroom_staff_id) = public.get_my_hub_id()
    )
  );

-- ── staff_invitations ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage staff_invitations" ON public.staff_invitations;
CREATE POLICY "Admins manage staff_invitations"
  ON public.staff_invitations FOR ALL
  USING (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
    )
  );
