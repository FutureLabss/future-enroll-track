-- Trigger function: when a student enrolls (or gets a user_id assigned),
-- add them to all active classrooms for that program and their cohort.
CREATE OR REPLACE FUNCTION public.auto_enroll_student_in_classrooms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Need both user_id and program_id
  IF NEW.user_id IS NULL OR NEW.program_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip if nothing relevant changed
  IF TG_OP = 'UPDATE'
     AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
     AND OLD.enrollment_status IS NOT DISTINCT FROM NEW.enrollment_status
     AND OLD.cohort_id IS NOT DISTINCT FROM NEW.cohort_id THEN
    RETURN NEW;
  END IF;

  -- Only active / pending enrollments get classroom access
  IF NEW.enrollment_status NOT IN ('active', 'pending') THEN
    RETURN NEW;
  END IF;

  -- Add to all active classrooms for this program
  INSERT INTO public.classroom_students (classroom_id, student_id, enrollment_id)
  SELECT cl.id, NEW.user_id, NEW.id
  FROM public.classrooms cl
  WHERE cl.program_id = NEW.program_id
    AND cl.status = 'active'
  ON CONFLICT (classroom_id, student_id) DO NOTHING;

  -- Add to cohort:
  --   If enrollment has a specific cohort_id set, honour it.
  --   Otherwise fall back to the active cohort in each active classroom.
  IF NEW.cohort_id IS NOT NULL THEN
    INSERT INTO public.cohort_students (cohort_id, student_id, enrollment_id)
    VALUES (NEW.cohort_id, NEW.user_id, NEW.id)
    ON CONFLICT (cohort_id, student_id) DO NOTHING;
  ELSE
    INSERT INTO public.cohort_students (cohort_id, student_id, enrollment_id)
    SELECT co.id, NEW.user_id, NEW.id
    FROM public.classrooms cl
    JOIN public.cohorts co ON co.classroom_id = cl.id AND co.status = 'active'
    WHERE cl.program_id = NEW.program_id
      AND cl.status = 'active'
    ON CONFLICT (cohort_id, student_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Fire after INSERT, or after UPDATE when anything enrollment-relevant changes
CREATE TRIGGER trg_auto_enroll_student_in_classrooms
  AFTER INSERT OR UPDATE OF user_id, enrollment_status, cohort_id
  ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_enroll_student_in_classrooms();

-- Backfill: add already-enrolled students who are missing from classrooms/cohorts
INSERT INTO public.classroom_students (classroom_id, student_id, enrollment_id)
SELECT cl.id, e.user_id, e.id
FROM public.enrollments e
JOIN public.classrooms cl ON cl.program_id = e.program_id AND cl.status = 'active'
WHERE e.user_id IS NOT NULL
  AND e.enrollment_status IN ('active', 'pending')
ON CONFLICT (classroom_id, student_id) DO NOTHING;

INSERT INTO public.cohort_students (cohort_id, student_id, enrollment_id)
SELECT co.id, e.user_id, e.id
FROM public.enrollments e
JOIN public.classrooms cl ON cl.program_id = e.program_id AND cl.status = 'active'
JOIN public.cohorts co ON co.classroom_id = cl.id AND co.status = 'active'
WHERE e.user_id IS NOT NULL
  AND e.enrollment_status IN ('active', 'pending')
  AND e.cohort_id IS NULL
ON CONFLICT (cohort_id, student_id) DO NOTHING;

-- Also backfill enrollments that have an explicit cohort_id set
INSERT INTO public.cohort_students (cohort_id, student_id, enrollment_id)
SELECT e.cohort_id, e.user_id, e.id
FROM public.enrollments e
WHERE e.user_id IS NOT NULL
  AND e.cohort_id IS NOT NULL
  AND e.enrollment_status IN ('active', 'pending')
ON CONFLICT (cohort_id, student_id) DO NOTHING;
