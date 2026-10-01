-- Fix broken staff RLS (old policy called is_superadmin with wrong signature)
-- and insert the platform superadmin record.

-- 1. Environment-specific superadmin assignment intentionally omitted.
--    Bootstrap privileged users explicitly after deployment.

-- 2. Replace broken "Superadmin manages staff" (referenced old sig) with clean policy
DROP POLICY IF EXISTS "Superadmin manages staff"  ON public.staff;
DROP POLICY IF EXISTS "Superadmins manage staff"  ON public.staff;

CREATE POLICY "Superadmins manage staff"
  ON public.staff FOR ALL
  USING  (public.is_superadmin(_user_id := auth.uid()))
  WITH CHECK (public.is_superadmin(_user_id := auth.uid()));

-- 3. Re-create classrooms ALL policy with explicit WITH CHECK so INSERT passes
DROP POLICY IF EXISTS "Admins manage classrooms" ON public.classrooms;
CREATE POLICY "Admins manage classrooms"
  ON public.classrooms FOR ALL
  USING (
    public.is_superadmin(_user_id := auth.uid())
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  )
  WITH CHECK (
    public.is_superadmin(_user_id := auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
