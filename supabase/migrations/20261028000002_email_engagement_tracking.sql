-- Delivery, open and click tracking for the weekly digest and onboarding emails,
-- fed by Resend's webhook (resend-marketing-webhook, which already does this for
-- CRM campaign emails). A permanent bounce or a spam complaint on any of them puts
-- the address on email_suppressions, so dead or unwilling inboxes stop being
-- mailed by every sender and stop dragging down the domain's reputation.
-- Opens are approximate: Apple Mail preloads images, some clients block them.

ALTER TABLE public.email_digest_deliveries
  ADD COLUMN IF NOT EXISTS delivered_at  timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at     timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at    timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at    timestamptz,
  ADD COLUMN IF NOT EXISTS complained_at timestamptz;

ALTER TABLE public.onboarding_deliveries
  ADD COLUMN IF NOT EXISTS delivered_at  timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at     timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at    timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at    timestamptz,
  ADD COLUMN IF NOT EXISTS complained_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_email_digest_deliveries_provider ON public.email_digest_deliveries (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_onboarding_deliveries_provider ON public.onboarding_deliveries (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Like unsubscribe_email, for a reason other than the person asking.
CREATE OR REPLACE FUNCTION public.suppress_email(p_hub_id uuid, p_email text, p_reason text, p_source text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text := lower(trim(p_email));
BEGIN
  INSERT INTO public.email_suppressions (hub_id, normalized_email, reason, source)
  VALUES (p_hub_id, _email, p_reason, p_source)
  ON CONFLICT (hub_id, normalized_email) DO NOTHING;

  WITH changed AS (
    UPDATE public.crm_leads
       SET marketing_consent = false,
           suppressed_at = COALESCE(suppressed_at, now()),
           suppression_reason = COALESCE(suppression_reason, p_reason)
     WHERE hub_id = p_hub_id AND normalized_email = _email AND suppressed_at IS NULL
    RETURNING id, hub_id
  )
  INSERT INTO public.marketing_consent_history (hub_id, lead_id, consented, source)
  SELECT hub_id, id, false, p_source FROM changed;

  UPDATE public.marketing_campaign_enrollments e
     SET status = 'stopped', stop_reason = p_reason
    FROM public.crm_leads l
   WHERE l.id = e.lead_id AND l.hub_id = p_hub_id AND l.normalized_email = _email
     AND e.status IN ('active', 'paused');
END;
$$;

-- Called by the webhook for every Resend event. Stamps the first occurrence on the
-- digest or onboarding delivery it belongs to (CRM deliveries are stamped by the
-- function itself) and suppresses on a permanent bounce or complaint.
CREATE OR REPLACE FUNCTION public.record_email_event(p_message_id text, p_type text, p_permanent boolean DEFAULT true)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _col   text := CASE p_type
    WHEN 'email.delivered'  THEN 'delivered_at'
    WHEN 'email.opened'     THEN 'opened_at'
    WHEN 'email.clicked'    THEN 'clicked_at'
    WHEN 'email.bounced'    THEN 'bounced_at'
    WHEN 'email.complained' THEN 'complained_at'
  END;
  _hub   uuid;
  _email text;
  _kind  text;
BEGIN
  IF _col IS NULL OR COALESCE(p_message_id, '') = '' THEN RETURN 'ignored'; END IF;

  EXECUTE format('UPDATE public.email_digest_deliveries SET %1$I = COALESCE(%1$I, now())
                  WHERE provider_message_id = $1 RETURNING hub_id, normalized_email', _col)
    INTO _hub, _email USING p_message_id;
  _kind := CASE WHEN _hub IS NOT NULL THEN 'digest' END;

  IF _hub IS NULL THEN
    EXECUTE format('UPDATE public.onboarding_deliveries d SET %1$I = COALESCE(d.%1$I, now())
                    FROM public.onboarding_journeys j
                    WHERE j.id = d.journey_id AND d.provider_message_id = $1
                    RETURNING d.hub_id, j.normalized_email', _col)
      INTO _hub, _email USING p_message_id;
    _kind := CASE WHEN _hub IS NOT NULL THEN 'onboarding' END;
  END IF;

  IF _hub IS NULL THEN
    SELECT m.hub_id, lower(trim(COALESCE(m.recipient_email, l.email))) INTO _hub, _email
    FROM public.marketing_email_deliveries m
    LEFT JOIN public.crm_leads l ON l.id = m.lead_id
    WHERE m.provider_message_id = p_message_id;
    _kind := CASE WHEN _hub IS NOT NULL THEN 'campaign' END;
  END IF;

  IF _hub IS NULL THEN RETURN 'unknown'; END IF;

  IF p_type = 'email.complained' THEN
    PERFORM public.suppress_email(_hub, _email, 'complained', _kind || '_complaint');
  ELSIF p_type = 'email.bounced' AND p_permanent THEN
    PERFORM public.suppress_email(_hub, _email, 'bounced', _kind || '_bounce');
  END IF;
  RETURN _kind;
END;
$$;

REVOKE ALL ON FUNCTION public.suppress_email(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_email_event(text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suppress_email(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_email_event(text, text, boolean) TO service_role;

-- Per digest issue and per onboarding step: how many went out and what happened.
CREATE OR REPLACE FUNCTION public.get_email_engagement()
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
  RETURN jsonb_build_object(
    'digests', COALESCE((
      SELECT jsonb_object_agg(t.digest_id, t.stats) FROM (
        SELECT digest_id, jsonb_build_object(
          'sent', count(*) FILTER (WHERE status = 'sent'),
          'delivered', count(delivered_at), 'opened', count(opened_at), 'clicked', count(clicked_at),
          'bounced', count(bounced_at), 'complained', count(complained_at)) AS stats
        FROM public.email_digest_deliveries WHERE hub_id = _hub GROUP BY digest_id
      ) t
    ), '{}'::jsonb),
    'steps', COALESCE((
      SELECT jsonb_object_agg(t.step_id, t.stats) FROM (
        SELECT step_id, jsonb_build_object(
          'sent', count(*) FILTER (WHERE status = 'sent'),
          'delivered', count(delivered_at), 'opened', count(opened_at), 'clicked', count(clicked_at),
          'bounced', count(bounced_at), 'complained', count(complained_at)) AS stats
        FROM public.onboarding_deliveries WHERE hub_id = _hub AND step_id IS NOT NULL GROUP BY step_id
      ) t
    ), '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_engagement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_email_engagement() TO authenticated;
