-- Rollback script for the classroom RLS rework: restores every policy on the 13
-- scoped tables to the exact state captured from PRODUCTION on 2026-07-09 (the same
-- snapshot 20260709000001 stores in _rls_policy_backup_classroom).
-- All captured policies were PERMISSIVE.
--
-- To restore ONE table, run just its section (each section is self-contained:
-- drop-all block + creates). To restore everything, run the whole file.

-- ==== assignment_submissions ================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'assignment_submissions'
  loop
    execute format('drop policy %I on public.assignment_submissions', p.policyname);
  end loop;
end $$;

create policy "Admins manage submissions"
  on public.assignment_submissions as permissive for all
  to public
  using (((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND (get_assignment_hub_id(assignment_id) = get_my_hub_id())))
  with check (((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND (get_assignment_hub_id(assignment_id) = get_my_hub_id())));

create policy "Students manage own submissions"
  on public.assignment_submissions as permissive for all
  to public
  using ((student_id = auth.uid()))
  with check ((student_id = auth.uid()));

create policy "Teaching staff grade submissions"
  on public.assignment_submissions as permissive for update
  to public
  using ((EXISTS ( SELECT 1
   FROM ((assignments a
     JOIN classroom_staff cs ON ((cs.classroom_id = a.classroom_id)))
     JOIN classroom_permissions cp ON ((cp.classroom_staff_id = cs.id)))
  WHERE ((a.id = assignment_submissions.assignment_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text) AND (cp.can_create_assignments = true)))));

create policy "Teaching staff view classroom submissions"
  on public.assignment_submissions as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classroom_staff cs ON ((cs.classroom_id = a.classroom_id)))
  WHERE ((a.id = assignment_submissions.assignment_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text)))));

-- ==== assignments ===========================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'assignments'
  loop
    execute format('drop policy %I on public.assignments', p.policyname);
  end loop;
end $$;

create policy "Admins manage assignments"
  on public.assignments as permissive for all
  to public
  using ((is_superadmin() OR (has_role(auth.uid(), 'admin'::app_role) AND (get_classroom_hub_id(classroom_id) = get_my_hub_id()))))
  with check ((is_superadmin() OR (has_role(auth.uid(), 'admin'::app_role) AND (get_classroom_hub_id(classroom_id) = get_my_hub_id()))));

create policy "Classroom staff view assignments"
  on public.assignments as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM classroom_staff cs
  WHERE ((cs.classroom_id = assignments.classroom_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text)))));

create policy "Staff read classroom assignments"
  on public.assignments as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM classroom_staff cs
  WHERE ((cs.classroom_id = assignments.classroom_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text)))));

