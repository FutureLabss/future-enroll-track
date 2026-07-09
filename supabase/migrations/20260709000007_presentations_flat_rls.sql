-- Stage 5: presentations + presentation_grades (coupled pair).
-- Old student policy on presentations had NO null-cohort path (cohort-less
-- presentations were invisible to students) — preserved exactly: still requires a
-- non-null cohort_id the student belongs to.
-- Normalizations: superadmin unrestricted (was hub-restricted in the admin policies);
-- cohort membership now also honors enrollments.cohort_id (cohort_is_mine), matching
-- assignments/schedules.

do $$
declare p record; t text;
begin
  foreach t in array array['presentations','presentation_grades'] loop
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- presentations ----------------------------------------------------------------

create policy "Staff and admins manage presentations"
  on public.presentations for all to authenticated
  using (public.classroom_manage_access(classroom_id))
  with check (public.classroom_manage_access(classroom_id));

create policy "Classroom staff view presentations"
  on public.presentations for select to authenticated
  using (public.classroom_staff_access(classroom_id));

create policy "Students view published presentations in their cohort"
  on public.presentations for select to authenticated
  using (
    status = any (array['published', 'completed'])
    and cohort_id is not null
    and public.cohort_is_mine(cohort_id)
  );

-- presentation_grades -----------------------------------------------------------

create policy "Staff and admins manage presentation grades"
  on public.presentation_grades for all to authenticated
  using (public.classroom_manage_access(public.presentation_classroom_id(presentation_id)))
  with check (public.classroom_manage_access(public.presentation_classroom_id(presentation_id)));

create policy "Students view own presentation grade"
  on public.presentation_grades for select
  using (student_id = auth.uid());
