-- =====================================================================
-- 1. Fix generate_attendance_session: gen_random_bytes lives in the
--    extensions schema, not public. Adding extensions to search_path
--    makes it resolvable without schema-qualifying every call.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.generate_attendance_session(
  p_classroom_id   uuid,
  p_lesson_id      uuid    DEFAULT NULL,
  p_cohort_id      uuid    DEFAULT NULL,
  p_duration_mins  integer DEFAULT 30,
  p_schedule_id    uuid    DEFAULT NULL
)
RETURNS attendance_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $$
DECLARE
  _code             text;
  _session          public.attendance_sessions%ROWTYPE;
  _schedule         public.schedules%ROWTYPE;
  _legacy_lesson_id uuid := p_lesson_id;
  _cohort_id        uuid := p_cohort_id;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE cs.classroom_id = p_classroom_id
        AND cs.user_id      = auth.uid()
        AND cs.status       = 'active'
        AND cp.can_start_attendance = true
    ) THEN
      RAISE EXCEPTION 'You do not have permission to start attendance sessions for this classroom';
    END IF;
  END IF;

  IF p_schedule_id IS NOT NULL THEN
    SELECT * INTO _schedule
    FROM public.schedules
    WHERE id = p_schedule_id AND classroom_id = p_classroom_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Schedule not found for this classroom';
    END IF;

    _cohort_id := COALESCE(_cohort_id, _schedule.cohort_id);
  END IF;

  UPDATE public.attendance_sessions
     SET status = 'closed', closed_at = now()
   WHERE classroom_id = p_classroom_id AND status = 'open';

  IF _legacy_lesson_id IS NOT NULL THEN
    UPDATE public.old_lessons SET attendance_session_status = 'open' WHERE id = _legacy_lesson_id;
  END IF;

  LOOP
    _code := upper(substring(encode(gen_random_bytes(4), 'hex') FROM 1 FOR 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.attendance_sessions
      WHERE code = _code AND status = 'open'
    );
  END LOOP;

  INSERT INTO public.attendance_sessions(
    classroom_id, lesson_id, cohort_id, schedule_id, code,
    code_expires_at, duration_mins, generated_by
  )
  VALUES (
    p_classroom_id, _legacy_lesson_id, _cohort_id, p_schedule_id, _code,
    now() + (p_duration_mins || ' minutes')::interval,
    p_duration_mins, auth.uid()
  )
  RETURNING * INTO _session;

  RETURN _session;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_attendance_session(uuid, uuid, uuid, integer, uuid) TO authenticated;

-- =====================================================================
-- 2. Hub-scope the "Classroom staff view other staff names" policy.
--    Previously any active staff member could see all staff across all
--    hubs. Now they only see staff in classrooms that share their hub.
-- =====================================================================
DROP POLICY IF EXISTS "Classroom staff view other staff names" ON public.staff;
CREATE POLICY "Classroom staff view other staff names"
  ON public.staff FOR SELECT
  USING (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND hub_id = public.get_my_hub_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.classrooms cl ON cl.id = cs.classroom_id
      WHERE cs.user_id  = auth.uid()
        AND cs.status   = 'active'
        AND cl.hub_id   = staff.hub_id
    )
  );
