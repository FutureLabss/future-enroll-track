-- Backfill the one admin still missing a hub_members entry
INSERT INTO public.hub_members (hub_id, user_id, hub_role)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, ur.user_id, 'admin'
FROM public.user_roles ur
LEFT JOIN public.hub_members hm ON hm.user_id = ur.user_id
WHERE ur.role = 'admin' AND hm.id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Fix create_admin_invite: when the user already exists, also add them to
-- the inviter's hub so get_my_hub_id() returns a value and RLS lets data through.
CREATE OR REPLACE FUNCTION public.create_admin_invite(p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _existing_user_id uuid;
  _inviter_hub_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can invite admins';
  END IF;

  SELECT id INTO _existing_user_id FROM auth.users WHERE LOWER(email) = LOWER(p_email);

  IF _existing_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_existing_user_id, 'admin')
    ON CONFLICT DO NOTHING;

    -- Also add to hub_members so RLS data-scoping works
    SELECT hub_id INTO _inviter_hub_id FROM public.hub_members WHERE user_id = auth.uid();
    IF _inviter_hub_id IS NOT NULL THEN
      INSERT INTO public.hub_members (hub_id, user_id, hub_role)
      VALUES (_inviter_hub_id, _existing_user_id, 'admin')
      ON CONFLICT (user_id) DO UPDATE SET hub_id = _inviter_hub_id, hub_role = 'admin';
    END IF;
  ELSE
    INSERT INTO public.pending_admin_invites (email, invited_by)
    VALUES (LOWER(p_email), auth.uid())
    ON CONFLICT (email) DO UPDATE SET invited_at = now(), accepted_at = NULL;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'admin_invite', 'user', _existing_user_id,
          jsonb_build_object('email', p_email, 'pre_existing', _existing_user_id IS NOT NULL));
END;
$function$;
