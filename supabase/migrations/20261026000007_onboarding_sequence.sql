-- Onboarding sequence: a short series of emails that starts when someone joins
-- a hub (their first enrollment there, from the public form or a CRM conversion).
--   * Off by default per hub (onboarding_settings.enabled) until an admin has
--     reviewed the copy. Only enrollments created while it is on start a journey;
--     turning it on never back-fills existing students.
--   * One journey per person per hub: a second enrollment, or a returning student
--     who enrolled before, does not restart it.
--   * Step N is due N days after joining at 09:00 WAT (day 0 = right away). A step
--     whose time passed more than 3 days ago (the sequence was paused, or the step
--     was added later) is skipped rather than sent late.
--   * Anyone on email_suppressions is stopped, so the shared unsubscribe link
--     works here too.

CREATE TABLE IF NOT EXISTS public.onboarding_settings (
  hub_id      uuid PRIMARY KEY REFERENCES public.hubs(id) ON DELETE CASCADE,
  enabled     boolean NOT NULL DEFAULT false,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id      uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  delay_days  integer NOT NULL DEFAULT 0 CHECK (delay_days BETWEEN 0 AND 365),
  subject     text NOT NULL CHECK (length(trim(subject)) > 0),
  body        text NOT NULL DEFAULT '',
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_steps_hub ON public.onboarding_steps (hub_id, delay_days);

CREATE TABLE IF NOT EXISTS public.onboarding_journeys (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id            uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  enrollment_id     uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  normalized_email  text NOT NULL,
  full_name         text,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stopped')),
  stop_reason       text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub_id, normalized_email)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_journeys_active ON public.onboarding_journeys (started_at) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.onboarding_deliveries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id              uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  journey_id          uuid NOT NULL REFERENCES public.onboarding_journeys(id) ON DELETE CASCADE,
  step_id             uuid REFERENCES public.onboarding_steps(id) ON DELETE SET NULL,
  due_at              timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  subject             text,
  attempts            integer NOT NULL DEFAULT 0,
  claimed_at          timestamptz,
  provider_message_id text,
  error_message       text,
  sent_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journey_id, step_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_deliveries_queue ON public.onboarding_deliveries (status, due_at)
  WHERE status IN ('pending', 'sending');
CREATE INDEX IF NOT EXISTS idx_onboarding_deliveries_step ON public.onboarding_deliveries (step_id, status);

DROP TRIGGER IF EXISTS trg_onboarding_settings_set_hub_id ON public.onboarding_settings;
CREATE TRIGGER trg_onboarding_settings_set_hub_id
  BEFORE INSERT ON public.onboarding_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

DROP TRIGGER IF EXISTS trg_onboarding_steps_set_hub_id ON public.onboarding_steps;
CREATE TRIGGER trg_onboarding_steps_set_hub_id
  BEFORE INSERT ON public.onboarding_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

DROP TRIGGER IF EXISTS update_onboarding_steps_updated_at ON public.onboarding_steps;
CREATE TRIGGER update_onboarding_steps_updated_at
  BEFORE UPDATE ON public.onboarding_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.onboarding_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage onboarding settings" ON public.onboarding_settings FOR ALL
  USING (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()))
  WITH CHECK (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

CREATE POLICY "Admins manage onboarding steps" ON public.onboarding_steps FOR ALL
  USING (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()))
  WITH CHECK (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

CREATE POLICY "Admins read onboarding journeys" ON public.onboarding_journeys FOR SELECT
  USING (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

CREATE POLICY "Admins stop onboarding journeys" ON public.onboarding_journeys FOR UPDATE
  USING (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()))
  WITH CHECK (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

CREATE POLICY "Admins read onboarding deliveries" ON public.onboarding_deliveries FOR SELECT
  USING (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

GRANT SELECT, INSERT, UPDATE ON public.onboarding_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_steps TO authenticated;
GRANT SELECT, UPDATE (status, stop_reason) ON public.onboarding_journeys TO authenticated;
GRANT SELECT ON public.onboarding_deliveries TO authenticated;
GRANT ALL ON public.onboarding_settings, public.onboarding_steps, public.onboarding_journeys, public.onboarding_deliveries TO service_role;

-- ── Starting a journey ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_start_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub   uuid;
  _email text := lower(trim(NEW.email));
BEGIN
  SELECT p.hub_id INTO _hub FROM public.programs p WHERE p.id = NEW.program_id;
  IF _hub IS NULL OR position('@' IN COALESCE(_email, '')) < 2 THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.onboarding_settings s WHERE s.hub_id = _hub AND s.enabled) THEN RETURN NULL; END IF;

  -- A returning student has joined already; this is a new programme, not a new member.
  IF EXISTS (
    SELECT 1 FROM public.enrollments e JOIN public.programs p ON p.id = e.program_id
    WHERE p.hub_id = _hub AND lower(trim(e.email)) = _email AND e.id <> NEW.id
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.onboarding_journeys (hub_id, enrollment_id, normalized_email, full_name)
  VALUES (_hub, NEW.id, _email, NEW.full_name)
  ON CONFLICT (hub_id, normalized_email) DO NOTHING;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_start_onboarding: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_start_onboarding ON public.enrollments;
CREATE TRIGGER trg_start_onboarding
  AFTER INSERT ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.trg_start_onboarding();

-- ── Sender side (service role only; called by send-onboarding-emails) ───────

CREATE OR REPLACE FUNCTION public.onboarding_due_at(p_started_at timestamptz, p_delay_days integer)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN p_delay_days = 0 THEN p_started_at
    ELSE (((p_started_at AT TIME ZONE 'Africa/Lagos')::date + p_delay_days) + time '09:00') AT TIME ZONE 'Africa/Lagos'
  END;
$$;

-- Queues every step that has come due, then claims up to p_limit of them.
-- Rows stuck in 'sending' for 15 minutes go back to the queue, at most 3 attempts.
CREATE OR REPLACE FUNCTION public.claim_onboarding_emails(p_limit integer DEFAULT 50)
RETURNS TABLE (
  delivery_id       uuid,
  hub_id            uuid,
  normalized_email  text,
  full_name         text,
  subject           text,
  body              text,
  hub_name          text,
  reply_to          text,
  program_name      text,
  cohort_label      text,
  cohort_start      date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  UPDATE public.onboarding_journeys j
     SET status = 'stopped', stop_reason = 'unsubscribed'
   WHERE j.status = 'active'
     AND EXISTS (SELECT 1 FROM public.email_suppressions x WHERE x.hub_id = j.hub_id AND x.normalized_email = j.normalized_email);

  UPDATE public.onboarding_deliveries
     SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
         error_message = CASE WHEN attempts >= 3 THEN 'Gave up after 3 attempts' ELSE error_message END
   WHERE status = 'sending' AND claimed_at < now() - interval '15 minutes';

  INSERT INTO public.onboarding_deliveries (hub_id, journey_id, step_id, due_at)
  SELECT j.hub_id, j.id, s.id, public.onboarding_due_at(j.started_at, s.delay_days)
  FROM public.onboarding_journeys j
  JOIN public.onboarding_settings cfg ON cfg.hub_id = j.hub_id AND cfg.enabled
  JOIN public.onboarding_steps s ON s.hub_id = j.hub_id AND s.active
  WHERE j.status = 'active'
    AND j.started_at > now() - interval '370 days'
    AND public.onboarding_due_at(j.started_at, s.delay_days) <= now()
  ON CONFLICT (journey_id, step_id) DO NOTHING;

  UPDATE public.onboarding_deliveries d
     SET status = 'skipped',
         error_message = CASE
           WHEN d.due_at < now() - interval '3 days' THEN 'More than 3 days late'
           WHEN j.status <> 'active' THEN 'Sequence stopped: ' || COALESCE(j.stop_reason, 'by an admin')
           ELSE 'Step turned off' END
    FROM public.onboarding_journeys j
   WHERE j.id = d.journey_id AND d.status = 'pending'
     AND (d.due_at < now() - interval '3 days'
          OR j.status <> 'active'
          OR d.step_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM public.onboarding_steps s WHERE s.id = d.step_id AND s.active));

  RETURN QUERY
  WITH picked AS (
    SELECT d.id FROM public.onboarding_deliveries d
    JOIN public.onboarding_settings cfg ON cfg.hub_id = d.hub_id AND cfg.enabled
    WHERE d.status = 'pending' AND d.due_at <= now()
    ORDER BY d.due_at
    LIMIT GREATEST(1, LEAST(p_limit, 200))
    FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
    UPDATE public.onboarding_deliveries d
       SET status = 'sending', attempts = d.attempts + 1, claimed_at = now()
      FROM picked
     WHERE d.id = picked.id
    RETURNING d.id, d.hub_id, d.journey_id, d.step_id
  )
  SELECT c.id, c.hub_id, j.normalized_email, COALESCE(e.full_name, j.full_name),
         s.subject, s.body, h.name, h.contact_email,
         p.program_name, co.cohort_label, co.start_date
  FROM claimed c
  JOIN public.onboarding_journeys j ON j.id = c.journey_id
  JOIN public.onboarding_steps s ON s.id = c.step_id
  JOIN public.hubs h ON h.id = c.hub_id
  LEFT JOIN public.enrollments e ON e.id = j.enrollment_id
  LEFT JOIN public.programs p ON p.id = e.program_id
  LEFT JOIN public.cohorts co ON co.id = e.cohort_id;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_start_onboarding() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_onboarding_emails(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_onboarding_emails(integer) TO service_role;

-- ── Admin view ──────────────────────────────────────────────────────────────

-- Per-step delivery counts and the latest journeys, for the Onboarding tab.
CREATE OR REPLACE FUNCTION public.get_onboarding_overview()
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
    'step_stats', COALESCE((
      SELECT jsonb_object_agg(t.step_id, t.stats) FROM (
        SELECT step_id, jsonb_build_object(
          'sent', count(*) FILTER (WHERE status = 'sent'),
          'failed', count(*) FILTER (WHERE status = 'failed'),
          'skipped', count(*) FILTER (WHERE status = 'skipped'),
          'queued', count(*) FILTER (WHERE status IN ('pending', 'sending'))) AS stats
        FROM public.onboarding_deliveries WHERE hub_id = _hub AND step_id IS NOT NULL GROUP BY step_id
      ) t
    ), '{}'::jsonb),
    'journeys', COALESCE((
      SELECT jsonb_agg(x ORDER BY x.started_at DESC) FROM (
        SELECT j.id, j.normalized_email AS email, j.full_name, j.status, j.stop_reason, j.started_at,
               p.program_name,
               (SELECT count(*) FROM public.onboarding_deliveries d WHERE d.journey_id = j.id AND d.status = 'sent') AS sent,
               (SELECT max(d.sent_at) FROM public.onboarding_deliveries d WHERE d.journey_id = j.id) AS last_sent_at
        FROM public.onboarding_journeys j
        LEFT JOIN public.enrollments e ON e.id = j.enrollment_id
        LEFT JOIN public.programs p ON p.id = e.program_id
        WHERE j.hub_id = _hub
        ORDER BY j.started_at DESC
        LIMIT 200
      ) x
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_onboarding_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_onboarding_overview() TO authenticated;

-- ── Starting copy (sequence stays off until an admin reviews it) ────────────

INSERT INTO public.onboarding_steps (hub_id, delay_days, subject, body)
SELECT h.id, v.delay_days, v.subject, v.body
FROM public.hubs h
CROSS JOIN (VALUES
  (0, 'Welcome to {{hub}}, {{first_name}}!',
   E'Hi {{first_name}},\n\nWelcome to {{hub}}, and thank you for enrolling in {{program}}. We''re glad to have you.\n\nHere''s what happens next:\n- If there''s a payment to make, your invoice arrives in a separate email.\n- Once your place is confirmed, you''ll get access to your classroom on the student portal.\n- Your tutor will share the class schedule there, and you can sync it to your phone''s calendar.\n\nIf you have any questions before then, just reply to this email.\n\nSee you soon,\nThe {{hub}} team'),
  (2, 'Getting set up for {{program}}',
   E'Hi {{first_name}},\n\nA few things to do before your first class:\n\n1. Log in to the student portal at https://admin.futurelabs.ng and complete your profile.\n2. Open your classroom to see the schedule, materials and announcements.\n3. Turn on calendar sync from your profile so every class shows up on your phone.\n\nIt takes about five minutes, and it means you won''t miss anything.\n\nThe {{hub}} team'),
  (7, 'How is it going, {{first_name}}?',
   E'Hi {{first_name}},\n\nYou''ve been with us for a week now. How are you finding {{program}} so far?\n\nIf anything is unclear, whether that''s the schedule, payments or the material itself, reply to this email and someone from the team will get back to you.\n\nWe''re rooting for you,\nThe {{hub}} team')
) AS v(delay_days, subject, body)
WHERE NOT EXISTS (SELECT 1 FROM public.onboarding_steps s WHERE s.hub_id = h.id);
