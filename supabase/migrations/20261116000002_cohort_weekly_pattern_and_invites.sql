-- Classes run on a fixed weekly pattern (e.g. Mon/Wed/Fri 10:00-11:00 WAT) from the
-- cohort's start date to its end date. generate_cohort_schedule used to create one
-- session per curriculum module instead, so a cohort with no curriculum got no
-- sessions at all (6 of 7 running cohorts on 2026-11-16).
--
-- The pattern is stored on the cohort, and every member and the primary tutor gets
-- one recurring calendar invite for it. cohorts.invite_sequence goes up whenever what
-- people should have in their calendar changes (pattern saved, a class cancelled or
-- removed); cohort_calendar_invites records the sequence each person last received,
-- so send-cohort-invites only mails people who are behind, and mails a cancellation
-- to anyone who left.

ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS class_days         text[],
  ADD COLUMN IF NOT EXISTS class_start_time   time,
  ADD COLUMN IF NOT EXISTS class_end_time     time,
  ADD COLUMN IF NOT EXISTS class_location     text,
  ADD COLUMN IF NOT EXISTS class_meeting_link text,
  ADD COLUMN IF NOT EXISTS invite_sequence    integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.cohort_calendar_invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id              uuid REFERENCES public.hubs(id) ON DELETE CASCADE,
  cohort_id           uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  normalized_email    text NOT NULL,
  full_name           text,
  role                text NOT NULL CHECK (role IN ('student', 'tutor')),
  sent_sequence       integer NOT NULL DEFAULT -1,
  cancelled           boolean NOT NULL DEFAULT false,
  attempts            integer NOT NULL DEFAULT 0,
  last_error          text,
  provider_message_id text,
  sent_at             timestamptz,
  UNIQUE (cohort_id, normalized_email)
);
CREATE INDEX IF NOT EXISTS idx_cohort_calendar_invites_hub ON public.cohort_calendar_invites (hub_id, cohort_id);

DROP TRIGGER IF EXISTS trg_cohort_calendar_invites_set_hub_id ON public.cohort_calendar_invites;
CREATE TRIGGER trg_cohort_calendar_invites_set_hub_id BEFORE INSERT ON public.cohort_calendar_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

ALTER TABLE public.cohort_calendar_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read cohort calendar invites" ON public.cohort_calendar_invites FOR SELECT
  USING (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));
GRANT SELECT ON public.cohort_calendar_invites TO authenticated;
GRANT ALL ON public.cohort_calendar_invites TO service_role;

-- Saves the pattern and rebuilds the cohort's upcoming sessions from it. Past
-- sessions, and future ones that already hold attendance or presentations, are kept.
CREATE OR REPLACE FUNCTION public.set_cohort_class_pattern(
  p_cohort_id uuid, p_days text[], p_start_time text, p_end_time text,
  p_instructor_id uuid DEFAULT NULL, p_location text DEFAULT NULL, p_meeting_link text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  _dows int[];
  _days text[];
  _from date;
  _title text;
  _count int;
BEGIN
  SELECT co.*, cl.name AS classroom_name INTO c
  FROM public.cohorts co LEFT JOIN public.classrooms cl ON cl.id = co.classroom_id
  WHERE co.id = p_cohort_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cohort not found'; END IF;
  IF NOT public.can_set_schedule(c.classroom_id, p_cohort_id) THEN
    RAISE EXCEPTION 'Only the cohort''s tutor, a training manager or the superadmin can set this schedule';
  END IF;
  IF c.classroom_id IS NULL THEN RAISE EXCEPTION 'Link this cohort to a classroom before scheduling it'; END IF;
  IF c.start_date IS NULL OR c.end_date IS NULL THEN RAISE EXCEPTION 'Set the cohort start and end dates first'; END IF;
  IF p_end_time::time <= p_start_time::time THEN RAISE EXCEPTION 'End time must be after the start time'; END IF;

  SELECT array_agg(DISTINCT d ORDER BY d), array_agg(DISTINCT lower(x))
    INTO _dows, _days
  FROM unnest(p_days) x,
       LATERAL (SELECT array_position(ARRAY['sunday','monday','tuesday','wednesday','thursday','friday','saturday'], lower(x)) - 1 AS d) z
  WHERE z.d IS NOT NULL;
  IF _dows IS NULL THEN RAISE EXCEPTION 'Pick at least one class day'; END IF;

  PERFORM set_config('app.skip_invite_bump', 'on', true);

  _from := greatest(c.start_date::date, (now() AT TIME ZONE 'Africa/Lagos')::date);
  DELETE FROM public.schedules s
   WHERE s.cohort_id = p_cohort_id AND s.scheduled_date >= _from AND s.status = 'scheduled'
     AND NOT EXISTS (SELECT 1 FROM public.attendance_sessions a WHERE a.schedule_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM public.attendance_records r WHERE r.schedule_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM public.presentations p WHERE p.schedule_id = s.id);

  _title := coalesce(nullif(trim(c.cohort_label), ''), c.classroom_name, 'Class');
  INSERT INTO public.schedules (classroom_id, cohort_id, title, scheduled_date, start_time, end_time, instructor_id, location, meeting_link, status)
  SELECT c.classroom_id, p_cohort_id, _title, d::date, p_start_time::time, p_end_time::time,
         coalesce(p_instructor_id, c.primary_tutor_id), nullif(trim(p_location), ''), nullif(trim(p_meeting_link), ''), 'scheduled'
  FROM generate_series(_from, c.end_date::date, interval '1 day') d
  WHERE extract(dow FROM d)::int = ANY (_dows)
    AND NOT EXISTS (SELECT 1 FROM public.schedules s WHERE s.cohort_id = p_cohort_id AND s.scheduled_date = d::date AND s.status <> 'cancelled');
  GET DIAGNOSTICS _count = ROW_COUNT;

  UPDATE public.cohorts
     SET class_days = _days, class_start_time = p_start_time::time, class_end_time = p_end_time::time,
         class_location = nullif(trim(p_location), ''), class_meeting_link = nullif(trim(p_meeting_link), ''),
         invite_sequence = invite_sequence + 1
   WHERE id = p_cohort_id;

  PERFORM set_config('app.skip_invite_bump', 'off', true);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'set_cohort_class_pattern', 'cohort', p_cohort_id,
          jsonb_build_object('days', _days, 'start_time', p_start_time, 'end_time', p_end_time, 'sessions_created', _count));
  RETURN _count;
