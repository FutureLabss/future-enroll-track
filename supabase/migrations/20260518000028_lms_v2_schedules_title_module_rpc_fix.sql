-- Add missing columns to schedules
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS module_id uuid REFERENCES public.modules(id) ON DELETE SET NULL;
