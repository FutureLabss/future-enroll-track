-- Add missing columns to schedules
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS module_id uuid REFERENCES public.modules(id) ON DELETE SET NULL;

-- Fix generate_attendance_session: old_lessons ref + schedule_id param
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
BEGIN
  -- Permission check
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

  -- Close any existing open sessions for this classroom
  UPDATE public.attendance_sessions
     SET status = 'closed', closed_at = now()
   WHERE classroom_id = p_classroom_id AND status = 'open';

  -- Update old_lesson status (legacy schedule rows)
  IF p_lesson_id IS NOT NULL THEN
    UPDATE public.old_lessons SET attendance_session_status = 'open' WHERE id = p_lesson_id;
  END IF;

  -- Generate unique 6-char alphanumeric code
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
    p_classroom_id, p_lesson_id, p_cohort_id, p_schedule_id, _code,
    now() + (p_duration_mins || ' minutes')::interval,
    p_duration_mins, auth.uid()
  )
  RETURNING * INTO _session;

  RETURN _session;
END;
$$;
