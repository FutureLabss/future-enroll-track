-- Tighten the self-enroll policy to only allow specific fields
DROP POLICY IF EXISTS "Public can self-enroll" ON public.enrollments;
CREATE POLICY "Public can self-enroll"
ON public.enrollments FOR INSERT
TO anon
WITH CHECK (
  enrollment_status = 'pending' 
  AND payment_type = 'offline'
  AND user_id IS NULL
);