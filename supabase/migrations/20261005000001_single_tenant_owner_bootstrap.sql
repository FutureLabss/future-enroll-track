-- Bootstrap the single Coriftech installation on a fresh project.
-- Legacy hub columns remain temporarily for backwards-compatible RPCs, but
-- constraints make a second tenant impossible and no hub UI/API is exposed.

ALTER TABLE public.superadmins RENAME TO system_owners;

CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.system_owners WHERE user_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION public.is_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner(uuid) TO authenticated, service_role;

-- Compatibility for existing business RPCs and RLS policies while they are
-- flattened. All privilege truth now comes from system_owners.
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.is_owner(auth.uid()) $$;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.is_owner(_user_id) $$;

INSERT INTO public.hubs (id, name, slug, status, plan)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Coriftech Solutions Ltd.',
  'coriftech',
  'active',
  'enterprise'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  status = EXCLUDED.status,
  plan = EXCLUDED.plan;

ALTER TABLE public.hubs
  ADD CONSTRAINT hubs_single_tenant_only
  CHECK (id = '00000000-0000-0000-0000-000000000001'::uuid);

ALTER TABLE public.hub_members
  ADD CONSTRAINT hub_members_single_tenant_only
  CHECK (hub_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Service-role Edge Functions have no auth context. Give every remaining
-- legacy scope column the sole installation id so inserts cannot fail and can
-- never create data for another tenant.
DO $$
DECLARE scoped_table record;
BEGIN
  FOR scoped_table IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'hub_id'
      AND table_name NOT IN ('hubs')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN hub_id SET DEFAULT %L::uuid',
      scoped_table.table_schema,
      scoped_table.table_name,
      '00000000-0000-0000-0000-000000000001'
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.provision_system_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.hub_members (hub_id, user_id, hub_role)
  VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    NEW.user_id,
    'owner'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    hub_id = EXCLUDED.hub_id,
    hub_role = EXCLUDED.hub_role,
    demo_expires_at = NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER provision_system_owner_after_insert
AFTER INSERT ON public.system_owners
FOR EACH ROW EXECUTE FUNCTION public.provision_system_owner();

DROP POLICY IF EXISTS "Owners read owner records" ON public.system_owners;
CREATE POLICY "Owners read owner records"
ON public.system_owners
FOR SELECT
TO authenticated
USING (public.is_owner(auth.uid()));

COMMENT ON TABLE public.system_owners IS
  'Users allowed to perform installation-wide sensitive operations.';
