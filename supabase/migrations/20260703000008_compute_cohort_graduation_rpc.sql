-- Cumulative graduation decision: a student must independently pass every
-- graduation-blocking assignment (pass_score IS NOT NULL) AND every
-- presentation in the cohort — no averaging across the two. Any ungraded
-- required item keeps the student at 'pending' rather than deciding early.

CREATE OR REPLACE FUNCTION public.compute_cohort_graduation(p_cohort_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _cohort public.cohorts%ROWTYPE;
BEGIN
  SELECT * INTO _cohort FROM public.cohorts WHERE id = p_cohort_id;
  IF _cohort.id IS NULL THEN
    RAISE EXCEPTION 'Cohort not found';
  END IF;
  IF _cohort.end_date IS NULL OR _cohort.end_date > now() THEN
    RAISE EXCEPTION 'Cohort has not ended yet';
  END IF;

  -- auth.uid() IS NULL covers the pg_cron sweep (no JWT context); interactive
  -- callers must be a hub admin or superadmin.
  IF auth.uid() IS NOT NULL
     AND NOT (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
  THEN
    RAISE EXCEPTION 'You do not have permission to compute graduation for this cohort';
  END IF;

  WITH req_assignments AS (
    SELECT id, pass_score FROM public.assignments
    WHERE cohort_id = p_cohort_id AND status = 'published' AND pass_score IS NOT NULL
  ),
  req_presentations AS (
    SELECT id, pass_score FROM public.presentations
    WHERE cohort_id = p_cohort_id AND status IN ('published','completed')
  ),
  student_status AS (
    SELECT
      cs.id AS cohort_student_id,
      NOT EXISTS (
        SELECT 1 FROM req_assignments ra
        LEFT JOIN public.assignment_submissions asub
          ON asub.assignment_id = ra.id AND asub.student_id = cs.student_id AND asub.status = 'graded'
        WHERE asub.id IS NULL
      ) AS assignments_complete,
      NOT EXISTS (
        SELECT 1 FROM req_assignments ra
        JOIN public.assignment_submissions asub
          ON asub.assignment_id = ra.id AND asub.student_id = cs.student_id AND asub.status = 'graded'
        WHERE asub.score IS NULL OR asub.score < ra.pass_score
      ) AS assignments_passed,
      NOT EXISTS (
        SELECT 1 FROM req_presentations rp
        LEFT JOIN public.presentation_grades pg
          ON pg.presentation_id = rp.id AND pg.student_id = cs.student_id AND pg.status = 'graded'
        WHERE pg.id IS NULL
      ) AS presentations_complete,
      NOT EXISTS (
        SELECT 1 FROM req_presentations rp
        JOIN public.presentation_grades pg
          ON pg.presentation_id = rp.id AND pg.student_id = cs.student_id AND pg.status = 'graded'
        WHERE pg.score IS NULL OR pg.score < rp.pass_score
      ) AS presentations_passed
    FROM public.cohort_students cs
    WHERE cs.cohort_id = p_cohort_id
  )
  UPDATE public.cohort_students target
  SET auto_graduation_status = CASE
    WHEN NOT s.assignments_complete OR NOT s.presentations_complete THEN 'pending'
    WHEN s.assignments_passed AND s.presentations_passed THEN 'graduated'
    ELSE 'not_graduated'
  END
  FROM student_status s
  WHERE target.id = s.cohort_student_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_cohort_graduation(uuid) TO authenticated;

-- Admin override: lets a hub admin correct the computed decision (e.g. an
-- approved extension). The underlying auto_graduation_status is untouched,
-- so students' own progress view keeps showing the real computed result.
CREATE OR REPLACE FUNCTION public.set_graduation_override(
  p_cohort_student_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _hub_id uuid;
BEGIN
  IF p_status IS NOT NULL AND p_status NOT IN ('graduated','not_graduated') THEN
    RAISE EXCEPTION 'Invalid graduation status: %', p_status;
  END IF;

  SELECT public.get_cohort_classroom_hub_id(cs.cohort_id) INTO _hub_id
  FROM public.cohort_students cs WHERE cs.id = p_cohort_student_id;

  IF _hub_id IS NULL THEN
    RAISE EXCEPTION 'Cohort membership not found';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND _hub_id = public.get_my_hub_id())
  ) THEN
    RAISE EXCEPTION 'You do not have permission to override graduation status';
  END IF;

  UPDATE public.cohort_students
  SET graduation_override = p_status,
      graduation_override_by = auth.uid(),
      graduation_override_at = now(),
      graduation_override_reason = p_reason
  WHERE id = p_cohort_student_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), 'set_graduation_override', 'cohort_student', p_cohort_student_id,
    jsonb_build_object('status', p_status, 'reason', p_reason)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_graduation_override(uuid, text, text) TO authenticated;
