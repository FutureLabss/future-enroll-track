-- Fix cohort deletion: add ON DELETE CASCADE to attendance/assignment FKs,
-- and ON DELETE SET NULL to enrollments/lessons (which outlive cohorts).

-- attendance_sessions
ALTER TABLE public.attendance_sessions
  DROP CONSTRAINT IF EXISTS attendance_sessions_cohort_id_fkey,
  ADD CONSTRAINT attendance_sessions_cohort_id_fkey
    FOREIGN KEY (cohort_id) REFERENCES public.cohorts(id) ON DELETE CASCADE;

-- attendance_records
ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_cohort_id_fkey,
  ADD CONSTRAINT attendance_records_cohort_id_fkey
    FOREIGN KEY (cohort_id) REFERENCES public.cohorts(id) ON DELETE CASCADE;

-- assignments
ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_cohort_id_fkey,
  ADD CONSTRAINT assignments_cohort_id_fkey
    FOREIGN KEY (cohort_id) REFERENCES public.cohorts(id) ON DELETE CASCADE;

-- enrollments — set null, don't delete enrollments when a cohort is removed
ALTER TABLE public.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_cohort_id_fkey,
  ADD CONSTRAINT enrollments_cohort_id_fkey
    FOREIGN KEY (cohort_id) REFERENCES public.cohorts(id) ON DELETE SET NULL;

-- lessons — set null only if the column exists (it may not exist in all environments)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'cohort_id'
  ) THEN
    ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_cohort_id_fkey;
    ALTER TABLE public.lessons ADD CONSTRAINT lessons_cohort_id_fkey
      FOREIGN KEY (cohort_id) REFERENCES public.cohorts(id) ON DELETE SET NULL;
  END IF;
END $$;