create policy "Students view published assignments in their classroom"
  on public.assignments as permissive for select
  to public
  using (((status = 'published'::text) AND ((EXISTS ( SELECT 1
   FROM classroom_students cs
  WHERE ((cs.classroom_id = assignments.classroom_id) AND (cs.student_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (cohort_students cst
     JOIN cohorts co ON ((co.id = cst.cohort_id)))
  WHERE ((co.classroom_id = assignments.classroom_id) AND (cst.student_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (classrooms cl
     JOIN enrollments e ON ((e.program_id = cl.program_id)))
  WHERE ((cl.id = assignments.classroom_id) AND (e.user_id = auth.uid()) AND (e.enrollment_status <> ALL (ARRAY['cancelled'::text, 'withdrawn'::text])))))) AND ((cohort_id IS NULL) OR (EXISTS ( SELECT 1
   FROM cohort_students cst
  WHERE ((cst.cohort_id = assignments.cohort_id) AND (cst.student_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (enrollments e
     JOIN classrooms cl ON ((cl.program_id = e.program_id)))
  WHERE ((cl.id = assignments.classroom_id) AND (e.user_id = auth.uid()) AND (e.cohort_id = assignments.cohort_id) AND (e.enrollment_status <> ALL (ARRAY['cancelled'::text, 'withdrawn'::text]))))))));

create policy "Teaching staff manage classroom assignments"
  on public.assignments as permissive for all
  to public
  using ((EXISTS ( SELECT 1
   FROM (classroom_staff cs
     JOIN classroom_permissions cp ON ((cp.classroom_staff_id = cs.id)))
  WHERE ((cs.classroom_id = assignments.classroom_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text) AND (cp.can_create_assignments = true)))));

create policy "Teaching staff view classroom assignments"
  on public.assignments as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM classroom_staff cs
  WHERE ((cs.classroom_id = assignments.classroom_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text) AND (cs.staff_type = 'teaching'::text)))));

-- ==== attendance_records ====================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'attendance_records'
  loop
    execute format('drop policy %I on public.attendance_records', p.policyname);
  end loop;
end $$;

create policy "Admins manage attendance_records"
  on public.attendance_records as permissive for all
  to public
  using (((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND (get_classroom_hub_id(classroom_id) = get_my_hub_id())))
  with check (((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND (get_classroom_hub_id(classroom_id) = get_my_hub_id())));

create policy "Staff view classroom attendance"
  on public.attendance_records as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM classroom_staff cs
  WHERE ((cs.classroom_id = attendance_records.classroom_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text)))));

create policy "Students insert own attendance"
  on public.attendance_records as permissive for insert
  to public
  with check ((student_id = auth.uid()));

create policy "Students view own attendance"
  on public.attendance_records as permissive for select
  to public
  using ((student_id = auth.uid()));

-- ==== attendance_sessions ===================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'attendance_sessions'
  loop
    execute format('drop policy %I on public.attendance_sessions', p.policyname);
  end loop;
end $$;

create policy "Admins manage attendance_sessions"
  on public.attendance_sessions as permissive for all
  to public
  using (((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND (get_classroom_hub_id(classroom_id) = get_my_hub_id())))
  with check (((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND (get_classroom_hub_id(classroom_id) = get_my_hub_id())));

create policy "Students read open sessions"
  on public.attendance_sessions as permissive for select
  to public
  using (((status = 'open'::text) AND ((EXISTS ( SELECT 1
   FROM classroom_students cs
  WHERE ((cs.classroom_id = attendance_sessions.classroom_id) AND (cs.student_id = auth.uid())))) OR ((cohort_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM cohort_students cst
  WHERE ((cst.cohort_id = attendance_sessions.cohort_id) AND (cst.student_id = auth.uid()))))))));

create policy "Teaching staff manage own classroom sessions"
  on public.attendance_sessions as permissive for all
  to public
  using ((EXISTS ( SELECT 1
   FROM (classroom_staff cs
     JOIN classroom_permissions cp ON ((cp.classroom_staff_id = cs.id)))
  WHERE ((cs.classroom_id = attendance_sessions.classroom_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text) AND (cp.can_start_attendance = true)))));

-- ==== curricula =============================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'curricula'
  loop
    execute format('drop policy %I on public.curricula', p.policyname);
  end loop;
end $$;

create policy "Admins manage curricula in their hub"
  on public.curricula as permissive for all
  to public
  using ((has_role(auth.uid(), 'admin'::app_role) AND (EXISTS ( SELECT 1
   FROM classrooms c
  WHERE ((c.id = curricula.classroom_id) AND (c.hub_id = get_my_hub_id()))))))
  with check ((has_role(auth.uid(), 'admin'::app_role) AND (EXISTS ( SELECT 1
   FROM classrooms c
  WHERE ((c.id = curricula.classroom_id) AND (c.hub_id = get_my_hub_id()))))));

create policy "Staff manage curricula in their classroom"
  on public.curricula as permissive for all
  to public
  using ((EXISTS ( SELECT 1
   FROM classroom_staff cs
  WHERE ((cs.classroom_id = curricula.classroom_id) AND (cs.user_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM classroom_staff cs
  WHERE ((cs.classroom_id = curricula.classroom_id) AND (cs.user_id = auth.uid())))));

create policy "Staff view curricula in their classroom"
  on public.curricula as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM classroom_staff cs
  WHERE ((cs.classroom_id = curricula.classroom_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text)))));

create policy "Students read curricula for their programs"
  on public.curricula as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM (classrooms c
     JOIN enrollments e ON ((e.program_id = c.program_id)))
  WHERE ((c.id = curricula.classroom_id) AND (e.user_id = auth.uid()) AND (e.enrollment_status <> ALL (ARRAY['cancelled'::text, 'withdrawn'::text]))))));

create policy "Superadmin full access on curricula"
  on public.curricula as permissive for all
  to public
  using (is_superadmin())
  with check (is_superadmin());

