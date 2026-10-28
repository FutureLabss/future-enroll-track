-- The per-module generate_cohort_schedule kept scheduling one session per module on
-- the chosen weekdays until the modules ran out, ignoring the cohort's end date — a
-- 6-week cohort with a long curriculum got sessions months past its end. Stop at
-- end_date (when set); the returned count is what was actually scheduled.
-- Body otherwise unchanged from 20261022000007.
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

    EXIT WHEN v_cohort.end_date IS NOT NULL AND v_current_date > v_cohort.end_date::date;

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
