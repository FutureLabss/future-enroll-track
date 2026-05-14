-- Allow active classroom staff (who can_edit_cohorts) to add/remove students
-- from cohorts belonging to their assigned classroom.

CREATE POLICY "Staff manage cohort students"
  ON public.cohort_students
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.cohorts c
      JOIN public.classroom_staff cs ON cs.classroom_id = c.classroom_id
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE c.id = cohort_students.cohort_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_edit_cohorts = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.cohorts c
      JOIN public.classroom_staff cs ON cs.classroom_id = c.classroom_id
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE c.id = cohort_students.cohort_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_edit_cohorts = true
    )
  );
