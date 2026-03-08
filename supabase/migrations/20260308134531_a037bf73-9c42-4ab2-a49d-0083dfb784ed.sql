CREATE POLICY "Public can view active student-visible fields"
ON public.custom_fields
FOR SELECT
TO anon
USING (active = true AND visible_to_student = true);