-- ==== field_values ==========================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'field_values'
  loop
    execute format('drop policy %I on public.field_values', p.policyname);
  end loop;
end $$;

create policy "Admins manage field values"
  on public.field_values as permissive for all
  to public
  using (((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND (EXISTS ( SELECT 1
   FROM (enrollments e
     JOIN programs p ON ((p.id = e.program_id)))
  WHERE ((e.id = field_values.enrollment_id) AND (p.hub_id = get_my_hub_id()))))))
  with check (((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND (EXISTS ( SELECT 1
   FROM (enrollments e
     JOIN programs p ON ((p.id = e.program_id)))
  WHERE ((e.id = field_values.enrollment_id) AND (p.hub_id = get_my_hub_id()))))));

create policy "Public can insert field values for pending enrollments"
  on public.field_values as permissive for insert
  to anon
  with check ((EXISTS ( SELECT 1
   FROM enrollments
  WHERE ((enrollments.id = field_values.enrollment_id) AND (enrollments.enrollment_status = 'pending'::text) AND (enrollments.user_id IS NULL)))));

create policy "Public can update field values for unlinked enrollments"
  on public.field_values as permissive for update
  to public
  using ((EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.id = field_values.enrollment_id) AND (e.user_id IS NULL)))));

create policy "Students can manage own field values"
  on public.field_values as permissive for all
  to public
  using ((EXISTS ( SELECT 1
   FROM enrollments
  WHERE ((enrollments.id = field_values.enrollment_id) AND (enrollments.user_id = auth.uid())))));

create policy "Superadmin manages all field values"
  on public.field_values as permissive for all
  to public
  using (is_superadmin())
  with check (is_superadmin());

-- ==== lessons ===============================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'lessons'
  loop
    execute format('drop policy %I on public.lessons', p.policyname);
  end loop;
end $$;

