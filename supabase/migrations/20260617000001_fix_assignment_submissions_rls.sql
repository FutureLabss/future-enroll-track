-- =====================================================================
-- Fix: "Teaching staff view classroom submissions" policy on
-- assignment_submissions doesn't work for non-teaching/non-creator staff.
--
-- Root cause: The EXISTS subquery in that policy reads public.assignments,
-- which triggers RLS on assignments. The existing SELECT policies on
-- assignments require either can_create_assignments=true or
-- staff_type='teaching'. Staff without either get 0 rows from the
-- subquery, so the EXISTS fails and they see no submissions.
--
-- Fix: Add a FOR SELECT policy on assignments for any active classroom
-- staff member, regardless of permissions or staff_type. This is safe
-- because the subquery already scopes to the staff's own classrooms.
-- =====================================================================

CREATE POLICY "Classroom staff view assignments"
  ON public.assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      WHERE cs.classroom_id = assignments.classroom_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
    )
  );
