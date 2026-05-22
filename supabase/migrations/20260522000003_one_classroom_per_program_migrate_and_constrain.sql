-- ── 1. Move orphaned cohort to the original classroom ─────────────────────────
UPDATE public.cohorts
SET classroom_id = 'e7b5a433-757c-424f-9361-16802f8ece97'
WHERE classroom_id = 'a3c4b757-c32e-48fe-ae80-177c86a77ece';

-- ── 2. Move students to the original classroom (skip if already enrolled) ─────
INSERT INTO public.classroom_students (classroom_id, student_id, enrollment_id)
SELECT 'e7b5a433-757c-424f-9361-16802f8ece97', student_id, enrollment_id
FROM public.classroom_students
WHERE classroom_id = 'a3c4b757-c32e-48fe-ae80-177c86a77ece'
ON CONFLICT (classroom_id, student_id) DO NOTHING;

-- ── 3. Remove student rows from the duplicate classroom ───────────────────────
DELETE FROM public.classroom_students
WHERE classroom_id = 'a3c4b757-c32e-48fe-ae80-177c86a77ece';

-- ── 4. Delete the duplicate classroom ─────────────────────────────────────────
DELETE FROM public.classrooms
WHERE id = 'a3c4b757-c32e-48fe-ae80-177c86a77ece';

-- ── 5. Add partial unique index: one classroom per program (nulls excluded) ───
CREATE UNIQUE INDEX IF NOT EXISTS classrooms_one_per_program
  ON public.classrooms (program_id)
  WHERE program_id IS NOT NULL;
