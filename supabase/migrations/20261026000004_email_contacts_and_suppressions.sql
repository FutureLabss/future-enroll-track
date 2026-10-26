-- Reusable mailing contacts (e.g. imported past students) and a hub-wide
-- unsubscribe list that every newsletter-style send must honour.
--
-- email_contacts: people outside the app's own tables, grouped by list_name
-- ("Past students 2025"). One row per (hub, email, list) so a person can sit on
-- several lists; sends dedupe by email.
-- email_suppressions: one row per (hub, email) that must never receive
-- newsletter mail again. Written by the unsubscribe link (email-unsubscribe)
-- and, for CRM leads, mirrored onto crm_leads.suppressed_at.

CREATE TABLE IF NOT EXISTS public.email_contacts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id           uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  email            text NOT NULL CHECK (position('@' IN email) > 1),
  normalized_email text GENERATED ALWAYS AS (lower(trim(email))) STORED,
  full_name        text,
  list_name        text NOT NULL DEFAULT 'Past students',
  source           text NOT NULL DEFAULT 'import',
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub_id, normalized_email, list_name)
);

CREATE INDEX IF NOT EXISTS idx_email_contacts_hub_list ON public.email_contacts (hub_id, list_name);

DROP TRIGGER IF EXISTS trg_email_contacts_set_hub_id ON public.email_contacts;
CREATE TRIGGER trg_email_contacts_set_hub_id
  BEFORE INSERT ON public.email_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

ALTER TABLE public.email_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage email contacts"
  ON public.email_contacts FOR ALL
  USING (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()))
  WITH CHECK (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id           uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  normalized_email text NOT NULL,
  reason           text NOT NULL DEFAULT 'unsubscribed' CHECK (reason IN ('unsubscribed', 'bounced', 'complained', 'manual')),
  source           text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub_id, normalized_email)
);

DROP TRIGGER IF EXISTS trg_email_suppressions_set_hub_id ON public.email_suppressions;
CREATE TRIGGER trg_email_suppressions_set_hub_id
  BEFORE INSERT ON public.email_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

-- Admins can see and add suppressions; removing one (re-subscribing someone who
-- opted out) is deliberately not offered.
CREATE POLICY "Admins read email suppressions"
  ON public.email_suppressions FOR SELECT
  USING (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

CREATE POLICY "Admins add email suppressions"
  ON public.email_suppressions FOR INSERT
  WITH CHECK (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_contacts TO authenticated;
GRANT SELECT, INSERT ON public.email_suppressions TO authenticated;
GRANT ALL ON public.email_contacts, public.email_suppressions TO service_role;

-- Bulk import from the admin's CSV. Skips duplicates already on the list and
-- reports how many were added vs already there.
CREATE OR REPLACE FUNCTION public.import_email_contacts(p_list_name text, p_contacts jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub   uuid := public.get_my_hub_id();
  _list  text := NULLIF(trim(p_list_name), '');
  _total int;
  _added int;
BEGIN
  IF NOT (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _hub IS NULL THEN
    RAISE EXCEPTION 'No hub context';
  END IF;
  IF _list IS NULL THEN
    RAISE EXCEPTION 'List name is required';
  END IF;

  WITH incoming AS (
    SELECT DISTINCT ON (lower(trim(c->>'email')))
           trim(c->>'email') AS email, NULLIF(trim(c->>'name'), '') AS full_name
    FROM jsonb_array_elements(COALESCE(p_contacts, '[]'::jsonb)) c
    WHERE position('@' IN COALESCE(c->>'email', '')) > 1
  ), ins AS (
    INSERT INTO public.email_contacts (hub_id, email, full_name, list_name, source, created_by)
    SELECT _hub, i.email, i.full_name, _list, 'import', auth.uid() FROM incoming i
    ON CONFLICT (hub_id, normalized_email, list_name) DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM incoming), (SELECT count(*) FROM ins) INTO _total, _added;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'import_email_contacts', 'email_contacts', NULL,
          jsonb_build_object('list_name', _list, 'valid', _total, 'added', _added, 'hub_id', _hub));

  RETURN jsonb_build_object('valid', _total, 'added', _added, 'already_listed', _total - _added);
END;
$$;

REVOKE ALL ON FUNCTION public.import_email_contacts(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_email_contacts(text, jsonb) TO authenticated;
