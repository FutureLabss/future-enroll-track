ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS max_score integer;

ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS score integer;
