-- Stage 4: assignment_submissions. The old policies inlined an assignments join whose
-- own RLS re-expanded; now the classroom is resolved through the opaque
-- assignment_classroom_id() walker. Staff write surface is unchanged: graders get
-- UPDATE only (no INSERT/DELETE on student submissions), viewers get SELECT.
-- Normalization: superadmin was hub-restricted here (no separate full-access policy
-- existed on this table); now full via classroom_admin_access.

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'assignment_submissions'
  loop
    execute format('drop policy %I on public.assignment_submissions', p.policyname);
  end loop;
end $$;

create policy "Students manage own submissions"
  on public.assignment_submissions for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy "Admins manage submissions"
  on public.assignment_submissions for all to authenticated
  using (public.classroom_admin_access(public.assignment_classroom_id(assignment_id)))
  with check (public.classroom_admin_access(public.assignment_classroom_id(assignment_id)));

create policy "Teaching staff view classroom submissions"
  on public.assignment_submissions for select to authenticated
  using (public.classroom_staff_access(public.assignment_classroom_id(assignment_id)));

create policy "Teaching staff grade submissions"
  on public.assignment_submissions for update to authenticated
  using (public.classroom_manage_access(public.assignment_classroom_id(assignment_id)));
