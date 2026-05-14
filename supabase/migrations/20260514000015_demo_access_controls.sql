-- Demo access controls:
-- 1. hub_invitations.is_demo flag
-- 2. hub_members.demo_expires_at
-- 3. has_role() gates on demo expiry
-- 4. accept_hub_invitation() sets 1-hour window on demo accepts

ALTER TABLE public.hub_invitations
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.hub_members
  ADD COLUMN IF NOT EXISTS demo_expires_at timestamptz;

-- has_role: returns false if this user's demo access has expired
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.hub_members hm
    WHERE hm.user_id = _user_id
      AND hm.demo_expires_at IS NOT NULL
      AND hm.demo_expires_at <= now()
  )
$$;

-- accept_hub_invitation: set demo_expires_at = now() + 1 hour for demo invites
CREATE OR REPLACE FUNCTION public.accept_hub_invitation(p_token text, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv public.hub_invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv
  FROM public.hub_invitations
  WHERE token = p_token
    AND accepted_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation is invalid or has expired';
  END IF;

  INSERT INTO public.hub_members (hub_id, user_id, hub_role, demo_expires_at)
  VALUES (
    v_inv.hub_id,
    p_user_id,
    v_inv.hub_role,
    CASE WHEN v_inv.is_demo THEN now() + interval '1 hour' ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE
    SET hub_id          = v_inv.hub_id,
        hub_role        = v_inv.hub_role,
        demo_expires_at = CASE WHEN v_inv.is_demo THEN now() + interval '1 hour' ELSE NULL END;

  UPDATE public.hub_invitations SET accepted_at = now() WHERE id = v_inv.id;
END;
$$;
