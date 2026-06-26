-- 20260626000006 incorrectly added `has_role(uid, 'admin')` without hub scoping
-- to "Classroom staff view other staff names", leaking staff across hubs.
-- Admins already get hub-scoped staff access via "Admins read staff" policy.
-- This policy should only cover the staff-viewing-peer-names case.

DROP POLICY IF EXISTS "Classroom staff view other staff names" ON public.staff;
CREATE POLICY "Classroom staff view other staff names"
  ON public.staff FOR SELECT
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      WHERE cs.user_id = auth.uid()
        AND cs.status = 'active'
    )
  );
