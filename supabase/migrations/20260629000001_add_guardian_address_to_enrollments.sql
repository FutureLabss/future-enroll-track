ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS guardian_name text,
  ADD COLUMN IF NOT EXISTS guardian_phone text;
