-- Backfill hub_members for existing admins who are missing a record.
-- They belong to the FutureLabs hub (the only hub managed by the superadmin).
INSERT INTO public.hub_members (hub_id, user_id, hub_role)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, ur.user_id, 'admin'
FROM public.user_roles ur
LEFT JOIN public.hub_members hm ON hm.user_id = ur.user_id
WHERE ur.role = 'admin' AND hm.id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Update handle_new_user so future admin invitees are also added to hub_members
-- by inheriting the hub of the admin who invited them.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_invited_admin boolean;
  _inviter_hub_id uuid;
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

    -- Add new admin to the same hub as their inviter
    SELECT hm.hub_id INTO _inviter_hub_id
    FROM public.pending_admin_invites pai
    JOIN public.hub_members hm ON hm.user_id = pai.invited_by
    WHERE LOWER(pai.email) = LOWER(NEW.email)
    LIMIT 1;

    IF _inviter_hub_id IS NOT NULL THEN
      INSERT INTO public.hub_members (hub_id, user_id, hub_role)
      VALUES (_inviter_hub_id, NEW.id, 'admin')
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
