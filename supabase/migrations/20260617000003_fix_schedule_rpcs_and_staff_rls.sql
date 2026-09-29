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
        EXIT day_loop;
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
--    (so instructor names resolve in schedule forms and enrichment)
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
-- 4. get_staff_names — SECURITY DEFINER RPC that only exposes
--    id and full_name, as an alternative for tighter security
-- =====================================================================
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

-- =====================================================================
-- 5. Add updated_at trigger for schedules
-- =====================================================================
DROP TRIGGER IF EXISTS update_schedules_updated_at ON public.schedules;
CREATE TRIGGER update_schedules_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
