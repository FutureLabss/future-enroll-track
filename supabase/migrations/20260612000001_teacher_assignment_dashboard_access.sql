-- Allow teaching staff to view assignments on their dashboard without granting
-- assignment creation privileges, and support the dashboard query path.

CREATE INDEX IF NOT EXISTS idx_assignments_classroom_created_at
  ON public.assignments (classroom_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_classroom_status_due_date
  ON public.assignments (classroom_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_classroom_staff_user_classroom_status
  ON public.classroom_staff (user_id, classroom_id, status);

CREATE INDEX IF NOT EXISTS idx_classroom_staff_classroom_user_status_type
  ON public.classroom_staff (classroom_id, user_id, status, staff_type);

CREATE INDEX IF NOT EXISTS idx_classroom_permissions_staff_assignments
  ON public.classroom_permissions (classroom_staff_id, can_create_assignments);

DROP POLICY IF EXISTS "Teaching staff view classroom assignments" ON public.assignments;
CREATE POLICY "Teaching staff view classroom assignments"
  ON public.assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.classroom_staff cs
      WHERE cs.classroom_id = assignments.classroom_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cs.staff_type = 'teaching'
    )
  );