END;
$$;

-- Kept for the existing callers; now builds the weekly pattern.
CREATE OR REPLACE FUNCTION public.generate_cohort_schedule(p_cohort_id uuid, p_days text[], p_start_time text, p_end_time text, p_instructor_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.set_cohort_class_pattern(p_cohort_id, p_days, p_start_time, p_end_time, p_instructor_id, NULL, NULL);
$$;

-- A class cancelled or removed by hand changes what belongs in everyone's calendar.
CREATE OR REPLACE FUNCTION public.trg_bump_cohort_invites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.skip_invite_bump', true) = 'on' THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.cohort_id IS NOT NULL THEN
      UPDATE public.cohorts SET invite_sequence = invite_sequence + 1 WHERE id = OLD.cohort_id AND class_days IS NOT NULL;
    END IF;
  ELSIF NEW.cohort_id IS NOT NULL AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date) THEN
    UPDATE public.cohorts SET invite_sequence = invite_sequence + 1 WHERE id = NEW.cohort_id AND class_days IS NOT NULL;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_bump_cohort_invites: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedules_bump_invites ON public.schedules;
CREATE TRIGGER trg_schedules_bump_invites AFTER UPDATE OR DELETE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_cohort_invites();

-- Everyone who should hold (or lose) a cohort's invite and hasn't got the latest one.
-- Run by send-cohort-invites with the service role. A failed send is retried on later
-- runs, at most 5 times in a row.
CREATE OR REPLACE FUNCTION public.cohort_invites_due(p_limit integer DEFAULT 50)
RETURNS TABLE (
  cohort_id uuid, hub_id uuid, normalized_email text, full_name text, role text, cancel boolean,
  invite_sequence integer, cohort_label text, program_name text, first_date date, end_date date,
  class_days text[], class_start_time time, class_end_time time, class_location text, class_meeting_link text,
  tutor_name text, tutor_email text, exdates date[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pat AS (
    SELECT c.*, p.program_name, p.hub_id AS program_hub,
           (SELECT min(s.scheduled_date) FROM public.schedules s
             WHERE s.cohort_id = c.id AND s.status <> 'cancelled' AND s.start_time = c.class_start_time) AS first_date
    FROM public.cohorts c JOIN public.programs p ON p.id = c.program_id
    WHERE c.class_days IS NOT NULL AND c.end_date >= (now() AT TIME ZONE 'Africa/Lagos')::date
  ),
  members AS (
    (SELECT DISTINCT ON (pat.id, lower(trim(coalesce(e.email, u.email))))
            pat.id AS cohort_id, lower(trim(coalesce(e.email, u.email))) AS email,
            coalesce(e.full_name, pr.full_name) AS full_name, 'student'::text AS role
     FROM pat
     JOIN public.cohort_students cs ON cs.cohort_id = pat.id AND cs.status = 'active'
     LEFT JOIN public.enrollments e ON e.id = cs.enrollment_id
     LEFT JOIN auth.users u ON u.id = cs.student_id
     LEFT JOIN public.profiles pr ON pr.user_id = cs.student_id
     WHERE position('@' IN coalesce(e.email, u.email, '')) > 1
       AND lower(coalesce(e.email, u.email)) NOT LIKE '%@no-email.invalid'
     ORDER BY pat.id, lower(trim(coalesce(e.email, u.email))))
    UNION
    SELECT pat.id, lower(trim(st.email)), st.full_name, 'tutor'
    FROM pat JOIN public.staff st ON st.id = pat.primary_tutor_id
    WHERE position('@' IN coalesce(st.email, '')) > 1
  ),
  due AS (
    -- Current members who are behind on the latest invite.
    SELECT m.cohort_id, m.email, m.full_name, m.role, false AS cancel
    FROM members m JOIN pat ON pat.id = m.cohort_id
    LEFT JOIN public.cohort_calendar_invites i ON i.cohort_id = m.cohort_id AND i.normalized_email = m.email
    WHERE pat.first_date IS NOT NULL
      AND (i.id IS NULL OR ((i.sent_sequence < pat.invite_sequence OR i.cancelled) AND i.attempts < 5))
    UNION ALL
    -- People who hold an invite but have left the cohort.
    SELECT i.cohort_id, i.normalized_email, i.full_name, i.role, true
    FROM public.cohort_calendar_invites i JOIN pat ON pat.id = i.cohort_id
    WHERE NOT i.cancelled AND i.sent_sequence >= 0 AND i.attempts < 5
      AND NOT EXISTS (SELECT 1 FROM members m WHERE m.cohort_id = i.cohort_id AND m.email = i.normalized_email)
  )
  SELECT d.cohort_id, pat.program_hub, d.email, d.full_name, d.role, d.cancel,
         pat.invite_sequence, pat.cohort_label, pat.program_name, pat.first_date, pat.end_date::date,
         pat.class_days, pat.class_start_time, pat.class_end_time, pat.class_location, pat.class_meeting_link,
         st.full_name, lower(trim(st.email)),
         ARRAY(
           SELECT gs::date FROM generate_series(pat.first_date, pat.end_date::date, interval '1 day') gs
           WHERE trim(to_char(gs, 'day')) = ANY (pat.class_days)
             AND NOT EXISTS (SELECT 1 FROM public.schedules s WHERE s.cohort_id = pat.id AND s.scheduled_date = gs::date AND s.status <> 'cancelled')
         )
  FROM due d
  JOIN pat ON pat.id = d.cohort_id
  LEFT JOIN public.staff st ON st.id = pat.primary_tutor_id
  LIMIT greatest(1, least(p_limit, 200));
$$;

CREATE OR REPLACE FUNCTION public.record_cohort_invite(
  p_cohort_id uuid, p_email text, p_full_name text, p_role text, p_sequence integer,
  p_cancelled boolean, p_provider_message_id text, p_error text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.cohort_calendar_invites AS i
    (hub_id, cohort_id, normalized_email, full_name, role, sent_sequence, cancelled, attempts, last_error, provider_message_id, sent_at)
  SELECT p.hub_id, p_cohort_id, p_email, p_full_name, p_role,
         CASE WHEN p_error IS NULL THEN p_sequence ELSE -1 END, p_error IS NULL AND p_cancelled,
         CASE WHEN p_error IS NULL THEN 0 ELSE 1 END, p_error, p_provider_message_id,
         CASE WHEN p_error IS NULL THEN now() END
  FROM public.cohorts c JOIN public.programs p ON p.id = c.program_id WHERE c.id = p_cohort_id
  ON CONFLICT (cohort_id, normalized_email) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    sent_sequence = CASE WHEN p_error IS NULL THEN p_sequence ELSE i.sent_sequence END,
    cancelled = CASE WHEN p_error IS NULL THEN p_cancelled ELSE i.cancelled END,
    attempts = CASE WHEN p_error IS NULL THEN 0 ELSE i.attempts + 1 END,
    last_error = p_error,
    provider_message_id = coalesce(p_provider_message_id, i.provider_message_id),
    sent_at = CASE WHEN p_error IS NULL THEN now() ELSE i.sent_at END;
$$;

-- How far a cohort's invites have gone out, for the schedule dialog.
CREATE OR REPLACE FUNCTION public.get_cohort_invite_status(p_cohort_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'sent', count(*) FILTER (WHERE i.sent_sequence = c.invite_sequence AND NOT i.cancelled),
    'failed', count(*) FILTER (WHERE i.last_error IS NOT NULL),
    'sequence', max(c.invite_sequence))
  FROM public.cohorts c LEFT JOIN public.cohort_calendar_invites i ON i.cohort_id = c.id
  WHERE c.id = p_cohort_id
    AND (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role) OR public.can_set_schedule(c.classroom_id, c.id));
$$;

REVOKE ALL ON FUNCTION public.set_cohort_class_pattern(uuid, text[], text, text, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cohort_invites_due(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_cohort_invite(uuid, text, text, text, integer, boolean, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_cohort_invite_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_cohort_class_pattern(uuid, text[], text, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cohort_invites_due(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_cohort_invite(uuid, text, text, text, integer, boolean, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_cohort_invite_status(uuid) TO authenticated;

-- Send invites every 10 minutes, same vault secret as the other senders.
SELECT cron.unschedule('send-cohort-invites') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-cohort-invites');
SELECT cron.schedule('send-cohort-invites', '*/10 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://ozjxktxbzhkujavmzjrf.supabase.co/functions/v1/send-cohort-invites',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='crm_cron_secret' LIMIT 1)),
    body := '{}'::jsonb
  );
$cron$);
