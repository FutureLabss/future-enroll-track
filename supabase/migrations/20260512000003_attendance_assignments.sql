-- =====================================================================
-- MIGRATION: Attendance & Assignments
-- =====================================================================

-- =====================================================================
-- 1. Attendance Sessions
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE CASCADE NOT NULL,
  cohort_id uuid REFERENCES public.cohorts(id),
  lesson_id uuid REFERENCES public.lessons(id),
  code text NOT NULL UNIQUE,
  code_expires_at timestamptz NOT NULL,
  duration_mins int NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  generated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage attendance_sessions" ON public.attendance_sessions FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Teaching staff manage own classroom sessions" ON public.attendance_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE cs.classroom_id = attendance_sessions.classroom_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_start_attendance = true
    )
  );
CREATE POLICY "Students read open sessions" ON public.attendance_sessions FOR SELECT
  USING (status = 'open');

-- =====================================================================
-- 2. Attendance Records
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.attendance_sessions(id) ON DELETE CASCADE NOT NULL,
  lesson_id uuid REFERENCES public.lessons(id),
  classroom_id uuid REFERENCES public.classrooms(id) NOT NULL,
  cohort_id uuid REFERENCES public.cohorts(id),
  student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  enrollment_id uuid REFERENCES public.enrollments(id),
  attendance_status text NOT NULL DEFAULT 'present'
    CHECK (attendance_status IN ('present','late','absent','excused')),
  method text NOT NULL DEFAULT 'code' CHECK (method IN ('code','manual')),
  student_lat numeric(10,7),
  student_lng numeric(10,7),
  distance_metres numeric(10,2),
  geofence_passed boolean,
  marked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, student_id)
);
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage attendance_records" ON public.attendance_records FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Staff view classroom attendance" ON public.attendance_records FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.classroom_staff cs WHERE cs.classroom_id = attendance_records.classroom_id AND cs.user_id = auth.uid() AND cs.status = 'active')
  );
CREATE POLICY "Students view own attendance" ON public.attendance_records FOR SELECT
  USING (student_id = auth.uid());
CREATE POLICY "Students insert own attendance" ON public.attendance_records FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- =====================================================================
-- 3. Assignments
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE CASCADE NOT NULL,
  cohort_id uuid REFERENCES public.cohorts(id),
  lesson_id uuid REFERENCES public.lessons(id),
  curriculum_lesson_id uuid REFERENCES public.curriculum_lessons(id),
  title text NOT NULL,
  instructions text,
  due_date timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage assignments" ON public.assignments FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Teaching staff manage classroom assignments" ON public.assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE cs.classroom_id = assignments.classroom_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_create_assignments = true
    )
  );
CREATE POLICY "Students view published assignments in their classroom" ON public.assignments FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.classroom_students cs
      WHERE cs.classroom_id = assignments.classroom_id AND cs.student_id = auth.uid()
    )
  );
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 4. Assignment Resources
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.assignment_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  file_url text,
  resource_type text NOT NULL DEFAULT 'file'
    CHECK (resource_type IN ('file','link','pdf','video','image')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.assignment_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage assignment_resources" ON public.assignment_resources FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Authenticated view resources" ON public.assignment_resources FOR SELECT
  TO authenticated USING (true);

-- =====================================================================
-- 5. Assignment Submissions
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  enrollment_id uuid REFERENCES public.enrollments(id),
  submission_text text,
  file_url text,
  submitted_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','late','graded')),
  grade text,
  feedback text,
  graded_by uuid REFERENCES auth.users(id),
  graded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, student_id)
);
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage submissions" ON public.assignment_submissions FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Teaching staff view classroom submissions" ON public.assignment_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      JOIN public.classroom_staff cs ON cs.classroom_id = a.classroom_id
      WHERE a.id = assignment_submissions.assignment_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
    )
  );
CREATE POLICY "Teaching staff grade submissions" ON public.assignment_submissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      JOIN public.classroom_staff cs ON cs.classroom_id = a.classroom_id
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE a.id = assignment_submissions.assignment_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_create_assignments = true
    )
  );
CREATE POLICY "Students manage own submissions" ON public.assignment_submissions FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- =====================================================================
-- 6. RPC: generate_attendance_session
-- =====================================================================
CREATE OR REPLACE FUNCTION public.generate_attendance_session(
  p_classroom_id uuid,
  p_lesson_id uuid DEFAULT NULL,
  p_cohort_id uuid DEFAULT NULL,
  p_duration_mins int DEFAULT 30
)
RETURNS public.attendance_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _code text;
  _session public.attendance_sessions%ROWTYPE;
BEGIN
  -- Permission check
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
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

  -- Close any existing open sessions for this classroom/lesson
  UPDATE public.attendance_sessions
     SET status = 'closed', closed_at = now()
   WHERE classroom_id = p_classroom_id AND status = 'open';

  -- Update lesson status
  IF p_lesson_id IS NOT NULL THEN
    UPDATE public.lessons SET attendance_session_status = 'open' WHERE id = p_lesson_id;
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
    classroom_id, lesson_id, cohort_id, code,
    code_expires_at, duration_mins, generated_by
  )
  VALUES (
    p_classroom_id, p_lesson_id, p_cohort_id, _code,
    now() + (p_duration_mins || ' minutes')::interval,
    p_duration_mins, auth.uid()
  )
  RETURNING * INTO _session;

  RETURN _session;
END;
$$;

-- =====================================================================
-- 7. RPC: mark_attendance (with optional GPS validation)
-- =====================================================================
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
  _grace   int := 10; -- minutes for "late" grace window
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

  -- Late check (marked after grace period from session open)
  IF now() > (_session.created_at + (_grace || ' minutes')::interval) THEN
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

-- =====================================================================
-- 8. RPC: get_student_progress
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_student_progress(
  p_student_id uuid,
  p_cohort_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _total_lessons int;
  _attended int;
  _total_assignments int;
  _submitted int;
BEGIN
  -- Total scheduled lessons for cohort
  SELECT COUNT(*) INTO _total_lessons FROM public.lessons
  WHERE cohort_id = p_cohort_id AND status <> 'cancelled';

  -- Lessons attended
  SELECT COUNT(DISTINCT ar.lesson_id) INTO _attended
  FROM public.attendance_records ar
  JOIN public.attendance_sessions s ON s.id = ar.session_id
  WHERE ar.student_id = p_student_id
    AND s.cohort_id = p_cohort_id
    AND ar.attendance_status IN ('present','late');

  -- Published assignments for cohort
  SELECT COUNT(*) INTO _total_assignments FROM public.assignments
  WHERE cohort_id = p_cohort_id AND status = 'published';

  -- Submitted assignments
  SELECT COUNT(*) INTO _submitted
  FROM public.assignment_submissions asub
  JOIN public.assignments a ON a.id = asub.assignment_id
  WHERE asub.student_id = p_student_id
    AND a.cohort_id = p_cohort_id;

  RETURN jsonb_build_object(
    'total_lessons', _total_lessons,
    'lessons_attended', _attended,
    'attendance_pct', CASE WHEN _total_lessons > 0 THEN ROUND((_attended::numeric / _total_lessons) * 100, 1) ELSE 0 END,
    'total_assignments', _total_assignments,
    'assignments_submitted', _submitted,
    'assignment_pct', CASE WHEN _total_assignments > 0 THEN ROUND((_submitted::numeric / _total_assignments) * 100, 1) ELSE 0 END
  );
END;
$$;
