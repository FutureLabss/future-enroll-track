-- Who may open Project Tracker, and with which Tracker role. Only the superadmin
-- grants or revokes; the project-tracker-access function pushes each change to the
-- Tracker, and redeem-project-tracker-sso re-checks it at every sign-in.
-- No hub_id: the Tracker is one workspace for the whole company, not per hub.
CREATE TABLE public.project_tracker_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tracker_role text NOT NULL CHECK (tracker_role IN ('member', 'manager', 'admin')),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  -- Set once the Tracker has applied the row as of updated_at; cleared on every change.
  synced_at timestamptz,
  sync_error text
);
ALTER TABLE public.project_tracker_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_tracker_access FROM public, anon, authenticated;
GRANT SELECT ON public.project_tracker_access TO authenticated;
GRANT ALL ON public.project_tracker_access TO service_role;
CREATE POLICY "Superadmin reads tracker access" ON public.project_tracker_access
  FOR SELECT USING (public.is_superadmin());
CREATE POLICY "Users read own tracker access" ON public.project_tracker_access
  FOR SELECT USING (user_id = auth.uid());

-- Staff-side accounts only: students and sponsor organisations never get the Tracker.
CREATE FUNCTION public.is_project_tracker_eligible(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = p_user_id)
      OR EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = p_user_id AND role IN ('admin', 'staff', 'marketing'));
$$;
REVOKE ALL ON FUNCTION public.is_project_tracker_eligible(uuid) FROM public, anon, authenticated;

