-- Only the tutor, a training manager (hub_role = 'manager') or the superadmin may
-- set a cohort's schedule. Hub admins keep read access but can no longer create,
-- change, cancel or delete sessions.
--   * cohort with a primary tutor  → that tutor
--   * cohort without one, or a classroom-wide session → the classroom's active teaching staff
--   * training managers of the classroom's hub, and the superadmin → always
-- Enforced in RLS (schedules, cohort_schedules) and in generate_cohort_schedule,
-- which is SECURITY DEFINER and previously let any signed-in user generate sessions.

CREATE OR REPLACE FUNCTION public.can_set_schedule(_classroom_id uuid, _cohort_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid       uuid := auth.uid();
  _classroom uuid := _classroom_id;
  _tutor     uuid;
  _hub       uuid;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_superadmin() THEN
    RETURN true;
  END IF;

  IF _cohort_id IS NOT NULL THEN
    SELECT COALESCE(_classroom, co.classroom_id), co.primary_tutor_id, co.hub_id
      INTO _classroom, _tutor, _hub
    FROM public.cohorts co WHERE co.id = _cohort_id;
  END IF;

  _hub := COALESCE(public._get_classroom_hub_id(_classroom), _hub);
  IF _hub IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.hub_members hm
    WHERE hm.user_id = _uid AND hm.hub_id = _hub AND hm.hub_role = 'manager'
  ) THEN
    RETURN true;
  END IF;

  IF _tutor IS NOT NULL THEN
    RETURN _uid = ANY (public.staff_user_ids(_tutor));
  END IF;

  RETURN _classroom IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.classroom_staff cs
    WHERE cs.classroom_id = _classroom AND cs.user_id = _uid
      AND cs.status = 'active' AND cs.staff_type = 'teaching'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_set_schedule(uuid, uuid) TO authenticated;

-- ── schedules ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Staff and admins manage schedules" ON public.schedules;

CREATE POLICY "Staff, admins and managers read schedules" ON public.schedules FOR SELECT
  USING (public.classroom_staff_access(classroom_id) OR public.can_set_schedule(classroom_id, cohort_id));

CREATE POLICY "Tutors and managers add schedules" ON public.schedules FOR INSERT
  WITH CHECK (public.can_set_schedule(classroom_id, cohort_id));

CREATE POLICY "Tutors and managers change schedules" ON public.schedules FOR UPDATE
  USING (public.can_set_schedule(classroom_id, cohort_id))
  WITH CHECK (public.can_set_schedule(classroom_id, cohort_id));

CREATE POLICY "Tutors and managers delete schedules" ON public.schedules FOR DELETE
  USING (public.can_set_schedule(classroom_id, cohort_id));

-- ── cohort_schedules (legacy per-cohort sessions) ───────────────────────────

DO $$
BEGIN
  IF to_regclass('public.cohort_schedules') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admins manage cohort schedules" ON public.cohort_schedules;
    CREATE POLICY "Admins read cohort schedules" ON public.cohort_schedules FOR SELECT
      USING (public.has_role(auth.uid(), 'admin'::app_role));
    CREATE POLICY "Tutors and managers manage cohort schedules" ON public.cohort_schedules FOR ALL
      USING (public.can_set_schedule(NULL, cohort_id))
      WITH CHECK (public.can_set_schedule(NULL, cohort_id));
  END IF;
END $$;

-- ── generate_cohort_schedule: both overloads, same bodies, plus the permission check ──
-- (time, time): weekly sessions between the cohort's start and end dates.

