-- Calendar sync: each user gets a private subscription URL (the calendar-feed edge
-- function) that Google Calendar / Apple Calendar / Outlook poll. The feed holds
-- the user's class sessions, legacy cohort sessions, assignment due dates and cohort
-- start/end dates, so schedule changes reach their calendar without re-adding.
-- The token is the only credential calendar apps can send, so it is long, random,
-- and rotatable.

CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hub_id           uuid REFERENCES public.hubs(id) ON DELETE SET NULL,
  token            text NOT NULL UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_accessed_at timestamptz
);

DROP TRIGGER IF EXISTS trg_calendar_feed_tokens_set_hub_id ON public.calendar_feed_tokens;
CREATE TRIGGER trg_calendar_feed_tokens_set_hub_id
  BEFORE INSERT ON public.calendar_feed_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own calendar token"
  ON public.calendar_feed_tokens FOR SELECT
  USING (user_id = auth.uid());

GRANT SELECT ON public.calendar_feed_tokens TO authenticated;
GRANT ALL ON public.calendar_feed_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.get_calendar_feed_token(p_rotate boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _token text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  IF NOT p_rotate THEN
    SELECT token INTO _token FROM public.calendar_feed_tokens WHERE user_id = auth.uid();
    IF _token IS NOT NULL THEN
      RETURN _token;
    END IF;
  END IF;

  _token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.calendar_feed_tokens (user_id, token)
  VALUES (auth.uid(), _token)
  ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token, created_at = now(), last_accessed_at = NULL;
  RETURN _token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_calendar_feed_token(boolean) TO authenticated;

-- Called only by the calendar-feed edge function (service role). Times are stored
-- as local wall-clock date + time; every hub is in Nigeria, so they are WAT.
CREATE OR REPLACE FUNCTION public.calendar_feed_events(p_token text)
RETURNS TABLE (
  uid         text,
  kind        text,
  title       text,
  description text,
  location    text,
  url         text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  all_day     boolean,
  status      text,
  updated_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user    uuid;
  _hub     uuid;
  _admin   boolean;
  _from    date := current_date - 60;
  _to      date := current_date + 366;
BEGIN
  UPDATE public.calendar_feed_tokens
     SET last_accessed_at = now()
   WHERE token = p_token
  RETURNING user_id INTO _user;

  IF _user IS NULL THEN
    RETURN;
  END IF;

  SELECT hm.hub_id INTO _hub FROM public.hub_members hm WHERE hm.user_id = _user;
  _admin := public.has_role(_user, 'admin'::app_role);

  RETURN QUERY
  WITH
  my_cohorts AS (
    SELECT cs.cohort_id FROM public.cohort_students cs WHERE cs.student_id = _user AND cs.status = 'active'
    UNION
    SELECT e.cohort_id FROM public.enrollments e WHERE e.user_id = _user AND e.cohort_id IS NOT NULL
  ),
  student_classrooms AS (
    SELECT cs.classroom_id FROM public.classroom_students cs WHERE cs.student_id = _user
  ),
  my_staff_ids AS (
    SELECT cs.staff_id FROM public.classroom_staff cs WHERE cs.user_id = _user
    UNION
    SELECT st.id FROM public.staff st
    JOIN public.profiles p ON lower(p.email) = lower(st.email)
    WHERE p.user_id = _user AND st.email IS NOT NULL AND st.email <> ''
  ),
  tutor_cohorts AS (
    SELECT co.id FROM public.cohorts co WHERE co.primary_tutor_id IN (SELECT staff_id FROM my_staff_ids)
  ),
  staff_classrooms AS (
    SELECT cs.classroom_id FROM public.classroom_staff cs WHERE cs.user_id = _user AND cs.status = 'active'
    UNION
    SELECT c.id FROM public.classrooms c WHERE _admin AND _hub IS NOT NULL AND c.hub_id = _hub AND c.status = 'active'
  ),
  visible_schedules AS (
    SELECT s.* FROM public.schedules s
    WHERE s.classroom_id IN (SELECT classroom_id FROM staff_classrooms)
    UNION ALL
    SELECT s.* FROM public.schedules s
    WHERE s.classroom_id NOT IN (SELECT classroom_id FROM staff_classrooms)
      AND (
        s.cohort_id IN (SELECT cohort_id FROM my_cohorts)
        OR s.cohort_id IN (SELECT id FROM tutor_cohorts)
        OR (s.cohort_id IS NULL AND s.classroom_id IN (SELECT classroom_id FROM student_classrooms))
      )
  )
  SELECT
    'schedule-' || s.id || '@futurelabs',
    'class',
    COALESCE(NULLIF(s.title, ''), l.title, 'Class') || ' · ' || COALESCE(co.cohort_label, cl.name),
    concat_ws(E'\n',
      cl.name || COALESCE(' — ' || co.cohort_label, ''),
      CASE WHEN st.full_name IS NOT NULL THEN 'Instructor: ' || st.full_name END,
      CASE WHEN s.meeting_link IS NOT NULL AND s.meeting_link <> '' THEN 'Join online: ' || s.meeting_link END),
    NULLIF(COALESCE(NULLIF(s.location, ''), cl.location), ''),
    NULLIF(s.meeting_link, ''),
    (s.scheduled_date + s.start_time) AT TIME ZONE 'Africa/Lagos',
    (s.scheduled_date + s.end_time) AT TIME ZONE 'Africa/Lagos',
    false,
    CASE s.status WHEN 'cancelled' THEN 'CANCELLED' ELSE 'CONFIRMED' END,
    s.updated_at
  FROM visible_schedules s
  JOIN public.classrooms cl ON cl.id = s.classroom_id
  LEFT JOIN public.cohorts co ON co.id = s.cohort_id
  LEFT JOIN public.lessons l  ON l.id = s.lesson_id
  LEFT JOIN public.staff st   ON st.id = s.instructor_id
  WHERE s.scheduled_date BETWEEN _from AND _to

  UNION ALL

  SELECT
    'assignment-' || a.id || '@futurelabs',
    'assignment',
    'Due: ' || a.title || ' · ' || COALESCE(co.cohort_label, cl.name),
    concat_ws(E'\n', cl.name || COALESCE(' — ' || co.cohort_label, ''), left(a.instructions, 500)),
    NULL,
    NULL,
    a.due_date - interval '30 minutes',
    a.due_date,
    false,
    'CONFIRMED',
    a.updated_at
  FROM public.assignments a
  JOIN public.classrooms cl ON cl.id = a.classroom_id
  LEFT JOIN public.cohorts co ON co.id = a.cohort_id
  WHERE a.status = 'published'
    AND a.due_date IS NOT NULL
    AND (a.due_date AT TIME ZONE 'Africa/Lagos')::date BETWEEN _from AND _to
    AND (
      a.classroom_id IN (SELECT classroom_id FROM staff_classrooms)
      OR a.cohort_id IN (SELECT id FROM tutor_cohorts)
      OR a.cohort_id IN (SELECT cohort_id FROM my_cohorts)
      OR (a.cohort_id IS NULL AND a.classroom_id IN (SELECT classroom_id FROM student_classrooms))
    )

  UNION ALL

  SELECT
    'cohort-' || k.edge || '-' || co.id || '@futurelabs',
    'cohort',
    co.cohort_label || CASE k.edge WHEN 'start' THEN ' starts' ELSE ' ends' END,
    COALESCE(cl.name, ''),
    NULL,
    NULL,
    (CASE k.edge WHEN 'start' THEN co.start_date ELSE co.end_date END)::timestamp AT TIME ZONE 'Africa/Lagos',
    ((CASE k.edge WHEN 'start' THEN co.start_date ELSE co.end_date END) + 1)::timestamp AT TIME ZONE 'Africa/Lagos',
    true,
    'CONFIRMED',
    co.updated_at
  FROM public.cohorts co
  LEFT JOIN public.classrooms cl ON cl.id = co.classroom_id
  CROSS JOIN (VALUES ('start'), ('end')) AS k(edge)
  WHERE (CASE k.edge WHEN 'start' THEN co.start_date ELSE co.end_date END) BETWEEN _from AND _to
    AND co.status <> 'archived'
    AND (
      co.id IN (SELECT cohort_id FROM my_cohorts)
      OR co.id IN (SELECT id FROM tutor_cohorts)
      OR co.classroom_id IN (SELECT classroom_id FROM staff_classrooms)
    );

  -- Legacy per-cohort sessions; the table (20260716113004) is not in every environment.
  IF to_regclass('public.cohort_schedules') IS NOT NULL THEN
    RETURN QUERY EXECUTE $q$
      SELECT
        'cohort-schedule-' || cs.id || '@futurelabs',
        'class'::text,
        cs.title || ' · ' || co.cohort_label,
        concat_ws(E'\n', cs.description,
          CASE WHEN cs.meeting_link IS NOT NULL AND cs.meeting_link <> '' THEN 'Join online: ' || cs.meeting_link END),
        NULLIF(cs.location, ''),
        NULLIF(cs.meeting_link, ''),
        (cs.scheduled_date + cs.start_time) AT TIME ZONE 'Africa/Lagos',
        (cs.scheduled_date + cs.end_time) AT TIME ZONE 'Africa/Lagos',
        false,
        'CONFIRMED'::text,
        cs.updated_at
      FROM public.cohort_schedules cs
      JOIN public.cohorts co ON co.id = cs.cohort_id
      WHERE cs.scheduled_date BETWEEN $4 AND $5
        AND (
          cs.cohort_id IN (SELECT x.cohort_id FROM public.cohort_students x WHERE x.student_id = $1 AND x.status = 'active')
          OR cs.cohort_id IN (SELECT e.cohort_id FROM public.enrollments e WHERE e.user_id = $1)
          OR co.primary_tutor_id IN (
            SELECT st.id FROM public.staff st
            WHERE $1 = ANY (public.staff_user_ids(st.id)))
          OR co.classroom_id IN (SELECT x.classroom_id FROM public.classroom_staff x WHERE x.user_id = $1 AND x.status = 'active')
          OR ($3 AND $2 IS NOT NULL AND co.hub_id = $2)
        )
    $q$ USING _user, _hub, _admin, _from, _to;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.calendar_feed_events(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_feed_events(text) TO service_role;
