-- Backfill: hub_members with hub_role='admin' missing the admin app_role
INSERT INTO public.user_roles (user_id, role)
SELECT hm.user_id, 'admin'::app_role
FROM public.hub_members hm
WHERE hm.hub_role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = hm.user_id AND ur.role = 'admin'::app_role
  )
ON CONFLICT (user_id, role) DO NOTHING;

-- Fix accept_hub_invitation to grant the admin app_role server-side so the
-- client-side upsert (which can silently fail) is no longer the single point of failure.
CREATE OR REPLACE FUNCTION public.accept_hub_invitation(p_token text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  -- Grant the admin app_role so RLS policies using has_role() work correctly.
  -- Only grant for non-demo invitations (demo users get student-level access via has_role check).
  IF NOT v_inv.is_demo THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  UPDATE public.hub_invitations SET accepted_at = now() WHERE id = v_inv.id;
END;
$$;
