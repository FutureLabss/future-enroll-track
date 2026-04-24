
CREATE TABLE IF NOT EXISTS public.pending_admin_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  invited_by uuid,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

ALTER TABLE public.pending_admin_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmin manages admin invites" ON public.pending_admin_invites;
CREATE POLICY "Superadmin manages admin invites"
ON public.pending_admin_invites
FOR ALL
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_invited_admin boolean;
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student');

  UPDATE public.enrollments
  SET user_id = NEW.id
  WHERE LOWER(email) = LOWER(NEW.email) AND user_id IS NULL;

  SELECT EXISTS (
    SELECT 1 FROM public.pending_admin_invites
    WHERE LOWER(email) = LOWER(NEW.email) AND accepted_at IS NULL
  ) INTO _is_invited_admin;

  IF _is_invited_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;

    UPDATE public.pending_admin_invites
    SET accepted_at = now()
    WHERE LOWER(email) = LOWER(NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_admin_role_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
BEGIN
  IF NEW.role = 'admin'::app_role THEN
    IF auth.uid() IS NOT NULL AND public.is_superadmin(auth.uid()) THEN
      RETURN NEW;
    END IF;
    IF public.is_superadmin(NEW.user_id) THEN
      RETURN NEW;
    END IF;
    SELECT email INTO _email FROM auth.users WHERE id = NEW.user_id;
    IF _email IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.pending_admin_invites WHERE LOWER(email) = LOWER(_email)
    ) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Only the superadmin can grant the admin role';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_admin_invite(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_user_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can invite admins';
  END IF;

  SELECT id INTO _existing_user_id FROM auth.users WHERE LOWER(email) = LOWER(p_email);
  IF _existing_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_existing_user_id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.pending_admin_invites (email, invited_by)
    VALUES (LOWER(p_email), auth.uid())
    ON CONFLICT (email) DO UPDATE SET invited_at = now(), accepted_at = NULL;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'admin_invite', 'user', _existing_user_id,
          jsonb_build_object('email', p_email, 'pre_existing', _existing_user_id IS NOT NULL));
END;
$$;

DROP FUNCTION IF EXISTS public.list_admins();
CREATE OR REPLACE FUNCTION public.list_admins()
RETURNS TABLE(user_id uuid, email text, is_super boolean, pending boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can list admins';
  END IF;

  RETURN QUERY
  SELECT * FROM (
    SELECT u.id AS user_id, u.email::text AS email, public.is_superadmin(u.id) AS is_super, false AS pending
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    WHERE ur.role = 'admin'::app_role
    UNION ALL
    SELECT NULL::uuid, pi.email, false, true
    FROM public.pending_admin_invites pi
    WHERE pi.accepted_at IS NULL
  ) t
  ORDER BY t.pending, t.email;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_admin_invite(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can cancel invites';
  END IF;
  DELETE FROM public.pending_admin_invites WHERE LOWER(email) = LOWER(p_email) AND accepted_at IS NULL;
END;
$$;
