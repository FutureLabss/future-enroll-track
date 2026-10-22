-- Every cohort has one primary tutor: the staff member accountable for it, who
-- its sessions default to and who is chased when it has no schedule.
-- Nullable because existing cohorts have none yet. Creation flows require it, and
-- list_cohort_setup_gaps (20261022000005) flags every open cohort still missing one.

ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS primary_tutor_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cohorts_primary_tutor ON public.cohorts (primary_tutor_id);

-- staff rows are not auth users. The login is linked through classroom_staff.user_id
-- (set on invitation acceptance), with a fallback to a profile on the same email.
CREATE OR REPLACE FUNCTION public.staff_user_ids(p_staff_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT cs.user_id FROM public.classroom_staff cs
    WHERE cs.staff_id = p_staff_id AND cs.user_id IS NOT NULL
    UNION
    SELECT p.user_id FROM public.staff s
    JOIN public.profiles p ON lower(p.email) = lower(s.email)
    WHERE s.id = p_staff_id AND s.email IS NOT NULL AND s.email <> ''
  );
$$;

REVOKE ALL ON FUNCTION public.staff_user_ids(uuid) FROM PUBLIC, anon, authenticated;
