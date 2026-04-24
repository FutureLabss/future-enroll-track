
-- Helper: identify superadmin by email
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = _user_id
      AND LOWER(email) = LOWER('Manassehudim@gmail.com')
  )
$$;

-- Trigger function: block non-superadmin admin role grants
CREATE OR REPLACE FUNCTION public.enforce_admin_role_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'admin'::app_role THEN
    -- Allow if the acting user is the superadmin, OR if the row is for the superadmin themselves
    IF auth.uid() IS NULL OR NOT public.is_superadmin(auth.uid()) THEN
      IF NOT public.is_superadmin(NEW.user_id) THEN
        RAISE EXCEPTION 'Only the superadmin can grant the admin role';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_admin_role_grant_trg ON public.user_roles;
CREATE TRIGGER enforce_admin_role_grant_trg
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_role_grant();

-- Ensure superadmin always has admin role
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE LOWER(email) = LOWER('Manassehudim@gmail.com')
ON CONFLICT DO NOTHING;

-- RPC: superadmin invites an existing user to become admin by email
CREATE OR REPLACE FUNCTION public.invite_admin(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target_user_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can invite admins';
  END IF;

  SELECT id INTO _target_user_id FROM auth.users WHERE LOWER(email) = LOWER(p_email);
  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with email %. They must sign up first.', p_email;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target_user_id, 'admin'::app_role)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'invite_admin', 'user', _target_user_id,
          jsonb_build_object('email', p_email));
END;
$$;

-- RPC: superadmin revokes admin from a user (cannot revoke self)
CREATE OR REPLACE FUNCTION public.revoke_admin(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target_user_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can revoke admins';
  END IF;

  SELECT id INTO _target_user_id FROM auth.users WHERE LOWER(email) = LOWER(p_email);
  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with email %', p_email;
  END IF;

  IF public.is_superadmin(_target_user_id) THEN
    RAISE EXCEPTION 'Cannot revoke the superadmin';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user_id AND role = 'admin'::app_role;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'revoke_admin', 'user', _target_user_id,
          jsonb_build_object('email', p_email));
END;
$$;

-- RPC: list all admin users (only superadmin can see)
CREATE OR REPLACE FUNCTION public.list_admins()
RETURNS TABLE(user_id uuid, email text, is_super boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can list admins';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text, public.is_superadmin(u.id)
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.role = 'admin'::app_role
  ORDER BY u.email;
END;
$$;
