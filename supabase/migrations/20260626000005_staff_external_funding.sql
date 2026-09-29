-- Staff paid by third parties (e.g. NJFP) should appear in the system
-- but never generate payroll_runs records, so they don't affect our costs.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS externally_funded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS funder_name text;