CREATE OR REPLACE FUNCTION public.generate_cohort_schedule(
  p_cohort_id       uuid,
  p_days            text[],
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

  IF NOT public.can_set_schedule(_cohort.classroom_id, p_cohort_id) THEN
    RAISE EXCEPTION 'Only the cohort''s tutor, a training manager or the superadmin can set this schedule';
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

-- (text, text): one session per curriculum module, the version deployed outside the
-- repo's migration history. Body unchanged apart from the permission check.
CREATE OR REPLACE FUNCTION public.generate_cohort_schedule(p_cohort_id uuid, p_days text[], p_start_time text, p_end_time text, p_instructor_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cohort record;
  v_module_rec record;
  v_day_numbers int[] := ARRAY[]::int[];
  v_day text;
  v_current_date date;
  v_min_ahead int;
  v_target_dow int;
  v_days_ahead int;
  v_count int := 0;
BEGIN
  SELECT * INTO v_cohort FROM cohorts WHERE id = p_cohort_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF NOT public.can_set_schedule(v_cohort.classroom_id, p_cohort_id) THEN
    RAISE EXCEPTION 'Only the cohort''s tutor, a training manager or the superadmin can set this schedule';
  END IF;

  v_current_date := COALESCE(v_cohort.start_date::date, CURRENT_DATE);

  FOREACH v_day IN ARRAY p_days LOOP
    v_day_numbers := v_day_numbers || ARRAY[
      CASE lower(v_day)
        WHEN 'sunday'    THEN 0
        WHEN 'monday'    THEN 1
        WHEN 'tuesday'   THEN 2
        WHEN 'wednesday' THEN 3
        WHEN 'thursday'  THEN 4
        WHEN 'friday'    THEN 5
        WHEN 'saturday'  THEN 6
        ELSE -1
      END
    ];
  END LOOP;

  SELECT array_agg(d) INTO v_day_numbers FROM unnest(v_day_numbers) d WHERE d >= 0;
  IF v_day_numbers IS NULL OR array_length(v_day_numbers, 1) = 0 THEN RETURN 0; END IF;

  FOR v_module_rec IN (
    SELECT m.id, m.title,
           (SELECT t.order_index FROM tracks t WHERE t.id = m.track_id) AS track_order,
           m.order_index
    FROM modules m
    WHERE (
      (v_cohort.scope_type = 'module'     AND m.id = v_cohort.scope_id)
      OR (v_cohort.scope_type = 'track'      AND m.track_id = v_cohort.scope_id)
      OR (v_cohort.scope_type = 'curriculum' AND m.track_id IN (
            SELECT id FROM tracks WHERE curriculum_id = v_cohort.scope_id))
      OR (v_cohort.scope_type IS NULL AND m.track_id IN (
            SELECT t.id FROM tracks t
            JOIN curricula cu ON cu.id = t.curriculum_id
            WHERE cu.classroom_id = v_cohort.classroom_id))
    )
    ORDER BY track_order, m.order_index
  )
  LOOP
    -- Find the closest upcoming selected day from v_current_date
    v_min_ahead := 8;
    FOREACH v_target_dow IN ARRAY v_day_numbers LOOP
      v_days_ahead := (v_target_dow - EXTRACT(DOW FROM v_current_date)::int + 7) % 7;
      IF v_days_ahead < v_min_ahead THEN v_min_ahead := v_days_ahead; END IF;
    END LOOP;
    v_current_date := v_current_date + v_min_ahead;

    INSERT INTO schedules (classroom_id, cohort_id, module_id, title, scheduled_date, start_time, end_time, instructor_id, status)
    VALUES (
      v_cohort.classroom_id, p_cohort_id, v_module_rec.id, v_module_rec.title,
      v_current_date, p_start_time::time, p_end_time::time, p_instructor_id, 'scheduled'
    );

    v_count := v_count + 1;
    v_current_date := v_current_date + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- One round-trip for the UI: may the caller schedule this classroom's
-- classroom-wide sessions (cohort_id NULL row) and each of its cohorts?
CREATE OR REPLACE FUNCTION public.get_schedule_permissions(p_classroom_id uuid)
RETURNS TABLE (cohort_id uuid, allowed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULL::uuid, public.can_set_schedule(p_classroom_id, NULL)
  UNION ALL
  SELECT co.id, public.can_set_schedule(p_classroom_id, co.id)
  FROM public.cohorts co
  WHERE co.classroom_id = p_classroom_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_schedule_permissions(uuid) TO authenticated;
