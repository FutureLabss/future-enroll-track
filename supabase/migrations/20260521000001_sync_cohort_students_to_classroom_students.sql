-- When a student is added to a cohort, also add them to the classroom.
-- Fixes: admin adds student to cohort but student doesn't see the classroom.
CREATE OR REPLACE FUNCTION public.sync_cohort_student_to_classroom()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.classroom_students (classroom_id, student_id, enrollment_id)
  SELECT co.classroom_id, NEW.student_id, NEW.enrollment_id
  FROM public.cohorts co
  WHERE co.id = NEW.cohort_id
    AND co.classroom_id IS NOT NULL
  ON CONFLICT (classroom_id, student_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_sync_cohort_student_to_classroom
  AFTER INSERT ON public.cohort_students
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_cohort_student_to_classroom();

-- When a new classroom is created, backfill classroom_students from active enrollments
-- for that program so students enrolled before the classroom existed get access.
CREATE OR REPLACE FUNCTION public.backfill_classroom_students_on_classroom_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.program_id IS NULL OR NEW.status != 'active' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.classroom_students (classroom_id, student_id, enrollment_id)
  SELECT NEW.id, e.user_id, e.id
  FROM public.enrollments e
  WHERE e.program_id = NEW.program_id
    AND e.user_id IS NOT NULL
    AND e.enrollment_status IN ('active', 'pending')
  ON CONFLICT (classroom_id, student_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_backfill_classroom_students_on_insert
  AFTER INSERT ON public.classrooms
  FOR EACH ROW
  EXECUTE FUNCTION public.backfill_classroom_students_on_classroom_insert();

-- One-time backfill: add existing cohort members who are missing from classroom_students.
INSERT INTO public.classroom_students (classroom_id, student_id, enrollment_id)
SELECT co.classroom_id, cs.student_id, cs.enrollment_id
FROM public.cohort_students cs
JOIN public.cohorts co ON co.id = cs.cohort_id
WHERE co.classroom_id IS NOT NULL
  AND cs.student_id IS NOT NULL
ON CONFLICT (classroom_id, student_id) DO NOTHING;
