-- cohorts.hub_id was added via dashboard but never got the set_hub_id trigger,
-- causing all inserts to fail when hub_id is NOT NULL without a default.

-- Ensure the column exists (no-op if already present from dashboard)
ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS hub_id uuid REFERENCES public.hubs(id);

-- Backfill any existing rows that are missing hub_id, deriving it from their program
UPDATE public.cohorts c
SET hub_id = p.hub_id
FROM public.programs p
WHERE p.id = c.program_id
  AND c.hub_id IS NULL;

-- Wire up the same auto-fill trigger used on every other top-level table
DROP TRIGGER IF EXISTS trg_cohorts_set_hub_id ON public.cohorts;
CREATE TRIGGER trg_cohorts_set_hub_id
  BEFORE INSERT ON public.cohorts
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();
