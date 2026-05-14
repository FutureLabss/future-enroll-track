-- Auto-enroll existing program students when a classroom is created
-- or when a classroom's program_id changes.

CREATE OR REPLACE FUNCTION public.auto_enroll_on_classroom_program()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only run when program_id is set and has changed (or it's a new row)
  IF NEW.program_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.program_id IS NOT DISTINCT FROM NEW.program_id THEN
    RETURN NEW;
  END IF;

  -- Enroll all active/pending enrolled students in this program
  INSERT INTO public.classroom_students (classroom_id, student_id, enrollment_id)
  SELECT NEW.id, e.user_id, e.id
  FROM public.enrollments e
  WHERE e.program_id = NEW.program_id
    AND e.user_id IS NOT NULL
    AND e.enrollment_status IN ('active', 'pending')
  ON CONFLICT DO NOTHING;

  -- Also add them to the active cohort in this classroom (if one exists)
  INSERT INTO public.cohort_students (cohort_id, student_id, enrollment_id)
  SELECT c.id, e.user_id, e.id
  FROM public.cohorts c
  CROSS JOIN public.enrollments e
  WHERE c.classroom_id = NEW.id
    AND c.status = 'active'
    AND e.program_id = NEW.program_id
    AND e.user_id IS NOT NULL
    AND e.enrollment_status IN ('active', 'pending')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_enroll_on_classroom_program
  AFTER INSERT OR UPDATE OF program_id ON public.classrooms
  FOR EACH ROW EXECUTE FUNCTION public.auto_enroll_on_classroom_program();
