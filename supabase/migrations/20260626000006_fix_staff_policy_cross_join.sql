-- The "Classroom staff view other staff names" policy JOINed classroom_staff to
-- classrooms. classrooms has "Staff view assigned classrooms" which JOINs back
-- to classroom_staff, creating a slow (and potentially recursive) evaluation
-- chain. The JOIN to classrooms was unnecessary — we only need to confirm the
-- viewer is an active classroom_staff member, not which classroom hub they're in.

DROP POLICY IF EXISTS "Classroom staff view other staff names" ON public.staff;
CREATE POLICY "Classroom staff view other staff names"
  ON public.staff FOR SELECT
  USING (
    public.is_superadmin()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      WHERE cs.user_id = auth.uid()
        AND cs.status = 'active'
    )
  );
