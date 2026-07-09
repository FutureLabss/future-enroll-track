-- get_student_progress has errored on every call since 2026-07-03:
-- it reads lessons.cohort_id and lessons.status, but the deployed lessons
-- table hangs off unit_id and has neither column (the content-hierarchy shape
-- in 20260518000026 never reached production). This error surfaced in the
-- postgres logs of both 2026-07-08 outages and was misread as ad-hoc SQL.
--
-- In the live schema, cohort scheduling lives in schedules (cohort_id,
-- lesson_id, status) and attendance in attendance_sessions/attendance_records,
-- so: total = non-cancelled scheduled classes for the cohort, attended =
-- distinct sessions the student was present/late for.
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
  _req_assignments int;
  _passed_assignments int;
  _req_presentations int;
  _passed_presentations int;
  _graduation_status text;
BEGIN
  SELECT COUNT(*) INTO _total_lessons FROM public.schedules
  WHERE cohort_id = p_cohort_id AND status <> 'cancelled';

  SELECT COUNT(DISTINCT ar.session_id) INTO _attended
  FROM public.attendance_records ar
  JOIN public.attendance_sessions s ON s.id = ar.session_id
  WHERE ar.student_id = p_student_id
    AND s.cohort_id = p_cohort_id
    AND ar.attendance_status IN ('present','late');

  SELECT COUNT(*) INTO _total_assignments FROM public.assignments
  WHERE cohort_id = p_cohort_id AND status = 'published';

  SELECT COUNT(*) INTO _submitted
  FROM public.assignment_submissions asub
  JOIN public.assignments a ON a.id = asub.assignment_id
  WHERE asub.student_id = p_student_id
    AND a.cohort_id = p_cohort_id;

  SELECT COUNT(*) INTO _req_assignments FROM public.assignments
  WHERE cohort_id = p_cohort_id AND status = 'published' AND pass_score IS NOT NULL;

  SELECT COUNT(*) INTO _passed_assignments
  FROM public.assignments a
  JOIN public.assignment_submissions asub
    ON asub.assignment_id = a.id AND asub.student_id = p_student_id AND asub.status = 'graded'
  WHERE a.cohort_id = p_cohort_id AND a.status = 'published' AND a.pass_score IS NOT NULL
    AND asub.score IS NOT NULL AND asub.score >= a.pass_score;

  SELECT COUNT(*) INTO _req_presentations FROM public.presentations
  WHERE cohort_id = p_cohort_id AND status IN ('published','completed');

  SELECT COUNT(*) INTO _passed_presentations
  FROM public.presentations pr
  JOIN public.presentation_grades pg
    ON pg.presentation_id = pr.id AND pg.student_id = p_student_id AND pg.status = 'graded'
  WHERE pr.cohort_id = p_cohort_id AND pr.status IN ('published','completed')
    AND pg.score IS NOT NULL AND pg.score >= pr.pass_score;

  SELECT auto_graduation_status INTO _graduation_status
  FROM public.cohort_students WHERE cohort_id = p_cohort_id AND student_id = p_student_id;

  RETURN jsonb_build_object(
    'total_lessons', _total_lessons,
    'lessons_attended', _attended,
    'attendance_pct', CASE WHEN _total_lessons > 0 THEN LEAST(100, ROUND((_attended::numeric / _total_lessons) * 100, 1)) ELSE 0 END,
    'total_assignments', _total_assignments,
    'assignments_submitted', _submitted,
    'assignment_pct', CASE WHEN _total_assignments > 0 THEN ROUND((_submitted::numeric / _total_assignments) * 100, 1) ELSE 0 END,
    'assignments_required', _req_assignments,
    'assignments_passed', _passed_assignments,
    'presentations_required', _req_presentations,
    'presentations_passed', _passed_presentations,
    'graduation_status', COALESCE(_graduation_status, 'pending')
  );
END;
$$;
