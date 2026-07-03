-- Daily sweep: recompute graduation for every cohort whose end_date has
-- passed. Safe to run repeatedly — compute_cohort_graduation() is
-- idempotent and cohorts stay at 'pending' until all required grading is in.
CREATE OR REPLACE FUNCTION public.run_cohort_graduation_sweep()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _cohort record;
BEGIN
  FOR _cohort IN
    SELECT id FROM public.cohorts
    WHERE end_date IS NOT NULL AND end_date <= now() AND status <> 'archived'
  LOOP
    PERFORM public.compute_cohort_graduation(_cohort.id);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'cohort-graduation-sweep',
  '0 3 * * *',
  $$ SELECT public.run_cohort_graduation_sweep(); $$
);
