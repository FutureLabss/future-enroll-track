CREATE POLICY "Public can insert field values for pending enrollments"
ON public.field_values
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM enrollments
    WHERE enrollments.id = field_values.enrollment_id
    AND enrollments.enrollment_status = 'pending'
    AND enrollments.user_id IS NULL
  )
);