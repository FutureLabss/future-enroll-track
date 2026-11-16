-- Each hub's student WhatsApp group and Slack workspace invite. Students get them in
-- the "enrollment confirmed" email once their payment is approved, and on their
-- dashboard while they hold a live enrollment, so someone who only filled in the
-- public form never sees them.

ALTER TABLE public.hubs
  ADD COLUMN IF NOT EXISTS whatsapp_group_url text CHECK (whatsapp_group_url IS NULL OR whatsapp_group_url ~ '^https://chat\.whatsapp\.com/'),
  ADD COLUMN IF NOT EXISTS slack_invite_url   text CHECK (slack_invite_url IS NULL OR slack_invite_url ~ '^https://join\.slack\.com/');

UPDATE public.hubs
   SET whatsapp_group_url = 'https://chat.whatsapp.com/CfGsGq5mbyCLDamvUeR4Tc',
       slack_invite_url   = 'https://join.slack.com/t/futurelabs-hq/shared_invite/zt-4gxwhuvhy-ZUiLqpA1xjomkV8HIsFmBg'
 WHERE id = '00000000-0000-0000-0000-000000000001';

-- Links for the hubs where the caller has a live enrollment.
CREATE OR REPLACE FUNCTION public.get_my_community_links()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
           'hub_name', h.name, 'whatsapp_group_url', h.whatsapp_group_url, 'slack_invite_url', h.slack_invite_url)), '[]'::jsonb)
  FROM public.enrollments e
  JOIN public.programs p ON p.id = e.program_id
  JOIN public.hubs h ON h.id = p.hub_id
  WHERE e.user_id = auth.uid()
    AND e.enrollment_status IN ('active', 'overdue', 'completed')
    AND (h.whatsapp_group_url IS NOT NULL OR h.slack_invite_url IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION public.get_hub_community_links()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN (SELECT jsonb_build_object('whatsapp_group_url', whatsapp_group_url, 'slack_invite_url', slack_invite_url)
          FROM public.hubs WHERE id = public.get_my_hub_id());
END;
$$;

CREATE OR REPLACE FUNCTION public.set_hub_community_links(p_whatsapp_group_url text, p_slack_invite_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub uuid := public.get_my_hub_id();
BEGIN
  IF NOT (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  UPDATE public.hubs
     SET whatsapp_group_url = nullif(trim(p_whatsapp_group_url), ''),
         slack_invite_url   = nullif(trim(p_slack_invite_url), '')
   WHERE id = _hub;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'set_community_links', 'hub', _hub,
          jsonb_build_object('whatsapp_group_url', p_whatsapp_group_url, 'slack_invite_url', p_slack_invite_url));
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_community_links() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_hub_community_links() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_hub_community_links(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_community_links() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hub_community_links() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_hub_community_links(text, text) TO authenticated;
