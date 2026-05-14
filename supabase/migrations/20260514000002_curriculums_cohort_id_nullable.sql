-- cohort_id is optional on curriculums (classroom-level curriculum has no cohort)
ALTER TABLE public.curriculums ALTER COLUMN cohort_id DROP NOT NULL;
