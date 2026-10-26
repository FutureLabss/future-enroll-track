-- Lets an onboarding email go out under a person's name (e.g. a note from the
-- founder) with replies going to them. The address stays the verified sending
-- domain; only the display name and Reply-To change.
ALTER TABLE public.onboarding_steps
  ADD COLUMN IF NOT EXISTS from_name text CHECK (from_name IS NULL OR from_name !~ '[<>"\r\n]'),
  ADD COLUMN IF NOT EXISTS reply_to  text CHECK (reply_to IS NULL OR reply_to ~ '^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$');

DROP FUNCTION IF EXISTS public.claim_onboarding_emails(integer);

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
  from_name         text,
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
         s.subject, s.body, h.name, s.from_name, COALESCE(s.reply_to, h.contact_email),
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

REVOKE ALL ON FUNCTION public.claim_onboarding_emails(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_onboarding_emails(integer) TO service_role;
