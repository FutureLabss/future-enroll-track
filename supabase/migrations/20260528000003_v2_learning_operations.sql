CREATE OR REPLACE FUNCTION public.get_classroom_lesson_options(p_classroom_id uuid)
RETURNS TABLE (
  lesson_id uuid,
  lesson_title text,
  unit_id uuid,
  unit_title text,
  module_id uuid,
  module_title text,
  track_id uuid,
  track_title text,
  curriculum_id uuid,
  curriculum_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    l.id,
    l.title,
    u.id,
    u.title,
    m.id,
    m.title,
    t.id,
    t.title,
    c.id,
    c.title
  FROM public.lessons l
  JOIN public.units u ON u.id = l.unit_id
  JOIN public.modules m ON m.id = u.module_id
  JOIN public.tracks t ON t.id = m.track_id
  JOIN public.curricula c ON c.id = t.curriculum_id
  WHERE c.classroom_id = p_classroom_id
    AND (
      public.is_superadmin()
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.classroom_staff cs
        JOIN public.staff s ON s.id = cs.staff_id
        WHERE cs.classroom_id = p_classroom_id
          AND cs.status = 'active'
          AND (cs.user_id = auth.uid() OR s.user_id = auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.classroom_students cst
        WHERE cst.classroom_id = p_classroom_id
          AND cst.student_id = auth.uid()
      )
    )
  ORDER BY c.created_at, t.order_index, m.order_index, u.order_index, l.order_index;
$$;

GRANT EXECUTE ON FUNCTION public.get_classroom_lesson_options(uuid) TO authenticated;

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
SET search_path TO 'public'
AS $$
DECLARE
  _code    text;
  _session public.attendance_sessions%ROWTYPE;
  _schedule public.schedules%ROWTYPE;
  _legacy_lesson_id uuid := p_lesson_id;
  _cohort_id uuid := p_cohort_id;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE cs.classroom_id = p_classroom_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
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

CREATE OR REPLACE FUNCTION public.get_student_progress(p_student_id uuid, p_cohort_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _total_lessons int;
  _attended int;
  _total_assignments int;
  _submitted int;
BEGIN
  SELECT COUNT(*) INTO _total_lessons
  FROM public.schedules
  WHERE cohort_id = p_cohort_id
    AND status <> 'cancelled';

  IF COALESCE(_total_lessons, 0) = 0 THEN
    SELECT COUNT(*) INTO _total_lessons
    FROM public.old_lessons
    WHERE cohort_id = p_cohort_id
      AND status <> 'cancelled';
  END IF;

  SELECT COUNT(DISTINCT COALESCE(ar.schedule_id, s.schedule_id, ar.lesson_id)) INTO _attended
  FROM public.attendance_records ar
  JOIN public.attendance_sessions s ON s.id = ar.session_id
  WHERE ar.student_id = p_student_id
    AND s.cohort_id = p_cohort_id
    AND ar.attendance_status IN ('present','late');

  SELECT COUNT(*) INTO _total_assignments
  FROM public.assignments
  WHERE cohort_id = p_cohort_id
    AND status = 'published';

  SELECT COUNT(*) INTO _submitted
  FROM public.assignment_submissions asub
  JOIN public.assignments a ON a.id = asub.assignment_id
  WHERE asub.student_id = p_student_id
    AND a.cohort_id = p_cohort_id;

  RETURN jsonb_build_object(
    'total_lessons', COALESCE(_total_lessons, 0),
    'lessons_attended', COALESCE(_attended, 0),
    'attendance_pct', CASE WHEN COALESCE(_total_lessons, 0) > 0 THEN ROUND((_attended::numeric / _total_lessons) * 100, 1) ELSE 0 END,
    'total_assignments', COALESCE(_total_assignments, 0),
    'assignments_submitted', COALESCE(_submitted, 0),
    'assignment_pct', CASE WHEN COALESCE(_total_assignments, 0) > 0 THEN ROUND((_submitted::numeric / _total_assignments) * 100, 1) ELSE 0 END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_progress(uuid, uuid) TO authenticated;
