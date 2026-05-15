-- ── 1. custom_fields: add hub_id, backfill, scope admin policy, add trigger ───

ALTER TABLE public.custom_fields
  ADD COLUMN IF NOT EXISTS hub_id uuid REFERENCES public.hubs(id);

UPDATE public.custom_fields
  SET hub_id = '00000000-0000-0000-0000-000000000001'::uuid
  WHERE hub_id IS NULL;

-- Replace unscoped admin policy with hub-scoped one.
-- Student/public SELECT policies ("Authenticated can view active fields" and
-- "Public can view active student-visible fields") stay unscoped — field
-- definitions are not sensitive and students are not in hub_members so
-- get_my_hub_id() would return NULL for them.
DROP POLICY IF EXISTS "Admins can manage custom fields" ON public.custom_fields;

CREATE POLICY "Admins manage custom fields"
  ON public.custom_fields FOR ALL
  USING (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  )
  WITH CHECK (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  );

DROP TRIGGER IF EXISTS trg_custom_fields_set_hub_id ON public.custom_fields;
CREATE TRIGGER trg_custom_fields_set_hub_id
  BEFORE INSERT ON public.custom_fields
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

-- ── 2. audit_logs: scope admin SELECT to current hub's users only ─────────────
-- Previously any admin could read all audit logs across all hubs.
-- Now mirrors what list_audit_logs() RPC already enforces.
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;

CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    public.is_superadmin()
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND user_id IN (
        SELECT hm.user_id FROM public.hub_members hm
        WHERE hm.hub_id = public.get_my_hub_id()
      )
    )
  );