CREATE FUNCTION public.list_project_tracker_access()
RETURNS TABLE (
  user_id uuid, full_name text, email text, tracker_role text,
  granted_at timestamptz, updated_at timestamptz, revoked_at timestamptz,
  synced_at timestamptz, sync_error text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only the superadmin can manage Project Tracker access';
  END IF;
  RETURN QUERY
  SELECT a.user_id, coalesce(p.full_name, u.email::text), coalesce(p.email, u.email::text),
         a.tracker_role, a.granted_at, a.updated_at, a.revoked_at, a.synced_at, a.sync_error
  FROM public.project_tracker_access a
  JOIN auth.users u ON u.id = a.user_id
  LEFT JOIN public.profiles p ON p.user_id = a.user_id
  ORDER BY (a.revoked_at IS NULL) DESC, lower(coalesce(p.full_name, u.email::text));
END $$;
REVOKE ALL ON FUNCTION public.list_project_tracker_access() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_project_tracker_access() TO authenticated;

CREATE FUNCTION public.list_project_tracker_candidates()
RETURNS TABLE (user_id uuid, full_name text, email text, lms_roles text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only the superadmin can manage Project Tracker access';
  END IF;
  RETURN QUERY
  SELECT u.id, coalesce(p.full_name, u.email::text), coalesce(p.email, u.email::text),
         array_remove(array_agg(DISTINCT r.role::text) ||
           CASE WHEN EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = u.id)
                THEN ARRAY['superadmin'] ELSE ARRAY[]::text[] END, NULL)
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  LEFT JOIN public.user_roles r ON r.user_id = u.id AND r.role IN ('admin', 'staff', 'marketing')
  WHERE public.is_project_tracker_eligible(u.id)
    AND NOT EXISTS (SELECT 1 FROM public.project_tracker_access a
                    WHERE a.user_id = u.id AND a.revoked_at IS NULL)
  GROUP BY u.id, p.full_name, p.email, u.email
  ORDER BY lower(coalesce(p.full_name, u.email::text));
END $$;
REVOKE ALL ON FUNCTION public.list_project_tracker_candidates() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_project_tracker_candidates() TO authenticated;

-- Grants access, changes the role of an existing grant, or restores a revoked one.
CREATE FUNCTION public.set_project_tracker_access(p_user_id uuid, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _old public.project_tracker_access;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only the superadmin can manage Project Tracker access';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('member', 'manager', 'admin') THEN
    RAISE EXCEPTION 'Choose a Tracker role: member, manager or admin';
  END IF;
  IF NOT public.is_project_tracker_eligible(p_user_id) THEN
    RAISE EXCEPTION 'Only admin, staff or marketing accounts can be given Project Tracker access';
  END IF;

  SELECT * INTO _old FROM public.project_tracker_access WHERE user_id = p_user_id FOR UPDATE;
  IF FOUND AND _old.revoked_at IS NULL AND _old.tracker_role = p_role THEN
    RETURN;
  END IF;

  INSERT INTO public.project_tracker_access (user_id, tracker_role, granted_by)
  VALUES (p_user_id, p_role, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET
    tracker_role = EXCLUDED.tracker_role,
    granted_by = CASE WHEN project_tracker_access.revoked_at IS NULL
                      THEN project_tracker_access.granted_by ELSE EXCLUDED.granted_by END,
    granted_at = CASE WHEN project_tracker_access.revoked_at IS NULL
                      THEN project_tracker_access.granted_at ELSE now() END,
    updated_at = now(),
    revoked_at = NULL,
    synced_at = NULL,
    sync_error = NULL;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN _old.user_id IS NULL OR _old.revoked_at IS NOT NULL
         THEN 'grant_project_tracker_access' ELSE 'change_project_tracker_role' END,
    'project_tracker_access', p_user_id,
    jsonb_build_object('from_role', CASE WHEN _old.revoked_at IS NULL THEN _old.tracker_role END,
                       'to_role', p_role)
  );
END $$;
REVOKE ALL ON FUNCTION public.set_project_tracker_access(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_project_tracker_access(uuid, text) TO authenticated;

CREATE FUNCTION public.revoke_project_tracker_access(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _old public.project_tracker_access;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only the superadmin can manage Project Tracker access';
  END IF;
  SELECT * INTO _old FROM public.project_tracker_access WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR _old.revoked_at IS NOT NULL THEN
    RETURN;
  END IF;
  UPDATE public.project_tracker_access
  SET revoked_at = now(), updated_at = now(), synced_at = NULL, sync_error = NULL
  WHERE user_id = p_user_id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'revoke_project_tracker_access', 'project_tracker_access', p_user_id,
          jsonb_build_object('from_role', _old.tracker_role));
END $$;
REVOKE ALL ON FUNCTION public.revoke_project_tracker_access(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.revoke_project_tracker_access(uuid) TO authenticated;

-- Drives the sidebar link only; the SSO functions enforce access themselves.
CREATE FUNCTION public.has_project_tracker_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_tracker_access
                 WHERE user_id = auth.uid() AND revoked_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.has_project_tracker_access() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_project_tracker_access() TO authenticated;

-- What the Tracker is told about a person. active is false for a revoked grant, a
-- missing grant, or an account that is no longer staff-side.
CREATE FUNCTION public.project_tracker_identity(p_user_id uuid)
RETURNS TABLE (user_id uuid, full_name text, email text, tracker_role text,
               active boolean, version timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, coalesce(p.full_name, u.email::text), coalesce(p.email, u.email::text),
         a.tracker_role,
         a.user_id IS NOT NULL AND a.revoked_at IS NULL
           AND public.is_project_tracker_eligible(u.id),
         a.updated_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  LEFT JOIN public.project_tracker_access a ON a.user_id = u.id
  WHERE u.id = p_user_id;
$$;
REVOKE ALL ON FUNCTION public.project_tracker_identity(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_tracker_identity(uuid) TO service_role;

-- Records a push only if the row has not changed since the pushed version.
CREATE FUNCTION public.record_project_tracker_sync(p_user_id uuid, p_version timestamptz, p_error text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.project_tracker_access
  SET synced_at = CASE WHEN p_error IS NULL THEN now() END,
      sync_error = left(p_error, 500)
  WHERE user_id = p_user_id AND updated_at = p_version;
$$;
REVOKE ALL ON FUNCTION public.record_project_tracker_sync(uuid, timestamptz, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_project_tracker_sync(uuid, timestamptz, text) TO service_role;
