-- Stage 1: schedules (measured 2026-07-08: 245ms planning, 996 SubPlans per query).
-- Drops every existing policy (originals preserved by 20260709000001) and recreates a
-- flat set on the SECURITY DEFINER helpers. Semantics preserved; membership paths and
-- cohort scoping unchanged (cohort membership via cohorts implies the classroom is in
-- the read set, so the AND form is equivalent to the old cohort-only branch).

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'schedules'
  loop
    execute format('drop policy %I on public.schedules', p.policyname);
  end loop;
end $$;

create policy "Superadmin full access on schedules"
  on public.schedules for all
  using (is_superadmin()) with check (is_superadmin());

create policy "Staff and admins manage schedules"
  on public.schedules for all to authenticated
  using (public.classroom_staff_access(classroom_id))
  with check (public.classroom_staff_access(classroom_id));

create policy "Students read their schedules"
  on public.schedules for select to authenticated
  using (
    public.classroom_read_access(classroom_id)
    and (cohort_id is null or public.cohort_is_mine(cohort_id))
  );
