-- Remove cohort auto-assignment from the enrollment trigger.
-- Students should only be auto-added to classroom_students (so they get
-- classroom access). Cohort assignment is now manual — done by the tutor.
CREATE OR REPLACE FUNCTION public.auto_enroll_student_in_classrooms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Need both user_id and program_id
  IF NEW.user_id IS NULL OR NEW.program_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip if nothing relevant changed
  IF TG_OP = 'UPDATE'
     AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
     AND OLD.enrollment_status IS NOT DISTINCT FROM NEW.enrollment_status THEN
    RETURN NEW;
  END IF;

  -- Only active / pending enrollments get classroom access
  IF NEW.enrollment_status NOT IN ('active', 'pending') THEN
    RETURN NEW;
  END IF;

  -- Add to the classroom for this program (one classroom per program enforced by constraint)
  INSERT INTO public.classroom_students (classroom_id, student_id, enrollment_id)
  SELECT cl.id, NEW.user_id, NEW.id
  FROM public.classrooms cl
  WHERE cl.program_id = NEW.program_id
    AND cl.status = 'active'
  ON CONFLICT (classroom_id, student_id) DO NOTHING;

  RETURN NEW;
END;
$$;
