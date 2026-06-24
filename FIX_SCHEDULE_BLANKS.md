The schedule "blanks" are caused by **RLS blocking the curriculum table queries** in `enrichSchedules()`. The schedules load but the "Session" column shows "Untitled" and "Instructor" shows "—".

**Root cause**: The v2 curriculum tables (`modules`, `units`, `lessons`) use the old RLS pattern requiring a `staff` table join:

```sql
JOIN public.staff s ON s.id = cs.staff_id
WHERE s.user_id = auth.uid()
```

Staff who are linked via `classroom_staff.user_id` (without a `staff` table record) get blocked by RLS — all lesson/module/unit names resolve to null.

The `schedules` table was already fixed in `20260612000004` to use `cs.user_id` directly, but `modules`, `units`, and `lessons` were not.

---

## Step 1: Migration

Create `supabase/migrations/20260617000003_fix_curriculum_rls_for_staff.sql`:

```sql
-- =====================================================================
-- Fix curriculum table RLS: use classroom_staff.user_id directly
-- instead of going through staff.user_id, matching the pattern used
-- in the schedules fix (20260612000004).
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

-- 4. staff — allow classroom staff to read instructor names via an RPC
--    (avoiding direct staff table query which risks exposing base_salary)
CREATE OR REPLACE FUNCTION public.get_staff_names(p_ids uuid[])
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, full_name FROM public.staff WHERE id = ANY(p_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_names(uuid[]) TO authenticated;

-- 5. tracks — also needs the same fix for completeness
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

-- 6. curricula — also needs the same fix for completeness
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
```

---

## Step 2: Frontend fix — use the new RPC for instructor names

In `src/hooks/useSchedules.ts`, replace the `staff` query in `enrichSchedules` (line 47-49):

**Before:**
```ts
instructorIds.length
  ? supabase.from('staff').select('id, full_name').in('id', instructorIds)
  : Promise.resolve({ data: [], error: null }),
```

**After:**
```ts
instructorIds.length
  ? supabase.rpc('get_staff_names', { p_ids: instructorIds })
  : Promise.resolve({ data: [], error: null }),
```

This bypasses the RLS on `staff` via a SECURITY DEFINER function while only exposing `id` and `full_name`.

---

## Summary

| # | What was blank | Why | Fix |
|---|---|---|---|
| 1 | Session column → "Untitled" | RLS on `modules`, `units`, `lessons` blocks enrichment queries | New SELECT policies using `classroom_staff.user_id` |
| 2 | Instructor column → "—" | RLS on `staff` blocks non-admins | New `get_staff_names` RPC + frontend switch |
| 3 | Tracks/curricula enrichment (if used elsewhere) | Same RLS pattern | SELECT policies added for completeness |
