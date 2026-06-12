-- Speed up student schedule reads: flat queries filter by classroom/date and
-- RLS checks join cohort_students and enrollments per row.

CREATE INDEX IF NOT EXISTS idx_schedules_classroom_date_time
  ON public.schedules (classroom_id, scheduled_date, start_time);

CREATE INDEX IF NOT EXISTS idx_schedules_classroom_status_date
  ON public.schedules (classroom_id, status, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_cohort_students_student_cohort
  ON public.cohort_students (student_id, cohort_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_user_program_status
  ON public.enrollments (user_id, program_id, enrollment_status);