create policy "Admins manage lessons in their hub"
  on public.lessons as permissive for all
  to public
  using ((has_role(auth.uid(), 'admin'::app_role) AND (EXISTS ( SELECT 1
   FROM ((((units u
     JOIN modules m ON ((m.id = u.module_id)))
     JOIN tracks t ON ((t.id = m.track_id)))
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classrooms c ON ((c.id = cu.classroom_id)))
  WHERE ((u.id = lessons.unit_id) AND (c.hub_id = get_my_hub_id()))))))
  with check ((has_role(auth.uid(), 'admin'::app_role) AND (EXISTS ( SELECT 1
   FROM ((((units u
     JOIN modules m ON ((m.id = u.module_id)))
     JOIN tracks t ON ((t.id = m.track_id)))
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classrooms c ON ((c.id = cu.classroom_id)))
  WHERE ((u.id = lessons.unit_id) AND (c.hub_id = get_my_hub_id()))))));

create policy "Staff manage lessons in their classroom"
  on public.lessons as permissive for all
  to public
  using ((EXISTS ( SELECT 1
   FROM ((((units u
     JOIN modules m ON ((m.id = u.module_id)))
     JOIN tracks t ON ((t.id = m.track_id)))
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classroom_staff cs ON ((cs.classroom_id = cu.classroom_id)))
  WHERE ((u.id = lessons.unit_id) AND (cs.user_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM ((((units u
     JOIN modules m ON ((m.id = u.module_id)))
     JOIN tracks t ON ((t.id = m.track_id)))
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classroom_staff cs ON ((cs.classroom_id = cu.classroom_id)))
  WHERE ((u.id = lessons.unit_id) AND (cs.user_id = auth.uid())))));

create policy "Staff view lessons in their classroom"
  on public.lessons as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM ((((units u
     JOIN modules m ON ((m.id = u.module_id)))
     JOIN tracks t ON ((t.id = m.track_id)))
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classroom_staff cs ON ((cs.classroom_id = cu.classroom_id)))
  WHERE ((u.id = lessons.unit_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text)))));

create policy "Students read lessons for their programs"
  on public.lessons as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM (((((units u
     JOIN modules m ON ((m.id = u.module_id)))
     JOIN tracks t ON ((t.id = m.track_id)))
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classrooms cl ON ((cl.id = cu.classroom_id)))
     JOIN enrollments e ON ((e.program_id = cl.program_id)))
  WHERE ((u.id = lessons.unit_id) AND (e.user_id = auth.uid()) AND (e.enrollment_status <> ALL (ARRAY['cancelled'::text, 'withdrawn'::text]))))));

create policy "Superadmin full access on lessons"
  on public.lessons as permissive for all
  to public
  using (is_superadmin())
  with check (is_superadmin());

-- ==== modules ===============================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'modules'
  loop
    execute format('drop policy %I on public.modules', p.policyname);
  end loop;
end $$;

create policy "Admins manage modules in their hub"
  on public.modules as permissive for all
  to public
  using ((has_role(auth.uid(), 'admin'::app_role) AND (EXISTS ( SELECT 1
   FROM ((tracks t
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classrooms c ON ((c.id = cu.classroom_id)))
  WHERE ((t.id = modules.track_id) AND (c.hub_id = get_my_hub_id()))))))
  with check ((has_role(auth.uid(), 'admin'::app_role) AND (EXISTS ( SELECT 1
   FROM ((tracks t
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classrooms c ON ((c.id = cu.classroom_id)))
  WHERE ((t.id = modules.track_id) AND (c.hub_id = get_my_hub_id()))))));

create policy "Staff manage modules in their classroom"
  on public.modules as permissive for all
  to public
  using ((EXISTS ( SELECT 1
   FROM ((tracks t
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classroom_staff cs ON ((cs.classroom_id = cu.classroom_id)))
  WHERE ((t.id = modules.track_id) AND (cs.user_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM ((tracks t
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classroom_staff cs ON ((cs.classroom_id = cu.classroom_id)))
  WHERE ((t.id = modules.track_id) AND (cs.user_id = auth.uid())))));

create policy "Staff view modules in their classroom"
  on public.modules as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM ((tracks t
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classroom_staff cs ON ((cs.classroom_id = cu.classroom_id)))
  WHERE ((t.id = modules.track_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text)))));

create policy "Students read modules for their programs"
  on public.modules as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM (((tracks t
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classrooms cl ON ((cl.id = cu.classroom_id)))
     JOIN enrollments e ON ((e.program_id = cl.program_id)))
  WHERE ((t.id = modules.track_id) AND (e.user_id = auth.uid()) AND (e.enrollment_status <> ALL (ARRAY['cancelled'::text, 'withdrawn'::text]))))));

create policy "Superadmin full access on modules"
  on public.modules as permissive for all
  to public
  using (is_superadmin())
  with check (is_superadmin());

-- ==== presentation_grades ===================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'presentation_grades'
  loop
    execute format('drop policy %I on public.presentation_grades', p.policyname);
  end loop;
end $$;

create policy "Admins manage presentation_grades"
  on public.presentation_grades as permissive for all
  to public
  using (((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND (EXISTS ( SELECT 1
   FROM presentations p
  WHERE ((p.id = presentation_grades.presentation_id) AND (get_classroom_hub_id(p.classroom_id) = get_my_hub_id()))))))
  with check (((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND (EXISTS ( SELECT 1
   FROM presentations p
  WHERE ((p.id = presentation_grades.presentation_id) AND (get_classroom_hub_id(p.classroom_id) = get_my_hub_id()))))));

create policy "Students view own presentation grade"
  on public.presentation_grades as permissive for select
  to public
  using ((student_id = auth.uid()));

create policy "Teaching staff grade presentations"
  on public.presentation_grades as permissive for all
  to public
  using ((EXISTS ( SELECT 1
   FROM ((presentations p
     JOIN classroom_staff cs ON ((cs.classroom_id = p.classroom_id)))
     JOIN classroom_permissions cp ON ((cp.classroom_staff_id = cs.id)))
  WHERE ((p.id = presentation_grades.presentation_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text) AND (cp.can_create_assignments = true)))))
  with check ((EXISTS ( SELECT 1
   FROM ((presentations p
     JOIN classroom_staff cs ON ((cs.classroom_id = p.classroom_id)))
     JOIN classroom_permissions cp ON ((cp.classroom_staff_id = cs.id)))
  WHERE ((p.id = presentation_grades.presentation_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text) AND (cp.can_create_assignments = true)))));

-- ==== presentations =========================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'presentations'
  loop
    execute format('drop policy %I on public.presentations', p.policyname);
  end loop;
end $$;

create policy "Admins manage presentations"
  on public.presentations as permissive for all
  to public
  using (((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND (get_classroom_hub_id(classroom_id) = get_my_hub_id())))
  with check (((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND (get_classroom_hub_id(classroom_id) = get_my_hub_id())));

create policy "Classroom staff view presentations"
  on public.presentations as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM classroom_staff cs
  WHERE ((cs.classroom_id = presentations.classroom_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text)))));

create policy "Students view published presentations in their cohort"
  on public.presentations as permissive for select
  to public
  using (((status = ANY (ARRAY['published'::text, 'completed'::text])) AND (EXISTS ( SELECT 1
   FROM cohort_students cst
  WHERE ((cst.cohort_id = presentations.cohort_id) AND (cst.student_id = auth.uid()))))));

create policy "Teaching staff manage classroom presentations"
  on public.presentations as permissive for all
  to public
  using ((EXISTS ( SELECT 1
   FROM (classroom_staff cs
     JOIN classroom_permissions cp ON ((cp.classroom_staff_id = cs.id)))
  WHERE ((cs.classroom_id = presentations.classroom_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text) AND (cp.can_create_assignments = true)))))
  with check ((EXISTS ( SELECT 1
   FROM (classroom_staff cs
     JOIN classroom_permissions cp ON ((cp.classroom_staff_id = cs.id)))
  WHERE ((cs.classroom_id = presentations.classroom_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text) AND (cp.can_create_assignments = true)))));

-- ==== schedules =============================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'schedules'
  loop
    execute format('drop policy %I on public.schedules', p.policyname);
  end loop;
end $$;

create policy "Admins manage schedules in their hub"
  on public.schedules as permissive for all
  to public
  using (((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND (get_classroom_hub_id(classroom_id) = get_my_hub_id())))
  with check (((is_superadmin() OR has_role(auth.uid(), 'admin'::app_role)) AND (get_classroom_hub_id(classroom_id) = get_my_hub_id())));

create policy "Staff manage schedules in their classroom"
  on public.schedules as permissive for all
  to public
  using ((EXISTS ( SELECT 1
   FROM classroom_staff cs
  WHERE ((cs.classroom_id = schedules.classroom_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM classroom_staff cs
  WHERE ((cs.classroom_id = schedules.classroom_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text)))));

create policy "Students read their schedules"
  on public.schedules as permissive for select
  to public
  using ((((cohort_id IS NULL) AND ((EXISTS ( SELECT 1
   FROM classroom_students cs
  WHERE ((cs.classroom_id = schedules.classroom_id) AND (cs.student_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (cohort_students cst
     JOIN cohorts co ON ((co.id = cst.cohort_id)))
  WHERE ((co.classroom_id = schedules.classroom_id) AND (cst.student_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (enrollments e
     JOIN classrooms cl ON ((cl.program_id = e.program_id)))
  WHERE ((cl.id = schedules.classroom_id) AND (e.user_id = auth.uid()) AND (e.enrollment_status <> ALL (ARRAY['cancelled'::text, 'withdrawn'::text]))))))) OR ((cohort_id IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM cohort_students cst
  WHERE ((cst.cohort_id = schedules.cohort_id) AND (cst.student_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (enrollments e
     JOIN classrooms cl ON ((cl.program_id = e.program_id)))
  WHERE ((cl.id = schedules.classroom_id) AND (e.user_id = auth.uid()) AND (e.cohort_id = schedules.cohort_id) AND (e.enrollment_status <> ALL (ARRAY['cancelled'::text, 'withdrawn'::text])))))))));

create policy "Superadmin full access on schedules"
  on public.schedules as permissive for all
  to public
  using (is_superadmin())
  with check (is_superadmin());

-- ==== tracks ================================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'tracks'
  loop
    execute format('drop policy %I on public.tracks', p.policyname);
  end loop;
end $$;

create policy "Admins manage tracks in their hub"
  on public.tracks as permissive for all
  to public
  using ((has_role(auth.uid(), 'admin'::app_role) AND (EXISTS ( SELECT 1
   FROM (curricula cu
     JOIN classrooms c ON ((c.id = cu.classroom_id)))
  WHERE ((cu.id = tracks.curriculum_id) AND (c.hub_id = get_my_hub_id()))))))
  with check ((has_role(auth.uid(), 'admin'::app_role) AND (EXISTS ( SELECT 1
   FROM (curricula cu
     JOIN classrooms c ON ((c.id = cu.classroom_id)))
  WHERE ((cu.id = tracks.curriculum_id) AND (c.hub_id = get_my_hub_id()))))));

create policy "Staff manage tracks in their classroom"
  on public.tracks as permissive for all
  to public
  using ((EXISTS ( SELECT 1
   FROM (curricula cu
     JOIN classroom_staff cs ON ((cs.classroom_id = cu.classroom_id)))
  WHERE ((cu.id = tracks.curriculum_id) AND (cs.user_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM (curricula cu
     JOIN classroom_staff cs ON ((cs.classroom_id = cu.classroom_id)))
  WHERE ((cu.id = tracks.curriculum_id) AND (cs.user_id = auth.uid())))));

create policy "Staff view tracks in their classroom"
  on public.tracks as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM (curricula cu
     JOIN classroom_staff cs ON ((cs.classroom_id = cu.classroom_id)))
  WHERE ((cu.id = tracks.curriculum_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text)))));

create policy "Students read tracks for their programs"
  on public.tracks as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM ((curricula cu
     JOIN classrooms cl ON ((cl.id = cu.classroom_id)))
     JOIN enrollments e ON ((e.program_id = cl.program_id)))
  WHERE ((cu.id = tracks.curriculum_id) AND (e.user_id = auth.uid()) AND (e.enrollment_status <> ALL (ARRAY['cancelled'::text, 'withdrawn'::text]))))));

create policy "Superadmin full access on tracks"
  on public.tracks as permissive for all
  to public
  using (is_superadmin())
  with check (is_superadmin());

-- ==== units =================================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'units'
  loop
    execute format('drop policy %I on public.units', p.policyname);
  end loop;
end $$;

create policy "Admins manage units in their hub"
  on public.units as permissive for all
  to public
  using ((has_role(auth.uid(), 'admin'::app_role) AND (EXISTS ( SELECT 1
   FROM (((modules m
     JOIN tracks t ON ((t.id = m.track_id)))
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classrooms c ON ((c.id = cu.classroom_id)))
  WHERE ((m.id = units.module_id) AND (c.hub_id = get_my_hub_id()))))))
  with check ((has_role(auth.uid(), 'admin'::app_role) AND (EXISTS ( SELECT 1
   FROM (((modules m
     JOIN tracks t ON ((t.id = m.track_id)))
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classrooms c ON ((c.id = cu.classroom_id)))
  WHERE ((m.id = units.module_id) AND (c.hub_id = get_my_hub_id()))))));

create policy "Staff manage units in their classroom"
  on public.units as permissive for all
  to public
  using ((EXISTS ( SELECT 1
   FROM (((modules m
     JOIN tracks t ON ((t.id = m.track_id)))
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classroom_staff cs ON ((cs.classroom_id = cu.classroom_id)))
  WHERE ((m.id = units.module_id) AND (cs.user_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM (((modules m
     JOIN tracks t ON ((t.id = m.track_id)))
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classroom_staff cs ON ((cs.classroom_id = cu.classroom_id)))
  WHERE ((m.id = units.module_id) AND (cs.user_id = auth.uid())))));

create policy "Staff view units in their classroom"
  on public.units as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM (((modules m
     JOIN tracks t ON ((t.id = m.track_id)))
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classroom_staff cs ON ((cs.classroom_id = cu.classroom_id)))
  WHERE ((m.id = units.module_id) AND (cs.user_id = auth.uid()) AND (cs.status = 'active'::text)))));

create policy "Students read units for their programs"
  on public.units as permissive for select
  to public
  using ((EXISTS ( SELECT 1
   FROM ((((modules m
     JOIN tracks t ON ((t.id = m.track_id)))
     JOIN curricula cu ON ((cu.id = t.curriculum_id)))
     JOIN classrooms cl ON ((cl.id = cu.classroom_id)))
     JOIN enrollments e ON ((e.program_id = cl.program_id)))
  WHERE ((m.id = units.module_id) AND (e.user_id = auth.uid()) AND (e.enrollment_status <> ALL (ARRAY['cancelled'::text, 'withdrawn'::text]))))));

create policy "Superadmin full access on units"
  on public.units as permissive for all
  to public
  using (is_superadmin())
  with check (is_superadmin());
