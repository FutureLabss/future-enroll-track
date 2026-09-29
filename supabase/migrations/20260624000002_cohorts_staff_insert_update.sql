-- Mirror the existing DELETE policy for staff with can_edit_cohorts.
-- INSERT and UPDATE were missing, causing 403 when staff create/edit cohorts.
-- classroom_staff has no hub_id column — must join through classrooms.

CREATE POLICY "Staff with can_edit_cohorts can insert cohorts"
  ON public.cohorts FOR INSERT
  WITH CHECK (
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

CREATE POLICY "Staff with can_edit_cohorts can update cohorts"
  ON public.cohorts FOR UPDATE
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
  )
  WITH CHECK (
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
