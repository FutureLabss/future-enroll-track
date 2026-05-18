-- Allow staff to read enrollments for programs in classrooms where they are active staff
CREATE POLICY "Staff view program enrollments"
ON public.enrollments
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.classroom_staff cs
    JOIN public.classrooms cl ON cl.id = cs.classroom_id
    WHERE cs.user_id = auth.uid()
      AND cs.status = 'active'
      AND cl.program_id = enrollments.program_id
  )
);
