-- CRITICAL: Fix three cross-hub data leaks identified in multi-tenancy audit.
--
-- 1. staff table — "Classroom staff view other staff names" had no hub check;
--    any active classroom_staff member in any hub could read all staff records.
-- 2. profiles — "Admins can view all profiles" had no hub check; admins at one
--    hub could read full_name/email/phone of users at other hubs.
-- 3. user_roles — "Admins can manage roles" had no hub check; admins could view
--    and modify role assignments for users outside their hub.

-- ── 1. Staff cross-hub leak ───────────────────────────────────────────────────
-- Old policy allowed any active classroom_staff to read ALL staff rows globally.
-- New policy gates on hub_id = get_my_hub_id() so cross-hub reads are blocked.
DROP POLICY IF EXISTS "Classroom staff view other staff names" ON public.staff;

CREATE POLICY "Classroom staff view hub staff"
  ON public.staff FOR SELECT
  USING (
    public.is_superadmin()
    OR (
      hub_id = public.get_my_hub_id()
      AND EXISTS (
        SELECT 1 FROM public.classroom_staff cs
        WHERE cs.user_id = auth.uid()
          AND cs.status = 'active'
      )
    )
  );

-- ── 2. Profiles cross-hub leak ────────────────────────────────────────────────
-- profiles has no hub_id column. We scope access via membership relationships:
--   • hub_members  — covers staff / admins in the same hub
--   • classroom_students → classrooms — covers enrolled students in hub classrooms
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Admins view hub profiles"
  ON public.profiles FOR SELECT
  USING (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND (
        -- staff, other admins, and any hub_member in this hub
        EXISTS (
          SELECT 1 FROM public.hub_members hm
          WHERE hm.user_id = profiles.user_id
            AND hm.hub_id  = public.get_my_hub_id()
        )
        OR
        -- students enrolled in classrooms belonging to this hub
        EXISTS (
          SELECT 1 FROM public.classroom_students cs
          JOIN  public.classrooms            c ON c.id = cs.classroom_id
          WHERE cs.student_id = profiles.user_id
            AND c.hub_id      = public.get_my_hub_id()
        )
      )
    )
  );

-- Supporting indexes to keep the new EXISTS checks fast
CREATE INDEX IF NOT EXISTS idx_hub_members_user_id        ON public.hub_members(user_id);
CREATE INDEX IF NOT EXISTS idx_classroom_students_student ON public.classroom_students(student_id);

-- ── 3. user_roles cross-hub privilege escalation ─────────────────────────────
-- Old policy let any admin view/mutate roles of users in other hubs.
-- New policy gates on the target user being a hub_member of the admin's hub.
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Admins manage hub roles"
  ON public.user_roles FOR ALL
  USING (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.hub_members hm
        WHERE hm.user_id = user_roles.user_id
          AND hm.hub_id  = public.get_my_hub_id()
      )
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.hub_members hm
        WHERE hm.user_id = user_roles.user_id
          AND hm.hub_id  = public.get_my_hub_id()
      )
    )
  );
