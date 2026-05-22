-- RPC: switch_student_classroom
-- Moves a student from one classroom to another, clearing old cohort membership
-- and optionally assigning a new one. Writes a full audit trail to audit_logs.
CREATE OR REPLACE FUNCTION public.switch_student_classroom(
  p_student_id      uuid,
  p_from_classroom_id uuid,
  p_to_classroom_id   uuid,
  p_to_cohort_id      uuid    DEFAULT NULL,
  p_reason            text    DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _enrollment_id uuid;
  _from_name     text;
  _to_name       text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can switch student classrooms';
  END IF;

  IF p_from_classroom_id = p_to_classroom_id THEN
    RAISE EXCEPTION 'Source and destination classroom must differ';
  END IF;

  -- Carry the enrollment_id forward so the new row stays linked
  SELECT enrollment_id INTO _enrollment_id
  FROM public.classroom_students
  WHERE classroom_id = p_from_classroom_id AND student_id = p_student_id;

  -- Fallback: look it up from enrollments directly
  IF _enrollment_id IS NULL THEN
    SELECT id INTO _enrollment_id
    FROM public.enrollments
    WHERE user_id = p_student_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  SELECT name INTO _from_name FROM public.classrooms WHERE id = p_from_classroom_id;
  SELECT name INTO _to_name   FROM public.classrooms WHERE id = p_to_classroom_id;

  -- Remove from old classroom
  DELETE FROM public.classroom_students
  WHERE classroom_id = p_from_classroom_id AND student_id = p_student_id;

  -- Remove from every cohort that belongs to the old classroom
  DELETE FROM public.cohort_students
  WHERE student_id = p_student_id
    AND cohort_id IN (
      SELECT id FROM public.cohorts WHERE classroom_id = p_from_classroom_id
    );

  -- Add to new classroom
  INSERT INTO public.classroom_students (classroom_id, student_id, enrollment_id)
  VALUES (p_to_classroom_id, p_student_id, _enrollment_id)
  ON CONFLICT (classroom_id, student_id) DO NOTHING;

  -- Optionally assign to a cohort in the new classroom
  IF p_to_cohort_id IS NOT NULL THEN
    INSERT INTO public.cohort_students (cohort_id, student_id, enrollment_id)
    VALUES (p_to_cohort_id, p_student_id, _enrollment_id)
    ON CONFLICT (cohort_id, student_id) DO NOTHING;
  END IF;

  -- Audit trail
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'switch_classroom',
    'classroom_students',
    p_student_id,
    jsonb_build_object(
      'student_id',          p_student_id,
      'from_classroom_id',   p_from_classroom_id,
      'from_classroom_name', _from_name,
      'to_classroom_id',     p_to_classroom_id,
      'to_classroom_name',   _to_name,
      'to_cohort_id',        p_to_cohort_id,
      'reason',              p_reason
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_student_classroom(uuid, uuid, uuid, uuid, text) TO authenticated;
