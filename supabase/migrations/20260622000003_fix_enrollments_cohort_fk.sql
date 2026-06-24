-- Drop ALL FK constraints from enrollments.cohort_id → cohorts (whatever they're named)
-- then re-add with ON DELETE SET NULL so deleting a cohort nullifies the enrollment reference.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema
    JOIN information_schema.table_constraints ccu
      ON ccu.constraint_name = rc.unique_constraint_name AND ccu.constraint_schema = rc.unique_constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'enrollments'
      AND kcu.column_name = 'cohort_id'
      AND ccu.table_name = 'cohorts'
  LOOP
    EXECUTE format('ALTER TABLE public.enrollments DROP CONSTRAINT %I', r.constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.enrollments
  ADD CONSTRAINT enrollments_cohort_id_fkey
    FOREIGN KEY (cohort_id) REFERENCES public.cohorts(id) ON DELETE SET NULL;
