ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS capacity integer CHECK (capacity IS NULL OR capacity > 0);
