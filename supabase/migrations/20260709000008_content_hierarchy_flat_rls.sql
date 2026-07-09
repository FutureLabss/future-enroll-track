-- Stage 6: content chain curricula → tracks → modules → units → lessons, one
-- tightly-coupled migration (the old policies re-walked the full join chain at every
-- level, 5 tables deep — the "fragile RLS chain" in CLAUDE.md). Each level now
-- resolves its classroom through one opaque walk-up scalar and two boolean checks.
-- Written against the LIVE schema: lessons keys on unit_id only (no cohort_id/status).
--
-- Deliberate normalizations:
--   * Staff MANAGE on all five tables now requires classroom_staff.status = 'active'
--     (old manage policies had no status filter while the view policies did — an
--     inactive staffer could write but not read; tightened).
--   * Student read now honors all membership paths (classroom_students, cohort,
--     active enrollment) instead of active-enrollment-only — classroom_students is
--     the canonical membership per the sync invariant. Read policy also covers staff
--     and admins, so the per-level "Staff view" policies fold in.
--   * Superadmin policies recreated verbatim.

do $$
declare p record; t text;
begin
  foreach t in array array['curricula','tracks','modules','units','lessons'] loop
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- curricula (holds classroom_id directly) ---------------------------------------

create policy "Superadmin full access on curricula"
  on public.curricula for all
  using (is_superadmin()) with check (is_superadmin());

create policy "Staff and admins manage curricula"
  on public.curricula for all to authenticated
  using (public.classroom_staff_access(classroom_id))
  with check (public.classroom_staff_access(classroom_id));

create policy "Members read curricula"
  on public.curricula for select to authenticated
  using (public.classroom_read_access(classroom_id));

-- tracks -------------------------------------------------------------------------

create policy "Superadmin full access on tracks"
  on public.tracks for all
  using (is_superadmin()) with check (is_superadmin());

create policy "Staff and admins manage tracks"
  on public.tracks for all to authenticated
  using (public.classroom_staff_access(public.curriculum_classroom_id(curriculum_id)))
  with check (public.classroom_staff_access(public.curriculum_classroom_id(curriculum_id)));

create policy "Members read tracks"
  on public.tracks for select to authenticated
  using (public.classroom_read_access(public.curriculum_classroom_id(curriculum_id)));

-- modules ------------------------------------------------------------------------

create policy "Superadmin full access on modules"
  on public.modules for all
  using (is_superadmin()) with check (is_superadmin());

create policy "Staff and admins manage modules"
  on public.modules for all to authenticated
  using (public.classroom_staff_access(public.track_classroom_id(track_id)))
  with check (public.classroom_staff_access(public.track_classroom_id(track_id)));

create policy "Members read modules"
  on public.modules for select to authenticated
  using (public.classroom_read_access(public.track_classroom_id(track_id)));

-- units --------------------------------------------------------------------------

create policy "Superadmin full access on units"
  on public.units for all
  using (is_superadmin()) with check (is_superadmin());

create policy "Staff and admins manage units"
  on public.units for all to authenticated
  using (public.classroom_staff_access(public.module_classroom_id(module_id)))
  with check (public.classroom_staff_access(public.module_classroom_id(module_id)));

create policy "Members read units"
  on public.units for select to authenticated
  using (public.classroom_read_access(public.module_classroom_id(module_id)));

-- lessons --------------------------------------------------------------------------

create policy "Superadmin full access on lessons"
  on public.lessons for all
  using (is_superadmin()) with check (is_superadmin());

create policy "Staff and admins manage lessons"
  on public.lessons for all to authenticated
  using (public.classroom_staff_access(public.unit_classroom_id(unit_id)))
  with check (public.classroom_staff_access(public.unit_classroom_id(unit_id)));

create policy "Members read lessons"
  on public.lessons for select to authenticated
  using (public.classroom_read_access(public.unit_classroom_id(unit_id)));
