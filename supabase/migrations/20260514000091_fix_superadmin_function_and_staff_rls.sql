-- ================================================================
-- 1. Fix is_superadmin(uuid) — make it use the superadmins table.
--    This restores all 5 existing policies that call it:
--    invoice_change_requests, payroll_runs, pending_admin_invites,
--    staff, staff_invoices.
-- ================================================================
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = _user_id);
$$;

-- ================================================================
-- 2. Insert the platform superadmin
-- ================================================================
INSERT INTO public.superadmins (user_id)
VALUES ('a2c98e42-d039-4750-a928-84285aa1536b')
ON CONFLICT DO NOTHING;

-- ================================================================
-- 3. Add hub-scoped admin write policy for staff.
--    Previously only superadmins could INSERT/UPDATE/DELETE staff;
--    now hub admins can manage staff belonging to their hub.
-- ================================================================
DROP POLICY IF EXISTS "Hub admins manage staff" ON public.staff;
CREATE POLICY "Hub admins manage staff"
  ON public.staff FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND hub_id = public.get_my_hub_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND hub_id = public.get_my_hub_id()
  );

-- ================================================================
-- 4. Ensure classrooms INSERT also passes the hub_id correctly.
-- ================================================================
DROP POLICY IF EXISTS "Admins manage classrooms" ON public.classrooms;
CREATE POLICY "Admins manage classrooms"
  ON public.classrooms FOR ALL
  USING (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  )
  WITH CHECK (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  );
