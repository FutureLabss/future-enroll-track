-- =====================================================================
-- Multitenancy: Hub (tenant) isolation
-- Each hub is a separate school/organization using this platform.
-- Existing data is migrated to the default "FutureLabs" hub.
-- =====================================================================

-- 1. Superadmins table (avoids enum transaction ordering issues)
-- A superadmin is a platform-level operator who manages all hubs.
CREATE TABLE IF NOT EXISTS public.superadmins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.superadmins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins read own record" ON public.superadmins FOR SELECT USING (user_id = auth.uid());

-- 2. Hubs table (each hub = one tenant)
CREATE TABLE IF NOT EXISTS public.hubs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  contact_email text,
  logo_url      text,
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'suspended', 'trial')),
  plan          text NOT NULL DEFAULT 'starter'
                  CHECK (plan IN ('starter', 'growth', 'enterprise')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hubs ENABLE ROW LEVEL SECURITY;

-- 3. Hub members (user ↔ hub, one hub per user for now)
CREATE TABLE IF NOT EXISTS public.hub_members (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id    uuid REFERENCES public.hubs(id) ON DELETE CASCADE NOT NULL,
  user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  hub_role  text NOT NULL DEFAULT 'member'
              CHECK (hub_role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)   -- one hub per user
);
ALTER TABLE public.hub_members ENABLE ROW LEVEL SECURITY;

-- 4. Hub invitations
CREATE TABLE IF NOT EXISTS public.hub_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id      uuid REFERENCES public.hubs(id) ON DELETE CASCADE NOT NULL,
  email       text NOT NULL,
  token       text NOT NULL UNIQUE,
  hub_role    text NOT NULL DEFAULT 'owner',
  accepted_at timestamptz,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hub_invitations ENABLE ROW LEVEL SECURITY;

-- 5. Helper functions
CREATE OR REPLACE FUNCTION public.get_my_hub_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT hub_id FROM public.hub_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = auth.uid());
$$;

-- 6. Seed the default hub for existing FutureLabs data
INSERT INTO public.hubs (id, name, slug, status, plan)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'FutureLabs', 'futurelabs', 'active', 'enterprise')
ON CONFLICT (id) DO NOTHING;

-- 7. Add hub_id to top-level entity tables
ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS hub_id uuid REFERENCES public.hubs(id)
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.classrooms
  ADD COLUMN IF NOT EXISTS hub_id uuid REFERENCES public.hubs(id)
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS hub_id uuid REFERENCES public.hubs(id)
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- 8. Backfill existing rows to the default hub
UPDATE public.programs  SET hub_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE hub_id IS NULL;
UPDATE public.classrooms SET hub_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE hub_id IS NULL;
UPDATE public.staff      SET hub_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE hub_id IS NULL;

-- 9. Backfill hub_members for existing admin users
INSERT INTO public.hub_members (hub_id, user_id, hub_role)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, user_id, 'admin'
FROM public.user_roles
WHERE role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

-- Backfill hub_members for existing classroom staff (tutors, etc.) who have accepted
INSERT INTO public.hub_members (hub_id, user_id, hub_role)
SELECT DISTINCT '00000000-0000-0000-0000-000000000001'::uuid, user_id, 'member'
FROM public.classroom_staff
WHERE user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- 10. RLS for hubs
CREATE POLICY "Superadmins manage hubs"
  ON public.hubs FOR ALL
  USING (public.is_superadmin());

CREATE POLICY "Hub members view own hub"
  ON public.hubs FOR SELECT
  USING (id = public.get_my_hub_id());

-- 11. RLS for hub_members
CREATE POLICY "Superadmins manage hub_members"
  ON public.hub_members FOR ALL
  USING (public.is_superadmin());

CREATE POLICY "Hub owners manage members"
  ON public.hub_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.hub_members hm
      WHERE hm.user_id = auth.uid()
        AND hm.hub_id = hub_members.hub_id
        AND hm.hub_role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Members view own record"
  ON public.hub_members FOR SELECT
  USING (user_id = auth.uid());

-- 12. RLS for hub_invitations
CREATE POLICY "Superadmins manage hub_invitations"
  ON public.hub_invitations FOR ALL
  USING (public.is_superadmin());

CREATE POLICY "Hub owners manage invitations"
  ON public.hub_invitations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.hub_members hm
      WHERE hm.user_id = auth.uid()
        AND hm.hub_id = hub_invitations.hub_id
        AND hm.hub_role IN ('owner', 'admin')
    )
  );

-- Public read of own invitation token (for accept flow)
CREATE POLICY "Read own hub invitation by token"
  ON public.hub_invitations FOR SELECT
  USING (true);  -- token is secret; front-end filters by token

-- 13. Update programs RLS to add hub scoping
DROP POLICY IF EXISTS "Admins manage programs" ON public.programs;
CREATE POLICY "Admins manage programs"
  ON public.programs FOR ALL
  USING (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  );

-- 14. Update classrooms RLS to add hub scoping
DROP POLICY IF EXISTS "Admins manage classrooms" ON public.classrooms;
CREATE POLICY "Admins manage classrooms"
  ON public.classrooms FOR ALL
  USING (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  );

-- Staff table — update existing admin policy
DROP POLICY IF EXISTS "Admins read staff" ON public.staff;
CREATE POLICY "Admins read staff"
  ON public.staff FOR SELECT
  USING (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  );

-- 15. RPC: accept a hub invitation
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

  -- Assign user to hub
  INSERT INTO public.hub_members (hub_id, user_id, hub_role)
  VALUES (v_inv.hub_id, p_user_id, v_inv.hub_role)
  ON CONFLICT (user_id) DO UPDATE SET hub_id = v_inv.hub_id, hub_role = v_inv.hub_role;

  -- Mark invitation accepted
  UPDATE public.hub_invitations SET accepted_at = now() WHERE id = v_inv.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_hub_invitation(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_hub_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
