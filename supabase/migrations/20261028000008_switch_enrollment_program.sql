-- Move a student's enrollment to another programme in the same hub.
-- switch_student_classroom (20260521000002) moved students between classrooms of one
-- programme, but classrooms_one_per_program (20260522000003) left every programme with a
-- single classroom, so it never had a destination. What staff actually need is a
-- programme change.
--
-- The enrollment is updated in place: its invoice, installments and payments stay on the
-- one record (a withdraw-and-re-enroll would split one student's payments across two
-- enrollments and double-count revenue), and its whole history reports under the new
-- programme from then on. The fee is not touched — programmes carry no price — so the
-- caller sends the admin to Edit Invoice afterwards. auto_enroll_student_in_classrooms
-- ignores program_id changes, so the classroom move happens here.
CREATE OR REPLACE FUNCTION public.switch_enrollment_program(
  p_enrollment_id uuid,
  p_to_program_id uuid,
  p_to_cohort_id  uuid DEFAULT NULL,
  p_reason        text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _e              public.enrollments;
  _from_program   public.programs;
  _to_program     public.programs;
  _from_classroom uuid;
  _to_classroom   uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_superadmin()) THEN
    RAISE EXCEPTION 'Only admins can switch a student''s programme';
  END IF;

  SELECT * INTO _e FROM public.enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found';
  END IF;
  IF _e.enrollment_status IN ('cancelled', 'withdrawn') THEN
    RAISE EXCEPTION 'A % enrollment cannot be switched', _e.enrollment_status;
  END IF;
  IF _e.program_id = p_to_program_id THEN
    RAISE EXCEPTION 'The student is already on this programme';
  END IF;

  SELECT * INTO _from_program FROM public.programs WHERE id = _e.program_id;
  SELECT * INTO _to_program FROM public.programs WHERE id = p_to_program_id AND active;
  IF _to_program.id IS NULL THEN
    RAISE EXCEPTION 'Programme not found or inactive';
  END IF;
  IF NOT public.is_superadmin() AND _from_program.hub_id IS DISTINCT FROM public.get_my_hub_id() THEN
    RAISE EXCEPTION 'This enrollment belongs to another hub';
  END IF;
  IF _to_program.hub_id IS DISTINCT FROM _from_program.hub_id THEN
    RAISE EXCEPTION 'Students can only switch to a programme in the same hub';
  END IF;

  -- Same rule as uq_enrollments_email_program_active, as a readable message.
  IF EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE id <> _e.id
      AND lower(email) = lower(_e.email)
      AND program_id = p_to_program_id
      AND enrollment_status NOT IN ('cancelled', 'withdrawn')
  ) THEN
    RAISE EXCEPTION '% already has an enrollment on %', _e.full_name, _to_program.program_name;
  END IF;

  SELECT id INTO _from_classroom FROM public.classrooms WHERE program_id = _e.program_id;
  SELECT id INTO _to_classroom FROM public.classrooms WHERE program_id = p_to_program_id AND status = 'active';

  IF p_to_cohort_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cohorts
    WHERE id = p_to_cohort_id
      AND (program_id = p_to_program_id OR (_to_classroom IS NOT NULL AND classroom_id = _to_classroom))
  ) THEN
    RAISE EXCEPTION 'That cohort is not part of %', _to_program.program_name;
  END IF;

  UPDATE public.enrollments
     SET program_id = p_to_program_id,
         cohort_id  = p_to_cohort_id
   WHERE id = _e.id;

  -- Classroom and cohort membership only exist once the student has an account; without
  -- one, auto_enroll_student_in_classrooms places them in the new classroom at signup.
  IF _e.user_id IS NOT NULL THEN
    DELETE FROM public.cohort_students
    WHERE student_id = _e.user_id
      AND cohort_id IN (
        SELECT id FROM public.cohorts
        WHERE program_id = _e.program_id
           OR (_from_classroom IS NOT NULL AND classroom_id = _from_classroom)
      );

    IF _from_classroom IS NOT NULL THEN
      DELETE FROM public.classroom_students
      WHERE classroom_id = _from_classroom AND student_id = _e.user_id;
    END IF;

    IF _to_classroom IS NOT NULL THEN
      INSERT INTO public.classroom_students (classroom_id, student_id, enrollment_id)
      VALUES (_to_classroom, _e.user_id, _e.id)
      ON CONFLICT (classroom_id, student_id) DO NOTHING;
    END IF;

    IF p_to_cohort_id IS NOT NULL THEN
      INSERT INTO public.cohort_students (cohort_id, student_id, enrollment_id)
      VALUES (p_to_cohort_id, _e.user_id, _e.id)
      ON CONFLICT (cohort_id, student_id) DO NOTHING;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details, hub_id)
  VALUES (
    auth.uid(), 'switch_program', 'enrollment', _e.id,
    jsonb_build_object(
      'student_id',        _e.user_id,
      'from_program_id',   _from_program.id,
      'from_program_name', _from_program.program_name,
      'to_program_id',     _to_program.id,
      'to_program_name',   _to_program.program_name,
      'from_cohort_id',    _e.cohort_id,
      'to_cohort_id',      p_to_cohort_id,
      'reason',            NULLIF(trim(p_reason), '')
    ),
    _from_program.hub_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.switch_enrollment_program(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_enrollment_program(uuid, uuid, uuid, text) TO authenticated;
