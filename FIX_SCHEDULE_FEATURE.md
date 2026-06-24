# Fix Schedule Feature

Apply this migration to fix the schedule feature, then the frontend change.

---

## Step 1: New migration

Create `supabase/migrations/20260617000001_fix_schedule_rpcs_and_staff_rls.sql`:

```sql
-- =====================================================================
-- 1. generate_class_schedule — bulk-schedule all units in a module
--    Called from AutoScheduleWizard.tsx
-- =====================================================================
CREATE OR REPLACE FUNCTION public.generate_class_schedule(
  p_classroom_id  uuid,
  p_module_id     uuid,
  p_start_date    date,
  p_end_date      date,
  p_days_of_week  integer[],       -- 0=Sun … 6=Sat
  p_start_time    time,
  p_end_time      time,
  p_cohort_id     uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, scheduled_date date, start_time time, end_time time, title text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _unit record;
  _d    date;
  _i    int := 0;
  _row  public.schedules%ROWTYPE;
BEGIN
  FOR _unit IN
    SELECT u.id AS unit_id, u.title AS unit_title
    FROM public.units u
    JOIN public.modules m ON m.id = u.module_id
    WHERE m.id = p_module_id
    ORDER BY u.order_index
  LOOP
    _d := p_start_date;
    <<day_loop>>
    LOOP
      IF _d > p_end_date THEN
        EXIT;
      END IF;
      IF array_position(p_days_of_week, extract(dow FROM _d)::int) IS NOT NULL THEN
        _i := _i + 1;
        INSERT INTO public.schedules
          (classroom_id, cohort_id, title, scheduled_date, start_time, end_time, status)
        VALUES
          (p_classroom_id, p_cohort_id, _unit.unit_title, _d, p_start_time, p_end_time, 'scheduled')
        RETURNING * INTO _row;

        id := _row.id;
        scheduled_date := _row.scheduled_date;
        start_time := _row.start_time;
        end_time := _row.end_time;
        title := _row.title;
        RETURN NEXT;
        EXIT day_loop;  -- one session per unit per day
      END IF;
      _d := _d + 1;
    END LOOP;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_class_schedule(uuid, uuid, date, date, integer[], time, time, uuid) TO authenticated;

-- =====================================================================
-- 2. generate_cohort_schedule — create recurring weekly schedules for a cohort
--    Called from ClassroomDetailPage.tsx & ClassroomWorkspacePage.tsx
-- =====================================================================
CREATE OR REPLACE FUNCTION public.generate_cohort_schedule(
  p_cohort_id       uuid,
  p_days            text[],         -- full day names: 'monday','tuesday',…
  p_start_time      time,
  p_end_time        time,
  p_instructor_id   uuid DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cohort    record;
  _day_name  text;
  _dow       int;
  _d         date;
  _count     int := 0;
BEGIN
  SELECT * INTO _cohort FROM public.cohorts WHERE id = p_cohort_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cohort not found';
  END IF;

  FOREACH _day_name IN ARRAY p_days
  LOOP
    _dow := CASE lower(_day_name)
      WHEN 'sunday'    THEN 0
      WHEN 'monday'    THEN 1
      WHEN 'tuesday'   THEN 2
      WHEN 'wednesday' THEN 3
      WHEN 'thursday'  THEN 4
      WHEN 'friday'    THEN 5
      WHEN 'saturday'  THEN 6
      ELSE -1
    END;
    IF _dow = -1 THEN
      RAISE WARNING 'Unknown day: %', _day_name;
      CONTINUE;
    END IF;

    _d := _cohort.start_date;
    WHILE _d <= _cohort.end_date LOOP
      IF extract(dow FROM _d)::int = _dow THEN
        INSERT INTO public.schedules
          (classroom_id, cohort_id, instructor_id, scheduled_date, start_time, end_time, status)
        VALUES
          (_cohort.classroom_id, p_cohort_id, p_instructor_id, _d, p_start_time, p_end_time, 'scheduled');
        _count := _count + 1;
      END IF;
      _d := _d + 1;
    END LOOP;
  END LOOP;

  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_cohort_schedule(uuid, text[], time, time, uuid) TO authenticated;

-- =====================================================================
-- 3. Staff table: add a SELECT policy for classroom staff
--    (so the instructor dropdown in schedule forms populates for teachers)
-- =====================================================================
CREATE POLICY "Classroom staff view other staff names"
  ON public.staff FOR SELECT
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.classrooms cl ON cl.id = cs.classroom_id
      WHERE cs.user_id = auth.uid()
        AND cs.status = 'active'
    )
  );

-- =====================================================================
-- 4. Add updated_at trigger for schedules
-- =====================================================================
DROP TRIGGER IF EXISTS update_schedules_updated_at ON public.schedules;
CREATE TRIGGER update_schedules_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 5. Consolidate generate_attendance_session — keep the newer version
--    from 20260528000003 (it has schedule resolution logic).
--    This is already in place, no action needed — just ensuring the
--    duplicate declaration in 20260518000028 is overwritten.
-- =====================================================================
```

---

## Step 2: Fix `ClassroomWorkspacePage.tsx` — remove stale `active` filter

**File**: `src/pages/staff/ClassroomWorkspacePage.tsx` line 261

**Change**: Remove `.eq('active', true)` — that column doesn't exist on `staff`.

Before:
```ts
supabase.from('staff').select('id, full_name').eq('active', true),
```

After:
```ts
supabase.from('staff').select('id, full_name'),
```

---

## Summary of fixes

| # | Problem | Fix |
|---|---|---|
| 1 | `generate_class_schedule` RPC missing from migrations | Created in step 1 section 1 |
| 2 | `generate_cohort_schedule` RPC missing from migrations | Created in step 1 section 2 |
| 3 | Staff can't read `staff` table (RLS blocks non-superadmin from seeing instructor names) | Added SELECT policy in step 1 section 3 |
| 4 | `schedules.updated_at` never auto-updates | Added trigger in step 1 section 4 |
| 5 | `staff.active` filter references non-existent column | Removed `.eq('active', true)` in step 2 |
