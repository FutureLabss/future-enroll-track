-- Stage 0B of the classroom RLS rework (docs/rls-rework-plan.md).
-- Same disease and same cure as finance (20260707000001): classroom policies inline
-- EXISTS over tables whose own RLS expands recursively (~1,000 SubPlans, ~250ms of
-- pure planning per request on assignments/schedules). SECURITY DEFINER plpgsql
-- helpers are a boundary the planner cannot inline through: inner tables are read as
-- the function owner (no RLS re-expansion), plans are cached, semantics identical.
-- Creating the functions changes nothing until a later stage points a policy at them.
--
-- Access tiers (each strictly wider than the next):
--   read   = student membership (classroom_students | cohort | active enrollment on
--            the classroom's program) | active staff | hub admin | superadmin
--   staff  = active classroom_staff | hub admin | superadmin
--   manage = active staff holding can_create_assignments | hub admin | superadmin
--   attend = active staff holding can_start_attendance  | hub admin | superadmin
--   admin  = hub admin | superadmin

create or replace function public.classroom_read_access(_classroom_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
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

create or replace function public.classroom_staff_access(_classroom_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
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

create or replace function public.classroom_manage_access(_classroom_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
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

create or replace function public.classroom_attendance_access(_classroom_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
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

create or replace function public.classroom_admin_access(_classroom_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return is_superadmin()
    or (has_role(auth.uid(), 'admin'::app_role) and exists (
      select 1 from public.classrooms c
      where c.id = _classroom_id and c.hub_id = get_my_hub_id()));
end; $$;

create or replace function public.cohort_is_mine(_cohort_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return exists (
      select 1 from public.cohort_students cst
      where cst.cohort_id = _cohort_id and cst.student_id = auth.uid())
    or exists (
      select 1 from public.enrollments e
      where e.cohort_id = _cohort_id and e.user_id = auth.uid()
        and e.enrollment_status not in ('cancelled', 'withdrawn'));
end; $$;

-- Walk-up scalars: child tables resolve their classroom through these instead of
-- inlining joins in the policy text. PK lookups only; plans cached.
-- lessons/units/etc. are keyed on the FK the row actually holds (live schema:
-- lessons has ONLY unit_id — no cohort_id/status; do not trust 20260518000026).

create or replace function public.assignment_classroom_id(_assignment_id uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  return (select a.classroom_id from public.assignments a where a.id = _assignment_id);
end; $$;

create or replace function public.presentation_classroom_id(_presentation_id uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  return (select p.classroom_id from public.presentations p where p.id = _presentation_id);
end; $$;

create or replace function public.curriculum_classroom_id(_curriculum_id uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  return (select cu.classroom_id from public.curricula cu where cu.id = _curriculum_id);
end; $$;

create or replace function public.track_classroom_id(_track_id uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  return (
    select cu.classroom_id
    from public.tracks t
    join public.curricula cu on cu.id = t.curriculum_id
    where t.id = _track_id);
end; $$;

create or replace function public.module_classroom_id(_module_id uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  return (
    select cu.classroom_id
    from public.modules m
    join public.tracks t on t.id = m.track_id
    join public.curricula cu on cu.id = t.curriculum_id
    where m.id = _module_id);
end; $$;

create or replace function public.unit_classroom_id(_unit_id uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  return (
    select cu.classroom_id
    from public.units u
    join public.modules m on m.id = u.module_id
    join public.tracks t on t.id = m.track_id
    join public.curricula cu on cu.id = t.curriculum_id
    where u.id = _unit_id);
end; $$;

grant execute on function
  public.classroom_read_access(uuid),
  public.classroom_staff_access(uuid),
  public.classroom_manage_access(uuid),
  public.classroom_attendance_access(uuid),
  public.classroom_admin_access(uuid),
  public.cohort_is_mine(uuid),
  public.assignment_classroom_id(uuid),
  public.presentation_classroom_id(uuid),
  public.curriculum_classroom_id(uuid),
  public.track_classroom_id(uuid),
  public.module_classroom_id(uuid),
  public.unit_classroom_id(uuid)
to authenticated;
