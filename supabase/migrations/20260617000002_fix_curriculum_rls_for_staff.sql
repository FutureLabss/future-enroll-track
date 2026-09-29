-- =====================================================================
-- Fix curriculum table RLS: use classroom_staff.user_id directly
-- instead of going through staff.user_id, matching the pattern used
-- in the schedules fix (20260612000004).
--
-- This fixes the "session column shows Untitled" bug in schedules
-- because enrichSchedules() queries modules/units/lessons and was
-- getting empty results due to RLS blocking.
-- =====================================================================

-- 1. modules
DROP POLICY IF EXISTS "Staff view modules in their classroom" ON public.modules;
CREATE POLICY "Staff view modules in their classroom"
  ON public.modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tracks t
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classroom_staff cs ON cs.classroom_id = cu.classroom_id
      WHERE t.id = modules.track_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
    )
  );

-- 2. units
DROP POLICY IF EXISTS "Staff view units in their classroom" ON public.units;
CREATE POLICY "Staff view units in their classroom"
  ON public.units FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.tracks t ON t.id = m.track_id
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classroom_staff cs ON cs.classroom_id = cu.classroom_id
      WHERE m.id = units.module_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
    )
  );

-- 3. lessons (v2)
DROP POLICY IF EXISTS "Staff view lessons in their classroom" ON public.lessons;
CREATE POLICY "Staff view lessons in their classroom"
  ON public.lessons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.modules m ON m.id = u.module_id
      JOIN public.tracks t ON t.id = m.track_id
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classroom_staff cs ON cs.classroom_id = cu.classroom_id
      WHERE u.id = lessons.unit_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
    )
  );

-- 4. tracks
DROP POLICY IF EXISTS "Staff view tracks in their classroom" ON public.tracks;
CREATE POLICY "Staff view tracks in their classroom"
  ON public.tracks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.curricula cu
      JOIN public.classroom_staff cs ON cs.classroom_id = cu.classroom_id
      WHERE cu.id = tracks.curriculum_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
    )
  );

-- 5. curricula
DROP POLICY IF EXISTS "Staff view curricula in their classroom" ON public.curricula;
CREATE POLICY "Staff view curricula in their classroom"
  ON public.curricula FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      WHERE cs.classroom_id = curricula.classroom_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
    )
  );
