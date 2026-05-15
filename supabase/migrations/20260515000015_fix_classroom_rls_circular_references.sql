-- Migration 013 replaced all inline classroom joins in admin policies with
-- EXISTS (SELECT 1 FROM classrooms c WHERE c.id = classroom_staff.classroom_id ...)
-- but classrooms has "Staff view assigned classrooms" that reads classroom_staff,
-- so: classroom_staff → classrooms → classroom_staff → ∞ recursion.
-- Postgres logs: "infinite recursion detected in policy for relation classrooms"
-- Fix: SECURITY DEFINER helper functions that read base tables, bypassing RLS.

-- ── Helper functions ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_classroom_hub_id(p_classroom_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT hub_id FROM classrooms WHERE id = p_classroom_id;
$$;

CREATE OR REPLACE FUNCTION public.get_classroom_staff_hub_id(p_cs_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.hub_id FROM classroom_staff cs JOIN classrooms c ON c.id = cs.classroom_id WHERE cs.id = p_cs_id;
$$;

CREATE OR REPLACE FUNCTION public.get_cohort_classroom_hub_id(p_cohort_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.hub_id FROM cohorts co JOIN classrooms c ON c.id = co.classroom_id WHERE co.id = p_cohort_id;
$$;

CREATE OR REPLACE FUNCTION public.get_assignment_hub_id(p_assignment_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.hub_id FROM assignments a JOIN classrooms c ON c.id = a.classroom_id WHERE a.id = p_assignment_id;
$$;

CREATE OR REPLACE FUNCTION public.get_lesson_hub_id(p_lesson_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.hub_id FROM lessons l JOIN classrooms c ON c.id = l.classroom_id WHERE l.id = p_lesson_id;
$$;

CREATE OR REPLACE FUNCTION public.get_curriculum_hub_id(p_curriculum_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    c.hub_id,
    (SELECT c2.hub_id FROM cohorts co JOIN classrooms c2 ON c2.id = co.classroom_id WHERE co.id = cur.cohort_id)
  )
  FROM curriculums cur LEFT JOIN classrooms c ON c.id = cur.classroom_id
  WHERE cur.id = p_curriculum_id;
$$;

CREATE OR REPLACE FUNCTION public.get_curriculum_week_hub_id(p_cw_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_curriculum_hub_id(cw.curriculum_id)
  FROM curriculum_weeks cw WHERE cw.id = p_cw_id;
$$;

-- ── classroom_staff ───────────────────────────────────────────────────────────
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

-- ── classroom_permissions ─────────────────────────────────────────────────────
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

-- ── classroom_students ────────────────────────────────────────────────────────
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

-- ── cohort_students ───────────────────────────────────────────────────────────
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

-- ── staff_invitations ─────────────────────────────────────────────────────────
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

-- ── assignments ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage assignments" ON public.assignments;
CREATE POLICY "Admins manage assignments"
  ON public.assignments FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  );

-- ── assignment_resources ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage assignment_resources" ON public.assignment_resources;
CREATE POLICY "Admins manage assignment_resources"
  ON public.assignment_resources FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_assignment_hub_id(assignment_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_assignment_hub_id(assignment_id) = public.get_my_hub_id()
  );

-- ── assignment_submissions ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage assignment_submissions" ON public.assignment_submissions;
CREATE POLICY "Admins manage assignment_submissions"
  ON public.assignment_submissions FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_assignment_hub_id(assignment_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_assignment_hub_id(assignment_id) = public.get_my_hub_id()
  );

-- ── attendance_sessions ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage attendance_sessions" ON public.attendance_sessions;
CREATE POLICY "Admins manage attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  );

-- ── attendance_records ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage attendance_records" ON public.attendance_records;
CREATE POLICY "Admins manage attendance_records"
  ON public.attendance_records FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  );

-- ── lessons ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage lessons" ON public.lessons;
CREATE POLICY "Admins manage lessons"
  ON public.lessons FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  );

-- ── lesson_materials ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage lesson_materials" ON public.lesson_materials;
CREATE POLICY "Admins manage lesson_materials"
  ON public.lesson_materials FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_lesson_hub_id(lesson_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_lesson_hub_id(lesson_id) = public.get_my_hub_id()
  );

-- ── curriculums ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage curriculums" ON public.curriculums;
CREATE POLICY "Admins manage curriculums"
  ON public.curriculums FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_curriculum_hub_id(id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_curriculum_hub_id(id) = public.get_my_hub_id()
  );

-- ── curriculum_weeks ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage curriculum_weeks" ON public.curriculum_weeks;
CREATE POLICY "Admins manage curriculum_weeks"
  ON public.curriculum_weeks FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_curriculum_hub_id(curriculum_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_curriculum_hub_id(curriculum_id) = public.get_my_hub_id()
  );

-- ── curriculum_lessons ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage curriculum_lessons" ON public.curriculum_lessons;
CREATE POLICY "Admins manage curriculum_lessons"
  ON public.curriculum_lessons FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_curriculum_week_hub_id(curriculum_week_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_curriculum_week_hub_id(curriculum_week_id) = public.get_my_hub_id()
  );

-- ── invoice_change_requests: table-qualify invoice_id to fix ambiguity ────────
DROP POLICY IF EXISTS "Admins manage invoice_change_requests" ON public.invoice_change_requests;
CREATE POLICY "Admins manage invoice_change_requests"
  ON public.invoice_change_requests FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.enrollments e ON e.id = i.enrollment_id
      JOIN public.programs p    ON p.id = e.program_id
      WHERE i.id = invoice_change_requests.invoice_id AND p.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.enrollments e ON e.id = i.enrollment_id
      JOIN public.programs p    ON p.id = e.program_id
      WHERE i.id = invoice_change_requests.invoice_id AND p.hub_id = public.get_my_hub_id()
    )
  );
