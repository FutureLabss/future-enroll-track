-- Fix broken DELETE policy: classroom_staff has no hub_id column.
-- Must join through classrooms to get hub_id, same as INSERT/UPDATE policies.
DROP POLICY IF EXISTS "Staff with can_edit_cohorts can delete cohorts" ON public.cohorts;

CREATE POLICY "Staff with can_edit_cohorts can delete cohorts"
  ON public.cohorts FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM classroom_staff cs
      JOIN classrooms cl ON cl.id = cs.classroom_id
      JOIN classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE cs.user_id = auth.uid()
        AND cp.can_edit_cohorts = true
        AND cohorts.hub_id = cl.hub_id
    )
  );
