-- Backfill migration — documents work that was already applied directly to
-- production during the July 2026 RLS performance rework (see
-- 20260705000003/20260706000003 for the initplan-wrap-then-rollback pair
-- that preceded it) but was never committed as a local migration file. The
-- SQL below was captured verbatim from the live database's system catalogs
-- (pg_get_functiondef / pg_policies) so it reflects exactly what has been
-- running in production since 2026-07-09 — it is not a reconstruction from
-- memory. Applied here as CREATE OR REPLACE / DROP+CREATE so it is a no-op
-- against the current database, and only matters for anyone rebuilding the
-- schema from migrations from scratch.
--
-- Corresponds to remote-only migration history entries:
--   classroom_rls_access_helpers, schedules_flat_rls, assignments_flat_rls,
--   attendance_flat_rls, assignment_submissions_flat_rls,
--   presentations_flat_rls, content_hierarchy_flat_rls, field_values_flat_rls

-- ---------------------------------------------------------------------
-- Access helper functions — flat SECURITY DEFINER checks that replaced
-- deeply nested EXISTS policies (the shape that caused the 2026-07-06
-- planning-time outage) so the planner no longer expands each referenced
-- table's own RLS policies recursively.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.classroom_read_access(_classroom_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  return is_superadmin()
    or exists (
      select 1 from public.classroom_students cs
      where cs.classroom_id = _classroom_id and cs.student_id = auth.uid())
    or exists (
      select 1 from public.classroom_staff st
      where st.classroom_id = _classroom_id and st.user_id = auth.uid()
        and st.status = 'active')
    or exists (
      select 1 from public.cohort_students cst
      join public.cohorts co on co.id = cst.cohort_id
      where co.classroom_id = _classroom_id and cst.student_id = auth.uid())
    or exists (
      select 1 from public.classrooms cl
      join public.enrollments e on e.program_id = cl.program_id
      where cl.id = _classroom_id and e.user_id = auth.uid()
        and e.enrollment_status not in ('cancelled', 'withdrawn'))
    or (has_role(auth.uid(), 'admin'::app_role) and exists (
      select 1 from public.classrooms c
      where c.id = _classroom_id and c.hub_id = get_my_hub_id()));
end; $$;

