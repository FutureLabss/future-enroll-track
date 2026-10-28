-- Weekly digest: an issue the admin writes, sent to a saved audience (imported
-- contact lists, CRM leads, hand-picked staff) every Monday 07:00 WAT.
--   * Nothing is sent in a week without a scheduled issue (no repeats of old ones).
--   * Pausing (settings.enabled = false) holds scheduled issues; one still paused
--     a day after its slot is marked skipped instead of going out late.
--   * "Send now" issues go out on the next run even while paused.
--   * Everyone on email_suppressions, and any CRM lead marked suppressed, is excluded.
-- Recipients are materialised into email_digest_deliveries (unique per issue and
-- email) and claimed in batches with SKIP LOCKED, so overlapping runs of the
-- send-weekly-digest function never email anyone twice and a big list resumes
-- across runs.

CREATE TABLE IF NOT EXISTS public.email_digest_settings (
  hub_id                   uuid PRIMARY KEY REFERENCES public.hubs(id) ON DELETE CASCADE,
  enabled                  boolean NOT NULL DEFAULT true,
  include_contacts         boolean NOT NULL DEFAULT true,
  contact_lists            text[] NOT NULL DEFAULT '{}',   -- empty = every list
  include_leads            boolean NOT NULL DEFAULT true,
  excluded_lead_statuses   text[] NOT NULL DEFAULT ARRAY['not_interested'],
  staff_ids                uuid[] NOT NULL DEFAULT '{}',
  updated_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_digests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id           uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  subject          text NOT NULL CHECK (length(trim(subject)) > 0),
  body             text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'skipped', 'cancelled')),
  scheduled_for    timestamptz,
  send_immediately boolean NOT NULL DEFAULT false,
  audience         jsonb,
  recipient_count  integer NOT NULL DEFAULT 0,
  sent_count       integer NOT NULL DEFAULT 0,
  failed_count     integer NOT NULL DEFAULT 0,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz,
  CHECK (status <> 'scheduled' OR scheduled_for IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_email_digests_due ON public.email_digests (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_email_digests_hub ON public.email_digests (hub_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.email_digest_deliveries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id              uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  digest_id           uuid NOT NULL REFERENCES public.email_digests(id) ON DELETE CASCADE,
  normalized_email    text NOT NULL,
  full_name           text,
  recipient_kind      text NOT NULL CHECK (recipient_kind IN ('staff', 'contact', 'lead')),
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts            integer NOT NULL DEFAULT 0,
  claimed_at          timestamptz,
  provider_message_id text,
  error_message       text,
  sent_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (digest_id, normalized_email)
);

CREATE INDEX IF NOT EXISTS idx_email_digest_deliveries_pending ON public.email_digest_deliveries (status, created_at)
  WHERE status IN ('pending', 'sending');

DROP TRIGGER IF EXISTS trg_email_digest_settings_set_hub_id ON public.email_digest_settings;
CREATE TRIGGER trg_email_digest_settings_set_hub_id
  BEFORE INSERT ON public.email_digest_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

DROP TRIGGER IF EXISTS trg_email_digests_set_hub_id ON public.email_digests;
CREATE TRIGGER trg_email_digests_set_hub_id
  BEFORE INSERT ON public.email_digests
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

DROP TRIGGER IF EXISTS update_email_digests_updated_at ON public.email_digests;
CREATE TRIGGER update_email_digests_updated_at
  BEFORE UPDATE ON public.email_digests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Once an issue starts sending, only the sender (service role) may change it.
CREATE OR REPLACE FUNCTION public.email_digests_lock_after_send()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('sending', 'sent') AND COALESCE(auth.role(), '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'This digest has already been sent and can no longer be changed';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_email_digests_lock_after_send ON public.email_digests;
CREATE TRIGGER trg_email_digests_lock_after_send
  BEFORE UPDATE OR DELETE ON public.email_digests
  FOR EACH ROW EXECUTE FUNCTION public.email_digests_lock_after_send();

ALTER TABLE public.email_digest_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_digest_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage digest settings" ON public.email_digest_settings FOR ALL
  USING (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()))
  WITH CHECK (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

CREATE POLICY "Admins manage digests" ON public.email_digests FOR ALL
  USING (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()))
  WITH CHECK (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

CREATE POLICY "Admins read digest deliveries" ON public.email_digest_deliveries FOR SELECT
  USING (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

GRANT SELECT, INSERT, UPDATE ON public.email_digest_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_digests TO authenticated;
GRANT SELECT ON public.email_digest_deliveries TO authenticated;
GRANT ALL ON public.email_digest_settings, public.email_digests, public.email_digest_deliveries TO service_role;

-- ── Audience ────────────────────────────────────────────────────────────────

-- Everyone the hub's digest goes to, one row per email. A person on several
-- sources counts once, labelled staff > contact > lead.
CREATE OR REPLACE FUNCTION public._digest_audience(p_hub_id uuid)
RETURNS TABLE (normalized_email text, full_name text, recipient_kind text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (
    SELECT * FROM public.email_digest_settings WHERE hub_id = p_hub_id
  ),
  candidates AS (
    SELECT lower(trim(st.email)) AS normalized_email, st.full_name, 'staff' AS recipient_kind, 1 AS priority
    FROM public.staff st, s
    WHERE st.hub_id = p_hub_id AND st.active AND st.id = ANY (s.staff_ids)
      AND position('@' IN COALESCE(st.email, '')) > 1
    UNION ALL
    SELECT c.normalized_email, c.full_name, 'contact', 2
    FROM public.email_contacts c, s
    WHERE s.include_contacts AND c.hub_id = p_hub_id
      AND (cardinality(s.contact_lists) = 0 OR c.list_name = ANY (s.contact_lists))
    UNION ALL
    SELECT l.normalized_email, l.full_name, 'lead', 3
    FROM public.crm_leads l, s
    WHERE s.include_leads AND l.hub_id = p_hub_id
      AND l.normalized_email IS NOT NULL AND position('@' IN l.normalized_email) > 1
      AND l.suppressed_at IS NULL
      AND NOT (l.lifecycle_status = ANY (s.excluded_lead_statuses))
  )
  SELECT DISTINCT ON (c.normalized_email) c.normalized_email, c.full_name, c.recipient_kind
  FROM candidates c
  WHERE NOT EXISTS (SELECT 1 FROM public.email_suppressions x WHERE x.hub_id = p_hub_id AND x.normalized_email = c.normalized_email)
    AND NOT EXISTS (SELECT 1 FROM public.crm_leads l WHERE l.hub_id = p_hub_id AND l.normalized_email = c.normalized_email AND l.suppressed_at IS NOT NULL)
  ORDER BY c.normalized_email, c.priority;
$$;

REVOKE ALL ON FUNCTION public._digest_audience(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.preview_digest_audience()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub uuid := public.get_my_hub_id();
BEGIN
  IF NOT (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'total', count(*),
      'staff', count(*) FILTER (WHERE recipient_kind = 'staff'),
      'contacts', count(*) FILTER (WHERE recipient_kind = 'contact'),
      'leads', count(*) FILTER (WHERE recipient_kind = 'lead'),
      'suppressed', (SELECT count(*) FROM public.email_suppressions WHERE hub_id = _hub)
    )
    FROM public._digest_audience(_hub)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_digest_audience() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_digest_audience() TO authenticated;

-- ── Sender-side steps (service role only; called by send-weekly-digest) ─────

-- Moves due issues to 'sending' and materialises their recipients.
CREATE OR REPLACE FUNCTION public.start_due_digests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _d       record;
  _started integer := 0;
  _count   integer;
BEGIN
  UPDATE public.email_digests d
     SET status = 'skipped'
   WHERE d.status = 'scheduled' AND NOT d.send_immediately
     AND d.scheduled_for < now() - interval '1 day'
     AND NOT COALESCE((SELECT s.enabled FROM public.email_digest_settings s WHERE s.hub_id = d.hub_id), true);

  FOR _d IN
    SELECT d.* FROM public.email_digests d
    WHERE d.status = 'scheduled' AND d.scheduled_for <= now()
      AND (d.send_immediately OR COALESCE((SELECT s.enabled FROM public.email_digest_settings s WHERE s.hub_id = d.hub_id), true))
    ORDER BY d.scheduled_for
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.email_digest_deliveries (hub_id, digest_id, normalized_email, full_name, recipient_kind)
    SELECT _d.hub_id, _d.id, a.normalized_email, a.full_name, a.recipient_kind
    FROM public._digest_audience(_d.hub_id) a
    ON CONFLICT (digest_id, normalized_email) DO NOTHING;

    SELECT count(*) INTO _count FROM public.email_digest_deliveries WHERE digest_id = _d.id;

    UPDATE public.email_digests
       SET status = 'sending',
           recipient_count = _count,
           audience = (SELECT to_jsonb(s) - 'hub_id' - 'updated_by' - 'updated_at' FROM public.email_digest_settings s WHERE s.hub_id = _d.hub_id)
     WHERE id = _d.id;
    _started := _started + 1;
  END LOOP;

  RETURN _started;
END;
$$;

-- Claims up to p_limit recipients to send now. Rows stuck in 'sending' for 15
-- minutes (a run that died mid-batch) go back to the queue, at most 3 attempts.
CREATE OR REPLACE FUNCTION public.claim_digest_deliveries(p_limit integer DEFAULT 50)
RETURNS TABLE (
  delivery_id      uuid,
  digest_id        uuid,
  hub_id           uuid,
  normalized_email text,
  full_name        text,
  subject          text,
  body             text,
  hub_name         text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  UPDATE public.email_digest_deliveries
     SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
         error_message = CASE WHEN attempts >= 3 THEN 'Gave up after 3 attempts' ELSE error_message END
   WHERE status = 'sending' AND claimed_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH picked AS (
    SELECT x.id FROM public.email_digest_deliveries x
    WHERE x.status = 'pending'
    ORDER BY x.created_at
    LIMIT GREATEST(1, LEAST(p_limit, 200))
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.email_digest_deliveries x
       SET status = 'sending', attempts = x.attempts + 1, claimed_at = now()
      FROM picked
     WHERE x.id = picked.id
    RETURNING x.id, x.digest_id, x.hub_id, x.normalized_email, x.full_name
  )
  SELECT c.id, c.digest_id, c.hub_id, c.normalized_email, c.full_name, d.subject, d.body, h.name
  FROM claimed c
  JOIN public.email_digests d ON d.id = c.digest_id
  LEFT JOIN public.hubs h ON h.id = c.hub_id;
END;
$$;

-- Marks issues finished once none of their recipients are still queued.
CREATE OR REPLACE FUNCTION public.finish_digests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer;
BEGIN
  WITH done AS (
    UPDATE public.email_digests d
       SET status = 'sent',
           sent_at = now(),
           sent_count = (SELECT count(*) FROM public.email_digest_deliveries x WHERE x.digest_id = d.id AND x.status = 'sent'),
           failed_count = (SELECT count(*) FROM public.email_digest_deliveries x WHERE x.digest_id = d.id AND x.status = 'failed')
     WHERE d.status = 'sending'
       AND NOT EXISTS (SELECT 1 FROM public.email_digest_deliveries x WHERE x.digest_id = d.id AND x.status IN ('pending', 'sending'))
    RETURNING d.id, d.hub_id, d.subject, d.created_by
  ), logged AS (
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    SELECT done.created_by, 'weekly_digest_sent', 'email_digest', done.id,
           jsonb_build_object('subject', done.subject, 'hub_id', done.hub_id)
    FROM done
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM logged;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.start_due_digests() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_digest_deliveries(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_digests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_due_digests() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_digest_deliveries(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_digests() TO service_role;

-- ── Unsubscribe (called by the email-unsubscribe function, service role) ────

CREATE OR REPLACE FUNCTION public.unsubscribe_email(p_hub_id uuid, p_email text, p_source text DEFAULT 'digest_link')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text := lower(trim(p_email));
BEGIN
  INSERT INTO public.email_suppressions (hub_id, normalized_email, reason, source)
  VALUES (p_hub_id, _email, 'unsubscribed', p_source)
  ON CONFLICT (hub_id, normalized_email) DO NOTHING;

  WITH changed AS (
    UPDATE public.crm_leads
       SET marketing_consent = false,
           suppressed_at = COALESCE(suppressed_at, now()),
           suppression_reason = COALESCE(suppression_reason, 'unsubscribed')
     WHERE hub_id = p_hub_id AND normalized_email = _email AND suppressed_at IS NULL
    RETURNING id, hub_id
  )
  INSERT INTO public.marketing_consent_history (hub_id, lead_id, consented, source)
  SELECT hub_id, id, false, p_source FROM changed;

  UPDATE public.marketing_campaign_enrollments e
     SET status = 'stopped', stop_reason = 'unsubscribed'
    FROM public.crm_leads l
   WHERE l.id = e.lead_id AND l.hub_id = p_hub_id AND l.normalized_email = _email
     AND e.status IN ('active', 'paused');
END;
$$;

REVOKE ALL ON FUNCTION public.unsubscribe_email(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_email(uuid, text, text) TO service_role;
