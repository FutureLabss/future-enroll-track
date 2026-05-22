-- Allow staff with can_edit_cohorts permission to delete cohorts
CREATE POLICY "Staff with can_edit_cohorts can delete cohorts"
  ON public.cohorts FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM classroom_staff cs
      JOIN classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE cs.user_id = auth.uid()
        AND cp.can_edit_cohorts = true
        AND cohorts.hub_id = cs.hub_id
    )
  );