CREATE OR REPLACE FUNCTION public.classroom_staff_access(_classroom_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  return is_superadmin()
    or exists (
      select 1 from public.classroom_staff st
      where st.classroom_id = _classroom_id and st.user_id = auth.uid()
        and st.status = 'active')
    or (has_role(auth.uid(), 'admin'::app_role) and exists (
      select 1 from public.classrooms c
      where c.id = _classroom_id and c.hub_id = get_my_hub_id()));
end; $$;

CREATE OR REPLACE FUNCTION public.classroom_manage_access(_classroom_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  return is_superadmin()
    or exists (
      select 1 from public.classroom_staff st
      join public.classroom_permissions cp on cp.classroom_staff_id = st.id
      where st.classroom_id = _classroom_id and st.user_id = auth.uid()
        and st.status = 'active' and cp.can_create_assignments = true)
    or (has_role(auth.uid(), 'admin'::app_role) and exists (
      select 1 from public.classrooms c
      where c.id = _classroom_id and c.hub_id = get_my_hub_id()));
end; $$;

CREATE OR REPLACE FUNCTION public.classroom_attendance_access(_classroom_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  return is_superadmin()
    or exists (
      select 1 from public.classroom_staff st
      join public.classroom_permissions cp on cp.classroom_staff_id = st.id
      where st.classroom_id = _classroom_id and st.user_id = auth.uid()
        and st.status = 'active' and cp.can_start_attendance = true)
    or (has_role(auth.uid(), 'admin'::app_role) and exists (
      select 1 from public.classrooms c
      where c.id = _classroom_id and c.hub_id = get_my_hub_id()));
end; $$;

CREATE OR REPLACE FUNCTION public.classroom_admin_access(_classroom_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  return is_superadmin()
    or (has_role(auth.uid(), 'admin'::app_role) and exists (
      select 1 from public.classrooms c
      where c.id = _classroom_id and c.hub_id = get_my_hub_id()));
end; $$;

CREATE OR REPLACE FUNCTION public.cohort_is_mine(_cohort_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  return exists (
      select 1 from public.cohort_students cst
      where cst.cohort_id = _cohort_id and cst.student_id = auth.uid())
    or exists (
      select 1 from public.enrollments e
      where e.cohort_id = _cohort_id and e.user_id = auth.uid()
        and e.enrollment_status not in ('cancelled', 'withdrawn'));
end; $$;

-- Content-hierarchy lookups (curricula -> tracks -> modules -> units ->
-- lessons) so each level's policy can call classroom_read_access /
-- classroom_staff_access without re-joining the whole chain inline.

CREATE OR REPLACE FUNCTION public.curriculum_classroom_id(_curriculum_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  return (select cu.classroom_id from public.curricula cu where cu.id = _curriculum_id);
end; $$;

CREATE OR REPLACE FUNCTION public.track_classroom_id(_track_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  return (
    select cu.classroom_id
    from public.tracks t
    join public.curricula cu on cu.id = t.curriculum_id
    where t.id = _track_id);
end; $$;

CREATE OR REPLACE FUNCTION public.module_classroom_id(_module_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  return (
    select cu.classroom_id
    from public.modules m
    join public.tracks t on t.id = m.track_id
    join public.curricula cu on cu.id = t.curriculum_id
    where m.id = _module_id);
end; $$;

CREATE OR REPLACE FUNCTION public.unit_classroom_id(_unit_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  return (
    select cu.classroom_id
    from public.units u
    join public.modules m on m.id = u.module_id
    join public.tracks t on t.id = m.track_id
    join public.curricula cu on cu.id = t.curriculum_id
    where u.id = _unit_id);
end; $$;

CREATE OR REPLACE FUNCTION public.assignment_classroom_id(_assignment_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  return (select a.classroom_id from public.assignments a where a.id = _assignment_id);
end; $$;

CREATE OR REPLACE FUNCTION public.presentation_classroom_id(_presentation_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  return (select p.classroom_id from public.presentations p where p.id = _presentation_id);
end; $$;

-- ---------------------------------------------------------------------
-- schedules
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff and admins manage schedules" ON public.schedules;
CREATE POLICY "Staff and admins manage schedules" ON public.schedules FOR ALL
  USING (classroom_staff_access(classroom_id)) WITH CHECK (classroom_staff_access(classroom_id));

DROP POLICY IF EXISTS "Students read their schedules" ON public.schedules;
CREATE POLICY "Students read their schedules" ON public.schedules FOR SELECT
  USING (classroom_read_access(classroom_id) AND ((cohort_id IS NULL) OR cohort_is_mine(cohort_id)));

DROP POLICY IF EXISTS "Superadmin full access on schedules" ON public.schedules;
CREATE POLICY "Superadmin full access on schedules" ON public.schedules FOR ALL
  USING (is_superadmin()) WITH CHECK (is_superadmin());

-- ---------------------------------------------------------------------
-- assignments / assignment_submissions
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff and admins manage assignments" ON public.assignments;
CREATE POLICY "Staff and admins manage assignments" ON public.assignments FOR ALL
  USING (classroom_manage_access(classroom_id)) WITH CHECK (classroom_manage_access(classroom_id));

DROP POLICY IF EXISTS "Staff view classroom assignments" ON public.assignments;
CREATE POLICY "Staff view classroom assignments" ON public.assignments FOR SELECT
  USING (classroom_staff_access(classroom_id));

DROP POLICY IF EXISTS "Students view published assignments in their classroom" ON public.assignments;
CREATE POLICY "Students view published assignments in their classroom" ON public.assignments FOR SELECT
  USING ((status = 'published') AND classroom_read_access(classroom_id) AND ((cohort_id IS NULL) OR cohort_is_mine(cohort_id)));

DROP POLICY IF EXISTS "Admins manage submissions" ON public.assignment_submissions;
CREATE POLICY "Admins manage submissions" ON public.assignment_submissions FOR ALL
  USING (classroom_admin_access(assignment_classroom_id(assignment_id)))
  WITH CHECK (classroom_admin_access(assignment_classroom_id(assignment_id)));

DROP POLICY IF EXISTS "Students manage own submissions" ON public.assignment_submissions;
CREATE POLICY "Students manage own submissions" ON public.assignment_submissions FOR ALL
  USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Teaching staff grade submissions" ON public.assignment_submissions;
CREATE POLICY "Teaching staff grade submissions" ON public.assignment_submissions FOR UPDATE
  USING (classroom_manage_access(assignment_classroom_id(assignment_id)));

DROP POLICY IF EXISTS "Teaching staff view classroom submissions" ON public.assignment_submissions;
CREATE POLICY "Teaching staff view classroom submissions" ON public.assignment_submissions FOR SELECT
  USING (classroom_staff_access(assignment_classroom_id(assignment_id)));

-- ---------------------------------------------------------------------
-- attendance_sessions / attendance_records
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff and admins manage attendance sessions" ON public.attendance_sessions;
CREATE POLICY "Staff and admins manage attendance sessions" ON public.attendance_sessions FOR ALL
  USING (classroom_attendance_access(classroom_id)) WITH CHECK (classroom_attendance_access(classroom_id));

DROP POLICY IF EXISTS "Students read open sessions" ON public.attendance_sessions;
CREATE POLICY "Students read open sessions" ON public.attendance_sessions FOR SELECT
  USING ((status = 'open') AND (classroom_read_access(classroom_id) OR ((cohort_id IS NOT NULL) AND cohort_is_mine(cohort_id))));

DROP POLICY IF EXISTS "Admins manage attendance_records" ON public.attendance_records;
CREATE POLICY "Admins manage attendance_records" ON public.attendance_records FOR ALL
  USING (classroom_admin_access(classroom_id)) WITH CHECK (classroom_admin_access(classroom_id));

DROP POLICY IF EXISTS "Staff view classroom attendance" ON public.attendance_records;
CREATE POLICY "Staff view classroom attendance" ON public.attendance_records FOR SELECT
  USING (classroom_staff_access(classroom_id));

DROP POLICY IF EXISTS "Students insert own attendance" ON public.attendance_records;
CREATE POLICY "Students insert own attendance" ON public.attendance_records FOR INSERT
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Students view own attendance" ON public.attendance_records;
CREATE POLICY "Students view own attendance" ON public.attendance_records FOR SELECT
  USING (student_id = auth.uid());

-- ---------------------------------------------------------------------
-- content hierarchy: curricula -> tracks -> modules -> units -> lessons
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Members read curricula" ON public.curricula;
CREATE POLICY "Members read curricula" ON public.curricula FOR SELECT USING (classroom_read_access(classroom_id));
DROP POLICY IF EXISTS "Staff and admins manage curricula" ON public.curricula;
CREATE POLICY "Staff and admins manage curricula" ON public.curricula FOR ALL
  USING (classroom_staff_access(classroom_id)) WITH CHECK (classroom_staff_access(classroom_id));
DROP POLICY IF EXISTS "Superadmin full access on curricula" ON public.curricula;
CREATE POLICY "Superadmin full access on curricula" ON public.curricula FOR ALL
  USING (is_superadmin()) WITH CHECK (is_superadmin());

DROP POLICY IF EXISTS "Members read tracks" ON public.tracks;
CREATE POLICY "Members read tracks" ON public.tracks FOR SELECT USING (classroom_read_access(curriculum_classroom_id(curriculum_id)));
DROP POLICY IF EXISTS "Staff and admins manage tracks" ON public.tracks;
CREATE POLICY "Staff and admins manage tracks" ON public.tracks FOR ALL
  USING (classroom_staff_access(curriculum_classroom_id(curriculum_id))) WITH CHECK (classroom_staff_access(curriculum_classroom_id(curriculum_id)));
DROP POLICY IF EXISTS "Superadmin full access on tracks" ON public.tracks;
CREATE POLICY "Superadmin full access on tracks" ON public.tracks FOR ALL
  USING (is_superadmin()) WITH CHECK (is_superadmin());

DROP POLICY IF EXISTS "Members read modules" ON public.modules;
CREATE POLICY "Members read modules" ON public.modules FOR SELECT USING (classroom_read_access(track_classroom_id(track_id)));
DROP POLICY IF EXISTS "Staff and admins manage modules" ON public.modules;
CREATE POLICY "Staff and admins manage modules" ON public.modules FOR ALL
  USING (classroom_staff_access(track_classroom_id(track_id))) WITH CHECK (classroom_staff_access(track_classroom_id(track_id)));
DROP POLICY IF EXISTS "Superadmin full access on modules" ON public.modules;
CREATE POLICY "Superadmin full access on modules" ON public.modules FOR ALL
  USING (is_superadmin()) WITH CHECK (is_superadmin());

DROP POLICY IF EXISTS "Members read units" ON public.units;
CREATE POLICY "Members read units" ON public.units FOR SELECT USING (classroom_read_access(module_classroom_id(module_id)));
DROP POLICY IF EXISTS "Staff and admins manage units" ON public.units;
CREATE POLICY "Staff and admins manage units" ON public.units FOR ALL
  USING (classroom_staff_access(module_classroom_id(module_id))) WITH CHECK (classroom_staff_access(module_classroom_id(module_id)));
DROP POLICY IF EXISTS "Superadmin full access on units" ON public.units;
CREATE POLICY "Superadmin full access on units" ON public.units FOR ALL
  USING (is_superadmin()) WITH CHECK (is_superadmin());

DROP POLICY IF EXISTS "Members read lessons" ON public.lessons;
CREATE POLICY "Members read lessons" ON public.lessons FOR SELECT USING (classroom_read_access(unit_classroom_id(unit_id)));
DROP POLICY IF EXISTS "Staff and admins manage lessons" ON public.lessons;
CREATE POLICY "Staff and admins manage lessons" ON public.lessons FOR ALL
  USING (classroom_staff_access(unit_classroom_id(unit_id))) WITH CHECK (classroom_staff_access(unit_classroom_id(unit_id)));
DROP POLICY IF EXISTS "Superadmin full access on lessons" ON public.lessons;
CREATE POLICY "Superadmin full access on lessons" ON public.lessons FOR ALL
  USING (is_superadmin()) WITH CHECK (is_superadmin());

-- ---------------------------------------------------------------------
-- presentations / presentation_grades
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Classroom staff view presentations" ON public.presentations;
CREATE POLICY "Classroom staff view presentations" ON public.presentations FOR SELECT
  USING (classroom_staff_access(classroom_id));

DROP POLICY IF EXISTS "Staff and admins manage presentations" ON public.presentations;
CREATE POLICY "Staff and admins manage presentations" ON public.presentations FOR ALL
  USING (classroom_manage_access(classroom_id)) WITH CHECK (classroom_manage_access(classroom_id));

DROP POLICY IF EXISTS "Students view published presentations in their cohort" ON public.presentations;
CREATE POLICY "Students view published presentations in their cohort" ON public.presentations FOR SELECT
  USING ((status = ANY (ARRAY['published'::text, 'completed'::text])) AND (cohort_id IS NOT NULL) AND cohort_is_mine(cohort_id));

DROP POLICY IF EXISTS "Staff and admins manage presentation grades" ON public.presentation_grades;
CREATE POLICY "Staff and admins manage presentation grades" ON public.presentation_grades FOR ALL
  USING (classroom_manage_access(presentation_classroom_id(presentation_id)))
  WITH CHECK (classroom_manage_access(presentation_classroom_id(presentation_id)));

DROP POLICY IF EXISTS "Students view own presentation grade" ON public.presentation_grades;
CREATE POLICY "Students view own presentation grade" ON public.presentation_grades FOR SELECT
  USING (student_id = auth.uid());

-- ---------------------------------------------------------------------
-- field_values (enrollment_is_mine / enrollment_in_my_hub already exist,
-- defined in 20260707000001_finance_rls_helpers_stop_policy_expansion.sql)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage field values" ON public.field_values;
CREATE POLICY "Admins manage field values" ON public.field_values FOR ALL
  USING ((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND enrollment_in_my_hub(enrollment_id))
  WITH CHECK ((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND enrollment_in_my_hub(enrollment_id));

DROP POLICY IF EXISTS "Public can insert field values for pending enrollments" ON public.field_values;
CREATE POLICY "Public can insert field values for pending enrollments" ON public.field_values FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM enrollments
    WHERE enrollments.id = field_values.enrollment_id
      AND enrollments.enrollment_status = 'pending'
      AND enrollments.user_id IS NULL));

DROP POLICY IF EXISTS "Public can update field values for unlinked enrollments" ON public.field_values;
CREATE POLICY "Public can update field values for unlinked enrollments" ON public.field_values FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.id = field_values.enrollment_id AND e.user_id IS NULL));

DROP POLICY IF EXISTS "Students can manage own field values" ON public.field_values;
CREATE POLICY "Students can manage own field values" ON public.field_values FOR ALL
  USING (enrollment_is_mine(enrollment_id));

DROP POLICY IF EXISTS "Superadmin manages all field values" ON public.field_values;
CREATE POLICY "Superadmin manages all field values" ON public.field_values FOR ALL
  USING (is_superadmin()) WITH CHECK (is_superadmin());
