-- Stage 2: assignments (measured 2026-07-08: 273ms planning, 1,030 SubPlans).
-- Consolidates the three overlapping staff SELECT policies ("Classroom staff view
-- assignments", "Staff read classroom assignments", "Teaching staff view classroom
-- assignments") into one — their union was already "any active staff member".
-- "Admins manage assignments" + "Teaching staff manage classroom assignments" fold
-- into classroom_manage_access (superadmin | hub admin | staff with
-- can_create_assignments), same access set as before.

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'assignments'
  loop
    execute format('drop policy %I on public.assignments', p.policyname);
  end loop;
end $$;

create policy "Staff and admins manage assignments"
  on public.assignments for all to authenticated
  using (public.classroom_manage_access(classroom_id))
  with check (public.classroom_manage_access(classroom_id));

create policy "Staff view classroom assignments"
  on public.assignments for select to authenticated
  using (public.classroom_staff_access(classroom_id));

create policy "Students view published assignments in their classroom"
  on public.assignments for select to authenticated
  using (
    status = 'published'
    and public.classroom_read_access(classroom_id)
    and (cohort_id is null or public.cohort_is_mine(cohort_id))
  );
