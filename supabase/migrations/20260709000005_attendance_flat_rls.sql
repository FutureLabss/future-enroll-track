-- Stage 3: attendance_sessions + attendance_records (coupled pair — the check-in flow
-- touches both). Student direct policies (insert own / view own) recreated verbatim.
-- Deliberate normalizations, both directions noted:
--   * superadmin was hub-restricted by the old admin policies here (is_superadmin()
--     OR'd inside a hub-matched AND); now full access via the helpers — consistent
--     with every other table and the documented role order (superadmin = full bypass).
--   * "Students read open sessions" gains the cohort→classroom and active-enrollment
--     membership paths that every other student policy already had (old policy only
--     checked classroom_students / cohort_students).

do $$
declare p record; t text;
begin
  foreach t in array array['attendance_sessions','attendance_records'] loop
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- attendance_sessions ---------------------------------------------------------

create policy "Staff and admins manage attendance sessions"
  on public.attendance_sessions for all to authenticated
  using (public.classroom_attendance_access(classroom_id))
  with check (public.classroom_attendance_access(classroom_id));

create policy "Students read open sessions"
  on public.attendance_sessions for select to authenticated
  using (
    status = 'open'
    and (
      public.classroom_read_access(classroom_id)
      or (cohort_id is not null and public.cohort_is_mine(cohort_id))
    )
  );

-- attendance_records ----------------------------------------------------------

create policy "Admins manage attendance_records"
  on public.attendance_records for all to authenticated
  using (public.classroom_admin_access(classroom_id))
  with check (public.classroom_admin_access(classroom_id));

create policy "Staff view classroom attendance"
  on public.attendance_records for select to authenticated
  using (public.classroom_staff_access(classroom_id));

create policy "Students insert own attendance"
  on public.attendance_records for insert
  with check (student_id = auth.uid());

create policy "Students view own attendance"
  on public.attendance_records for select
  using (student_id = auth.uid());
