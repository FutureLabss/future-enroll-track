-- Environment-specific duplicate-classroom data repair intentionally omitted.

-- Enforce one classroom per program (nulls excluded).
CREATE UNIQUE INDEX IF NOT EXISTS classrooms_one_per_program
  ON public.classrooms (program_id)
  WHERE program_id IS NOT NULL;
