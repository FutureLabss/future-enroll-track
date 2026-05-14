-- Hub-scope programs, cohorts, notifications, organizations, staff_invitations, audit_logs.
-- Pattern: "Admins manage X" covers hub-scoped FOR ALL.
--          "Non-admins view X" is a SELECT-only fallback for students/staff/orgs.
--          This makes admin SELECT hub-scoped without breaking student views.

-- ── 1. Programs: drop overly-broad policies ───────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage programs"            ON public.programs;
DROP POLICY IF EXISTS "Anyone authenticated can view programs" ON public.programs;
-- "Admins manage programs" (hub-scoped FOR ALL) already exists from migration 11 — keep it
-- "Public can view active programs" SELECT with active=true — keep for public pages
CREATE POLICY "Non-admins view programs"
  ON public.programs FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND NOT public.has_role(auth.uid(), 'admin'::app_role)
    AND NOT public.is_superadmin()
  );

-- ── 2. Cohorts: hub-scope admin access ───────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage cohorts"            ON public.cohorts;
DROP POLICY IF EXISTS "Anyone authenticated can view cohorts" ON public.cohorts;
DROP POLICY IF EXISTS "Public can view cohorts"              ON public.cohorts;

CREATE POLICY "Admins manage cohorts"
  ON public.cohorts FOR ALL
  USING (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role)
        AND EXISTS (
          SELECT 1 FROM public.programs p
          WHERE p.id = cohorts.program_id AND p.hub_id = public.get_my_hub_id()
        ))
  )
  WITH CHECK (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role)
        AND EXISTS (
          SELECT 1 FROM public.programs p
          WHERE p.id = program_id AND p.hub_id = public.get_my_hub_id()
        ))
  );

CREATE POLICY "Non-admins view cohorts"
  ON public.cohorts FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND NOT public.has_role(auth.uid(), 'admin'::app_role)
    AND NOT public.is_superadmin()
  );

-- ── 3. Notifications: hub-scope admin access ─────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage notifications" ON public.notifications;

CREATE POLICY "Admins manage notifications"
  ON public.notifications FOR ALL
  USING (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role)
        AND (
          enrollment_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.enrollments e
            JOIN public.programs p ON p.id = e.program_id
            WHERE e.id = notifications.enrollment_id
              AND p.hub_id = public.get_my_hub_id()
          )
        ))
  )
  WITH CHECK (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role)
        AND (
          enrollment_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.enrollments e
            JOIN public.programs p ON p.id = e.program_id
            WHERE e.id = enrollment_id
              AND p.hub_id = public.get_my_hub_id()
          )
        ))
  );

-- ── 4. Organizations: add hub_id + hub-scope RLS ─────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS hub_id uuid REFERENCES public.hubs(id);

UPDATE public.organizations
  SET hub_id = '00000000-0000-0000-0000-000000000001'::uuid
  WHERE hub_id IS NULL;

DROP POLICY IF EXISTS "Admins can manage organizations" ON public.organizations;

CREATE POLICY "Admins manage organizations"
  ON public.organizations FOR ALL
  USING (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  )
  WITH CHECK (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  );

-- ── 5. Staff invitations: hub-scope via classroom.hub_id ─────────────────────
DROP POLICY IF EXISTS "Admins manage invitations" ON public.staff_invitations;

CREATE POLICY "Admins manage invitations"
  ON public.staff_invitations FOR ALL
  USING (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role)
        AND EXISTS (
          SELECT 1 FROM public.classrooms c
          WHERE c.id = staff_invitations.classroom_id
            AND c.hub_id = public.get_my_hub_id()
        ))
  )
  WITH CHECK (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role)
        AND EXISTS (
          SELECT 1 FROM public.classrooms c
          WHERE c.id = classroom_id AND c.hub_id = public.get_my_hub_id()
        ))
  );

-- ── 6. list_audit_logs: filter to users in current hub ───────────────────────
CREATE OR REPLACE FUNCTION public.list_audit_logs(p_limit int DEFAULT 200)
RETURNS TABLE (
  id          uuid,
  user_id     uuid,
  user_email  text,
  action      text,
  entity_type text,
  entity_id   uuid,
  details     jsonb,
  created_at  timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _hub uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only admins can view audit logs';
  END IF;

  _hub := public.get_my_hub_id();

  RETURN QUERY
  SELECT al.id, al.user_id, u.email::text,
         al.action, al.entity_type, al.entity_id, al.details, al.created_at
  FROM public.audit_logs al
  LEFT JOIN auth.users u ON u.id = al.user_id
  WHERE al.user_id IN (
    SELECT hm.user_id FROM public.hub_members hm WHERE hm.hub_id = _hub
  )
  ORDER BY al.created_at DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_audit_logs(int) TO authenticated;
