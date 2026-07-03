-- Cumulative graduation status per cohort membership.
-- auto_graduation_status is written only by compute_cohort_graduation().
-- graduation_override lets an admin correct the computed value; students'
-- own views always read auto_graduation_status directly (never the
-- override) — admin-facing views and certificates should read
-- final_graduation_status instead.
ALTER TABLE public.cohort_students
  ADD COLUMN IF NOT EXISTS auto_graduation_status text NOT NULL DEFAULT 'pending'
    CHECK (auto_graduation_status IN ('pending','graduated','not_graduated')),
  ADD COLUMN IF NOT EXISTS graduation_override text
    CHECK (graduation_override IN ('graduated','not_graduated')),
  ADD COLUMN IF NOT EXISTS graduation_override_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS graduation_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS graduation_override_reason text;

ALTER TABLE public.cohort_students
  ADD COLUMN IF NOT EXISTS final_graduation_status text
    GENERATED ALWAYS AS (COALESCE(graduation_override, auto_graduation_status)) STORED;
