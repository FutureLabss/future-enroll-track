-- Superadmin-only RPC to switch hub context (bypasses hub_members RLS)
CREATE OR REPLACE FUNCTION public.switch_hub_context(p_hub_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only superadmins can switch hub context';
  END IF;
  UPDATE public.hub_members
  SET hub_id = p_hub_id, hub_role = 'owner'
  WHERE user_id = auth.uid();
END;
$$;

-- Returns the caller's current hub (bypasses hub_members RLS)
CREATE OR REPLACE FUNCTION public.get_my_hub_context()
RETURNS TABLE(hub_id uuid, hub_name text, hub_slug text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT h.id, h.name, h.slug
  FROM public.hub_members hm
  JOIN public.hubs h ON h.id = hm.hub_id
  WHERE hm.user_id = auth.uid();
$$;

-- Returns all hubs (superadmin only, for the hub switcher dropdown)
CREATE OR REPLACE FUNCTION public.list_hubs()
RETURNS TABLE(id uuid, name text, slug text)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only superadmins can list all hubs';
  END IF;
  RETURN QUERY SELECT h.id, h.name::text, h.slug::text FROM public.hubs h ORDER BY h.name;
END;
$$;
