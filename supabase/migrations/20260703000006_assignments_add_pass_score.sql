-- Optional graduation-blocking threshold per assignment. Nullable so every
-- existing assignment keeps behaving exactly as before (no threshold = not
-- part of the graduation requirement) until an admin explicitly sets one.
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS pass_score integer;
