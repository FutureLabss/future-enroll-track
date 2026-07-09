-- Stage 7: field_values. Enrollment-keyed, not classroom-keyed, so it reuses the
-- finance helpers from 20260707000001 (enrollment_is_mine / enrollment_in_my_hub —
-- identical join shape to the old inline quals). The two PUBLIC policies serve the
-- pre-auth enrollment form and are recreated VERBATIM — do not tighten them.

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'field_values'
  loop
    execute format('drop policy %I on public.field_values', p.policyname);
  end loop;
end $$;

create policy "Superadmin manages all field values"
  on public.field_values for all
  using (is_superadmin()) with check (is_superadmin());

create policy "Admins manage field values"
  on public.field_values for all to authenticated
  using ((is_superadmin() or has_role(auth.uid(), 'admin'::app_role))
         and public.enrollment_in_my_hub(enrollment_id))
  with check ((is_superadmin() or has_role(auth.uid(), 'admin'::app_role))
              and public.enrollment_in_my_hub(enrollment_id));

create policy "Students can manage own field values"
  on public.field_values for all to authenticated
  using (public.enrollment_is_mine(enrollment_id));

-- Pre-auth enrollment form paths — verbatim from prod.

create policy "Public can insert field values for pending enrollments"
  on public.field_values for insert to anon
  with check (exists (
    select 1 from enrollments
    where enrollments.id = field_values.enrollment_id
      and enrollments.enrollment_status = 'pending'::text
      and enrollments.user_id is null));

create policy "Public can update field values for unlinked enrollments"
  on public.field_values for update
  using (exists (
    select 1 from enrollments e
    where e.id = field_values.enrollment_id
      and e.user_id is null));
