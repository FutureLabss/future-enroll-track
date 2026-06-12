-- Student assignment visibility, submission media fields, and query performance.

ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS link_url text;

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student_id
  ON public.assignment_submissions (student_id);

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_student
  ON public.assignment_submissions (assignment_id, student_id);

CREATE INDEX IF NOT EXISTS idx_assignment_resources_assignment_id
  ON public.assignment_resources (assignment_id);

DROP POLICY IF EXISTS "Students view published assignments in their classroom" ON public.assignments;
CREATE POLICY "Students view published assignments in their classroom"
  ON public.assignments FOR SELECT
  USING (
    status = 'published'
    AND (
      EXISTS (
        SELECT 1
        FROM public.classroom_students cs
        WHERE cs.classroom_id = assignments.classroom_id
          AND cs.student_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.cohort_students cst
        JOIN public.cohorts co ON co.id = cst.cohort_id
        WHERE co.classroom_id = assignments.classroom_id
          AND cst.student_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.classrooms cl
        JOIN public.enrollments e ON e.program_id = cl.program_id
        WHERE cl.id = assignments.classroom_id
          AND e.user_id = auth.uid()
          AND e.enrollment_status NOT IN ('cancelled', 'withdrawn')
      )
    )
    AND (
      assignments.cohort_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.cohort_students cst
        WHERE cst.cohort_id = assignments.cohort_id
          AND cst.student_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.enrollments e
        JOIN public.classrooms cl ON cl.program_id = e.program_id
        WHERE cl.id = assignments.classroom_id
          AND e.user_id = auth.uid()
          AND e.cohort_id = assignments.cohort_id
          AND e.enrollment_status NOT IN ('cancelled', 'withdrawn')
      )
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('assignment-submissions', 'assignment-submissions', true, 5242880)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Students upload assignment submissions" ON storage.objects;
CREATE POLICY "Students upload assignment submissions"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assignment-submissions'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Public read assignment submissions" ON storage.objects;
CREATE POLICY "Public read assignment submissions"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'assignment-submissions');

DROP POLICY IF EXISTS "Students update own assignment submission files" ON storage.objects;
CREATE POLICY "Students update own assignment submission files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'assignment-submissions'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
