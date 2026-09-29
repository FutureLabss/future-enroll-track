-- mark_attendance() hardcoded a 10-minute "late" grace window measured from
-- session open, independent of the session's own duration/expiry — so a
-- 30-minute session could mark students "late" 20 minutes before it closed.
-- Make the grace window a per-session column set at generation time.

ALTER TABLE public.attendance_sessions
  ADD COLUMN late_after_mins int NOT NULL DEFAULT 10
    CHECK (late_after_mins >= 0);

DROP FUNCTION IF EXISTS public.generate_attendance_session(uuid, uuid, uuid, integer, uuid);

CREATE FUNCTION public.generate_attendance_session(
  p_classroom_id    uuid,
  p_lesson_id       uuid    DEFAULT NULL,
  p_cohort_id       uuid    DEFAULT NULL,
  p_duration_mins   integer DEFAULT 30,
  p_schedule_id     uuid    DEFAULT NULL,
  p_late_after_mins integer DEFAULT 10
)
RETURNS attendance_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    _code := upper(substring(encode(extensions.gen_random_bytes(4), 'hex') FROM 1 FOR 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.attendance_sessions
      WHERE code = _code AND status = 'open'
    );
  END LOOP;

  INSERT INTO public.attendance_sessions(
    classroom_id, lesson_id, cohort_id, schedule_id, code,
    code_expires_at, duration_mins, late_after_mins, generated_by
  )
  VALUES (
    p_classroom_id, _legacy_lesson_id, _cohort_id, p_schedule_id, _code,
    now() + (p_duration_mins || ' minutes')::interval,
    p_duration_mins, LEAST(p_late_after_mins, p_duration_mins), auth.uid()
  )
  RETURNING * INTO _session;

  RETURN _session;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_attendance_session(uuid, uuid, uuid, integer, uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_attendance(
  p_code text,
  p_student_lat numeric DEFAULT NULL,
  p_student_lng numeric DEFAULT NULL
)
RETURNS public.attendance_records
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _session public.attendance_sessions%ROWTYPE;
  _cls     public.classrooms%ROWTYPE;
  _enroll  public.enrollments%ROWTYPE;
  _dist    numeric;
  _geo_ok  boolean := true;
  _status  text := 'present';
  _record  public.attendance_records%ROWTYPE;
BEGIN
  -- Fetch session
  SELECT * INTO _session FROM public.attendance_sessions WHERE code = p_code;
  IF _session.id IS NULL THEN RAISE EXCEPTION 'Invalid attendance code'; END IF;
  IF _session.status <> 'open' THEN RAISE EXCEPTION 'Attendance session is closed'; END IF;
  IF _session.code_expires_at < now() THEN
    UPDATE public.attendance_sessions SET status = 'closed', closed_at = now() WHERE id = _session.id;
    RAISE EXCEPTION 'Attendance code has expired';
  END IF;

  -- Check student in classroom
  IF NOT EXISTS (
    SELECT 1 FROM public.classroom_students
    WHERE classroom_id = _session.classroom_id AND student_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are not enrolled in this classroom';
  END IF;

  -- Check cohort if session is cohort-specific
  IF _session.cohort_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.cohort_students
      WHERE cohort_id = _session.cohort_id AND student_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'You are not in the cohort for this session';
    END IF;
  END IF;

  -- Fetch classroom for geofencing
  SELECT * INTO _cls FROM public.classrooms WHERE id = _session.classroom_id;

  -- Geofence check
  IF _cls.geofencing_enabled AND _cls.gps_lat IS NOT NULL THEN
    IF p_student_lat IS NULL OR p_student_lng IS NULL THEN
      RAISE EXCEPTION 'Location is required for this classroom attendance';
    END IF;
    -- Haversine distance in metres
    _dist := 6371000 * acos(
      LEAST(1.0, cos(radians(_cls.gps_lat)) * cos(radians(p_student_lat)) *
      cos(radians(p_student_lng) - radians(_cls.gps_lng)) +
      sin(radians(_cls.gps_lat)) * sin(radians(p_student_lat)))
    );
    _geo_ok := (_dist <= _cls.attendance_radius_metres);
    IF NOT _geo_ok THEN
      RAISE EXCEPTION 'You are %.0f metres from the classroom. Maximum allowed: % metres.',
        _dist, _cls.attendance_radius_metres;
    END IF;
  END IF;

  -- Late check (marked after this session's configured grace period from open)
  IF now() > (_session.created_at + (_session.late_after_mins || ' minutes')::interval) THEN
    _status := 'late';
  END IF;

  -- Enrollment lookup
  SELECT * INTO _enroll FROM public.enrollments
  WHERE user_id = auth.uid()
    AND program_id = (SELECT program_id FROM public.classrooms WHERE id = _session.classroom_id)
  LIMIT 1;

  INSERT INTO public.attendance_records(
    session_id, lesson_id, classroom_id, cohort_id,
    student_id, enrollment_id, attendance_status, method,
    student_lat, student_lng, distance_metres, geofence_passed
  ) VALUES (
    _session.id, _session.lesson_id, _session.classroom_id, _session.cohort_id,
    auth.uid(), _enroll.id, _status, 'code',
    p_student_lat, p_student_lng, _dist, _geo_ok
  )
  ON CONFLICT (session_id, student_id)
    DO UPDATE SET attendance_status = _status, marked_at = now()
  RETURNING * INTO _record;

  RETURN _record;
END;
$$;
