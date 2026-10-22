-- Activity report: one hub-scoped event stream that classroom/cohort/enrollment
-- triggers write into (20261022000003), readable by the superadmin and by the
-- admins the superadmin explicitly grants access to.

CREATE TABLE IF NOT EXISTS public.activity_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id       uuid REFERENCES public.hubs(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type   text NOT NULL,
  category     text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid,
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE SET NULL,
  cohort_id    uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,
  summary      text NOT NULL,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_hub_created ON public.activity_events (hub_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_created ON public.activity_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_classroom ON public.activity_events (classroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_cohort ON public.activity_events (cohort_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_activity_events_set_hub_id ON public.activity_events;
CREATE TRIGGER trg_activity_events_set_hub_id
  BEFORE INSERT ON public.activity_events
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.activity_report_viewers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id     uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_report_viewers_user ON public.activity_report_viewers (user_id);

DROP TRIGGER IF EXISTS trg_activity_report_viewers_set_hub_id ON public.activity_report_viewers;
CREATE TRIGGER trg_activity_report_viewers_set_hub_id
  BEFORE INSERT ON public.activity_report_viewers
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

ALTER TABLE public.activity_report_viewers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin manages activity report viewers"
  ON public.activity_report_viewers FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Users read own activity report access"
  ON public.activity_report_viewers FOR SELECT
  USING (user_id = auth.uid());

-- Events are written only by SECURITY DEFINER triggers; nobody inserts directly.
CREATE POLICY "Report viewers read activity events"
  ON public.activity_events FOR SELECT
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.activity_report_viewers v
      WHERE v.user_id = auth.uid() AND v.hub_id = activity_events.hub_id
    )
  );

GRANT SELECT ON public.activity_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_report_viewers TO authenticated;
GRANT ALL ON public.activity_events, public.activity_report_viewers TO service_role;

-- ── Internal writers (trigger-only; not callable by clients) ────────────────

CREATE OR REPLACE FUNCTION public.record_activity(
  p_hub_id       uuid,
  p_event_type   text,
  p_category     text,
  p_entity_type  text,
  p_entity_id    uuid,
  p_classroom_id uuid,
  p_cohort_id    uuid,
  p_summary      text,
  p_details      jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.activity_events
    (hub_id, actor_id, event_type, category, entity_type, entity_id, classroom_id, cohort_id, summary, details)
  VALUES
    (p_hub_id, auth.uid(), p_event_type, p_category, p_entity_type, p_entity_id, p_classroom_id, p_cohort_id, p_summary, COALESCE(p_details, '{}'::jsonb));
$$;

-- The actor never gets notified about their own action.
CREATE OR REPLACE FUNCTION public.notify_users(
  p_user_ids  uuid[],
  p_type      text,
  p_title     text,
  p_message   text,
  p_link      text DEFAULT NULL,
  p_hub_id    uuid DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, channel, read, link, hub_id, entity_id)
  SELECT DISTINCT u, p_type, p_title, p_message, 'in_app', false, p_link, p_hub_id, p_entity_id
  FROM unnest(COALESCE(p_user_ids, '{}'::uuid[])) AS u
  WHERE u IS NOT NULL
    AND u IS DISTINCT FROM auth.uid();
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.record_activity(uuid, text, text, text, uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_users(uuid[], text, text, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── Access helpers ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_view_activity_report()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
      OR EXISTS (SELECT 1 FROM public.activity_report_viewers WHERE user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.can_view_activity_report() TO authenticated;

-- ── Report reads ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_activity_report(
  p_since    timestamptz DEFAULT now() - interval '7 days',
  p_until    timestamptz DEFAULT now(),
  p_category text DEFAULT NULL,
  p_limit    integer DEFAULT 500
)
RETURNS TABLE (
  id             uuid,
  created_at     timestamptz,
  event_type     text,
  category       text,
  entity_type    text,
  entity_id      uuid,
  summary        text,
  details        jsonb,
  actor_id       uuid,
  actor_name     text,
  classroom_id   uuid,
  classroom_name text,
  cohort_id      uuid,
  cohort_label   text,
  hub_id         uuid,
  hub_name       text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_view_activity_report() THEN
    RAISE EXCEPTION 'Access denied: activity report';
  END IF;

  RETURN QUERY
  SELECT e.id, e.created_at, e.event_type, e.category, e.entity_type, e.entity_id,
         e.summary, e.details, e.actor_id,
         COALESCE(p.full_name, p.email),
         e.classroom_id, cl.name, e.cohort_id, co.cohort_label,
         e.hub_id, h.name
  FROM public.activity_events e
  LEFT JOIN public.profiles p   ON p.user_id = e.actor_id
  LEFT JOIN public.classrooms cl ON cl.id = e.classroom_id
  LEFT JOIN public.cohorts co    ON co.id = e.cohort_id
  LEFT JOIN public.hubs h        ON h.id = e.hub_id
  WHERE e.created_at >= p_since
    AND e.created_at <= p_until
    AND (p_category IS NULL OR e.category = p_category)
    AND (
      public.is_superadmin()
      OR e.hub_id IN (SELECT v.hub_id FROM public.activity_report_viewers v WHERE v.user_id = auth.uid())
    )
  ORDER BY e.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_activity_counts(
  p_since timestamptz DEFAULT now() - interval '7 days',
  p_until timestamptz DEFAULT now()
)
RETURNS TABLE (event_type text, category text, total bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_view_activity_report() THEN
    RAISE EXCEPTION 'Access denied: activity report';
  END IF;

  RETURN QUERY
  SELECT e.event_type, e.category, count(*)
  FROM public.activity_events e
  WHERE e.created_at >= p_since
    AND e.created_at <= p_until
    AND (
      public.is_superadmin()
      OR e.hub_id IN (SELECT v.hub_id FROM public.activity_report_viewers v WHERE v.user_id = auth.uid())
    )
  GROUP BY e.event_type, e.category;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_activity_report(timestamptz, timestamptz, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_activity_counts(timestamptz, timestamptz) TO authenticated;

-- ── Viewer management (superadmin only) ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_activity_report_viewers()
RETURNS TABLE (
  id              uuid,
  hub_id          uuid,
  hub_name        text,
  user_id         uuid,
  full_name       text,
  email           text,
  granted_at      timestamptz,
  granted_by_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Access denied: superadmin only';
  END IF;

  RETURN QUERY
  SELECT v.id, v.hub_id, h.name, v.user_id, p.full_name, p.email, v.created_at,
         COALESCE(g.full_name, g.email)
  FROM public.activity_report_viewers v
  LEFT JOIN public.hubs h     ON h.id = v.hub_id
  LEFT JOIN public.profiles p ON p.user_id = v.user_id
  LEFT JOIN public.profiles g ON g.user_id = v.granted_by
  ORDER BY v.created_at DESC;
END;
$$;

-- Admins who could be given access: any admin not already a viewer of their hub.
CREATE OR REPLACE FUNCTION public.list_activity_report_candidates()
RETURNS TABLE (user_id uuid, full_name text, email text, hub_id uuid, hub_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Access denied: superadmin only';
  END IF;

  RETURN QUERY
  SELECT ur.user_id, p.full_name, p.email, hm.hub_id, h.name
  FROM public.user_roles ur
  JOIN public.hub_members hm ON hm.user_id = ur.user_id
  JOIN public.hubs h         ON h.id = hm.hub_id
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE ur.role = 'admin'::app_role
    AND ur.user_id <> auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.activity_report_viewers v
      WHERE v.user_id = ur.user_id AND v.hub_id = hm.hub_id
    )
  ORDER BY COALESCE(p.full_name, p.email);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_activity_report_access(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub uuid;
  _id  uuid;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Access denied: superadmin only';
  END IF;
  IF NOT public.has_role(p_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can be given access to the activity report';
  END IF;

  SELECT hm.hub_id INTO _hub FROM public.hub_members hm WHERE hm.user_id = p_user_id;
  IF _hub IS NULL THEN
    RAISE EXCEPTION 'That admin is not a member of any hub';
  END IF;

  INSERT INTO public.activity_report_viewers (hub_id, user_id, granted_by)
  VALUES (_hub, p_user_id, auth.uid())
  ON CONFLICT (hub_id, user_id) DO UPDATE SET granted_by = EXCLUDED.granted_by
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'grant_activity_report_access', 'activity_report_viewer', _id,
          jsonb_build_object('viewer_user_id', p_user_id, 'hub_id', _hub));

  PERFORM public.notify_users(
    ARRAY[p_user_id], 'activity_report_access',
    'You can now view the Activity Report',
    'The superadmin gave you access to the Activity Report: a live view of what is happening across classrooms, cohorts and enrollments.',
    '/admin/activity', _hub, _id
  );

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_activity_report_access(p_viewer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.activity_report_viewers%ROWTYPE;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Access denied: superadmin only';
  END IF;

  DELETE FROM public.activity_report_viewers WHERE id = p_viewer_id RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'revoke_activity_report_access', 'activity_report_viewer', _row.id,
          jsonb_build_object('viewer_user_id', _row.user_id, 'hub_id', _row.hub_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_activity_report_viewers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_activity_report_candidates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_activity_report_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_activity_report_access(uuid) TO authenticated;
