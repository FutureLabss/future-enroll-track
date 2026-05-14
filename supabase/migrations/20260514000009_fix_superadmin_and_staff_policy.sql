-- Fix broken staff RLS (old policy called is_superadmin with wrong signature)
-- and insert the platform superadmin record.

-- 1. Both is_superadmin() overloads already reference public.superadmins correctly.
--    Just insert the platform operator.
INSERT INTO public.superadmins (user_id)
VALUES ('a2c98e42-d039-4750-a928-84285aa1536b')
ON CONFLICT (user_id) DO NOTHING;

-- 2. Promote to hub owner in the default hub
UPDATE public.hub_members
SET hub_role = 'owner'
WHERE user_id = 'a2c98e42-d039-4750-a928-84285aa1536b';

-- 3. Replace broken "Superadmin manages staff" (referenced old sig) with clean policy
DROP POLICY IF EXISTS "Superadmin manages staff"  ON public.staff;
DROP POLICY IF EXISTS "Superadmins manage staff"  ON public.staff;

CREATE POLICY "Superadmins manage staff"
  ON public.staff FOR ALL
  USING  (public.is_superadmin(_user_id := auth.uid()))
  WITH CHECK (public.is_superadmin(_user_id := auth.uid()));

-- 4. Re-create classrooms ALL policy with explicit WITH CHECK so INSERT passes
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
