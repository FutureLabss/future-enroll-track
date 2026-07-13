-- "cohort 2 2026 intake" (faaae038) had zero cohort_students rows while its
-- classroom (e236b900) had 8 classroom_students — so mark_attendance rejected
-- every check-in for that cohort's sessions with "You are not in the cohort
-- for this session" (seen flooding the 2026-07-08 outage logs). Superadmin
-- confirmed 2026-07-13: all 8 classroom students belong to this cohort.
-- Idempotent via NOT EXISTS; the cohort→classroom sync trigger is a no-op here.
INSERT INTO public.cohort_students (cohort_id, student_id, enrollment_id)
SELECT 'faaae038-99a6-4f34-b3f5-4acdedcb95b7', cls.student_id, cls.enrollment_id
FROM public.classroom_students cls
WHERE cls.classroom_id = 'e236b900-c6b6-42d5-be98-38c70e9a00a3'
  AND NOT EXISTS (
    SELECT 1 FROM public.cohort_students cs
    WHERE cs.cohort_id = 'faaae038-99a6-4f34-b3f5-4acdedcb95b7'
      AND cs.student_id = cls.student_id
  );
