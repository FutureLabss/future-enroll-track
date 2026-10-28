-- Students who have stopped coming. In Oct 2026, 26 of the 36 overdue students
-- (₦1.48M of ₦1.87M) had not attended for 3+ weeks: most unpaid fees belong to
-- people who quietly dropped out, and more emails don't bring them back.
--   * Detected daily: an active member of a running cohort, enrolled 21+ days, with
--     no attendance in the last 21 days while the class met (2+ countable sessions,
--     the same rule as student_risk_flags, so classes where attendance wasn't taken
--     don't count).
--   * The student gets a private link (token) to choose: rejoin the next cohort, or
--     withdraw. Agreed 2026-10-28: those are the only two options.
--   * Rejoin: staff move them into the next cohort of the programme; the balance is
--     still owed and collections carry on. Withdraw: they leave the cohort and the
--     automatic payment reminders stop (_collections_on_hold); the balance stays on the
--     Outstanding page for the CEO to chase or write off.
--   * A student who attends again is marked returned automatically.

CREATE TABLE IF NOT EXISTS public.dropout_cases (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id             uuid REFERENCES public.hubs(id) ON DELETE CASCADE,
  enrollment_id      uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  cohort_id          uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  classroom_id       uuid REFERENCES public.classrooms(id) ON DELETE SET NULL,
  student_id         uuid NOT NULL,
  token              text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status             text NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'rejoin_requested', 'moved', 'withdrawn', 'returned')),
  detected_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_attended_at   timestamptz,
  choice_note        text,
  chosen_at          timestamptz,
  messages_sent      integer NOT NULL DEFAULT 0,
  last_messaged_at   timestamptz,
  next_cohort_id     uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,
  resolved_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at        timestamptz,
  resolution_note    text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dropout_cases_live ON public.dropout_cases (enrollment_id, cohort_id)
  WHERE status IN ('open', 'rejoin_requested');
CREATE INDEX IF NOT EXISTS idx_dropout_cases_hub ON public.dropout_cases (hub_id, status, detected_at DESC);

DROP TRIGGER IF EXISTS trg_dropout_cases_set_hub_id ON public.dropout_cases;
CREATE TRIGGER trg_dropout_cases_set_hub_id
  BEFORE INSERT ON public.dropout_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

ALTER TABLE public.dropout_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Classroom staff and admins read dropout cases" ON public.dropout_cases FOR SELECT
  USING (public.is_superadmin()
         OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
         OR public.classroom_staff_access(classroom_id));

GRANT SELECT ON public.dropout_cases TO authenticated;
GRANT ALL ON public.dropout_cases TO service_role;

CREATE OR REPLACE FUNCTION public._next_cohort_for(p_enrollment_id uuid, p_after_cohort uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id FROM public.cohorts c
  JOIN public.enrollments e ON e.program_id = c.program_id
  WHERE e.id = p_enrollment_id AND c.id <> p_after_cohort AND c.status = 'upcoming'
  ORDER BY c.start_date NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._dropout_staff(p_case public.dropout_cases)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT unnest(public.staff_user_ids(c.primary_tutor_id)) FROM public.cohorts c
    WHERE c.id = p_case.cohort_id AND c.primary_tutor_id IS NOT NULL
    UNION
    SELECT hm.user_id FROM public.hub_members hm WHERE hm.hub_id = p_case.hub_id AND hm.hub_role = 'manager'
  );
$$;

-- Daily: open cases for students who stopped coming, close ones who came back.
CREATE OR REPLACE FUNCTION public.detect_dropouts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new integer;
  _c   record;
BEGIN
  UPDATE public.dropout_cases d
     SET status = 'returned', resolved_at = now(), resolution_note = 'Attended class again'
   WHERE d.status = 'open'
     AND EXISTS (SELECT 1 FROM public.attendance_records r
                 JOIN public.attendance_sessions s ON s.id = r.session_id
                 WHERE s.cohort_id = d.cohort_id AND r.student_id = d.student_id AND r.marked_at > d.detected_at);

  WITH members AS (
    SELECT cs.cohort_id, cs.student_id, cs.enrollment_id, c.classroom_id, c.hub_id,
           (SELECT max(r.marked_at) FROM public.attendance_records r
              JOIN public.attendance_sessions s ON s.id = r.session_id
             WHERE s.cohort_id = cs.cohort_id AND r.student_id = cs.student_id) AS last_attended
    FROM public.cohort_students cs
    JOIN public.cohorts c ON c.id = cs.cohort_id
    WHERE cs.status = 'active' AND c.status = 'active' AND cs.enrollment_id IS NOT NULL
      AND cs.joined_at < now() - interval '21 days'
  ), gone AS (
    SELECT m.* FROM members m
    WHERE (m.last_attended IS NULL OR m.last_attended < now() - interval '21 days')
      AND (SELECT count(*) FROM public._countable_attendance_sessions() s
           WHERE s.cohort_id = m.cohort_id AND s.countable AND s.created_at > now() - interval '21 days') >= 2
      AND NOT EXISTS (SELECT 1 FROM public.dropout_cases d
                      WHERE d.enrollment_id = m.enrollment_id AND d.cohort_id = m.cohort_id
                        AND (d.status IN ('open', 'rejoin_requested', 'withdrawn', 'moved')
                             OR d.resolved_at > now() - interval '21 days'))
  ), ins AS (
    INSERT INTO public.dropout_cases (hub_id, enrollment_id, cohort_id, classroom_id, student_id, last_attended_at, next_cohort_id)
    SELECT g.hub_id, g.enrollment_id, g.cohort_id, g.classroom_id, g.student_id, g.last_attended,
           public._next_cohort_for(g.enrollment_id, g.cohort_id)
    FROM gone g
    ON CONFLICT DO NOTHING
    RETURNING *
  )
  SELECT count(*) INTO _new FROM ins;

  FOR _c IN
    SELECT d.cohort_id, d.hub_id, co.cohort_label, count(*) AS n, (array_agg(d.id))[1] AS any_id
    FROM public.dropout_cases d JOIN public.cohorts co ON co.id = d.cohort_id
    WHERE d.detected_at > now() - interval '1 minute' AND d.status = 'open'
    GROUP BY d.cohort_id, d.hub_id, co.cohort_label
  LOOP
    PERFORM public.notify_users(public._dropout_staff((SELECT x FROM public.dropout_cases x WHERE x.id = _c.any_id)),
      'students_dropped_off',
      CASE WHEN _c.n = 1 THEN '1 student has stopped coming to ' ELSE _c.n || ' students have stopped coming to ' END || _c.cohort_label,
      'No attendance for 3 weeks while the class met. They have been asked to choose: rejoin the next cohort, or withdraw. A call from you helps.',
      '/admin/dropouts', _c.hub_id, _c.cohort_id);
  END LOOP;
  RETURN _new;
END;
$$;

-- For send-dropout-outreach: first message on detection, one reminder a week later.
CREATE OR REPLACE FUNCTION public.claim_dropout_outreach()
RETURNS TABLE (case_id uuid, token text, email text, full_name text, phone text, program_name text,
               cohort_label text, next_cohort_label text, next_cohort_start date, hub_name text, reply_to text, message_no integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT d.id FROM public.dropout_cases d
    WHERE d.status = 'open'
      AND (d.messages_sent = 0 OR (d.messages_sent = 1 AND d.last_messaged_at < now() - interval '7 days'))
    FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.dropout_cases d SET messages_sent = d.messages_sent + 1, last_messaged_at = now()
      FROM due WHERE d.id = due.id
    RETURNING d.*
  )
  SELECT u.id, u.token, e.email, COALESCE(NULLIF(trim(pr.full_name), ''), e.full_name), e.phone, p.program_name,
         co.cohort_label, nc.cohort_label, nc.start_date, h.name, h.contact_email, u.messages_sent
  FROM upd u
  JOIN public.enrollments e ON e.id = u.enrollment_id
  JOIN public.programs p ON p.id = e.program_id
  JOIN public.cohorts co ON co.id = u.cohort_id
  LEFT JOIN public.cohorts nc ON nc.id = u.next_cohort_id
  LEFT JOIN public.hubs h ON h.id = u.hub_id
  LEFT JOIN public.profiles pr ON pr.user_id = e.user_id;
END;
$$;

-- Public (by token): what the student sees on the choice page.
CREATE OR REPLACE FUNCTION public.get_dropout_choice(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'first_name', split_part(trim(COALESCE(NULLIF(trim(pr.full_name), ''), e.full_name)), ' ', 1),
    'program_name', p.program_name, 'cohort_label', co.cohort_label,
    'next_cohort_label', nc.cohort_label, 'next_cohort_start', nc.start_date,
    'hub_name', h.name, 'status', d.status, 'outstanding', COALESCE(e.outstanding_balance, 0))
  FROM public.dropout_cases d
  JOIN public.enrollments e ON e.id = d.enrollment_id
  JOIN public.programs p ON p.id = e.program_id
  JOIN public.cohorts co ON co.id = d.cohort_id
  LEFT JOIN public.cohorts nc ON nc.id = d.next_cohort_id
  LEFT JOIN public.hubs h ON h.id = d.hub_id
  LEFT JOIN public.profiles pr ON pr.user_id = e.user_id
  WHERE d.token = p_token AND length(p_token) = 64;
$$;

CREATE OR REPLACE FUNCTION public.choose_dropout_option(p_token text, p_choice text, p_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _d public.dropout_cases;
  _name text;
BEGIN
  IF p_choice NOT IN ('rejoin', 'withdraw') THEN RAISE EXCEPTION 'Unknown choice'; END IF;
  SELECT * INTO _d FROM public.dropout_cases WHERE token = p_token AND length(p_token) = 64 FOR UPDATE;
  IF _d.id IS NULL THEN RAISE EXCEPTION 'This link is not valid'; END IF;
  IF _d.status NOT IN ('open', 'rejoin_requested') THEN RAISE EXCEPTION 'This has already been settled. Contact the front desk if anything changed.'; END IF;

  UPDATE public.dropout_cases
     SET status = CASE WHEN p_choice = 'rejoin' THEN 'rejoin_requested' ELSE 'withdrawn' END,
         chosen_at = now(), choice_note = NULLIF(left(trim(p_note), 1000), ''),
         resolved_at = CASE WHEN p_choice = 'withdraw' THEN now() END,
         resolution_note = CASE WHEN p_choice = 'withdraw' THEN 'Student chose to withdraw' END
   WHERE id = _d.id;

  IF p_choice = 'withdraw' THEN
    UPDATE public.cohort_students SET status = 'dropped' WHERE cohort_id = _d.cohort_id AND enrollment_id = _d.enrollment_id;
  END IF;

  SELECT COALESCE(NULLIF(trim(pr.full_name), ''), e.full_name) INTO _name
  FROM public.enrollments e LEFT JOIN public.profiles pr ON pr.user_id = e.user_id WHERE e.id = _d.enrollment_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (NULL, 'dropout_' || p_choice, 'enrollment', _d.enrollment_id,
          jsonb_strip_nulls(jsonb_build_object('case_id', _d.id, 'note', NULLIF(trim(p_note), ''))));

  PERFORM public.notify_users(public._dropout_staff(_d), 'dropout_choice',
    _name || CASE WHEN p_choice = 'rejoin' THEN ' wants to rejoin the next cohort' ELSE ' has withdrawn' END,
    CASE WHEN p_choice = 'rejoin' THEN 'Move them into the next cohort from the Dropped off page.'
         ELSE 'They have left the cohort and payment reminders have stopped. Their balance is still on the Outstanding page.' END
      || COALESCE(' Their note: "' || NULLIF(trim(p_note), '') || '"', ''),
    '/admin/dropouts', _d.hub_id, _d.id);
  RETURN CASE WHEN p_choice = 'rejoin' THEN 'rejoin_requested' ELSE 'withdrawn' END;
END;
$$;

CREATE OR REPLACE FUNCTION public._can_manage_dropout(p_case public.dropout_cases)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND p_case.hub_id = public.get_my_hub_id())
    OR EXISTS (SELECT 1 FROM public.hub_members hm WHERE hm.user_id = auth.uid() AND hm.hub_role = 'manager' AND hm.hub_id = p_case.hub_id)
    OR public.classroom_staff_access(p_case.classroom_id);
$$;

-- Staff: move a student who chose to rejoin into another cohort of the programme.
CREATE OR REPLACE FUNCTION public.move_dropout_to_cohort(p_case_id uuid, p_cohort_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _d public.dropout_cases;
BEGIN
  SELECT * INTO _d FROM public.dropout_cases WHERE id = p_case_id FOR UPDATE;
  IF _d.id IS NULL OR NOT public._can_manage_dropout(_d) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _d.status NOT IN ('open', 'rejoin_requested') THEN RAISE EXCEPTION 'This case is already %', _d.status; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cohorts c JOIN public.enrollments e ON e.program_id = c.program_id
                 WHERE c.id = p_cohort_id AND e.id = _d.enrollment_id AND c.id <> _d.cohort_id) THEN
    RAISE EXCEPTION 'Pick another cohort of the same programme';
  END IF;

  UPDATE public.cohort_students SET status = 'dropped' WHERE cohort_id = _d.cohort_id AND enrollment_id = _d.enrollment_id;
  INSERT INTO public.cohort_students (cohort_id, student_id, enrollment_id)
  VALUES (p_cohort_id, _d.student_id, _d.enrollment_id)
  ON CONFLICT (cohort_id, student_id) DO UPDATE SET status = 'active';
  UPDATE public.enrollments SET cohort_id = p_cohort_id WHERE id = _d.enrollment_id;

  UPDATE public.dropout_cases
     SET status = 'moved', next_cohort_id = p_cohort_id, resolved_by = auth.uid(), resolved_at = now(),
         resolution_note = 'Moved to ' || (SELECT cohort_label FROM public.cohorts WHERE id = p_cohort_id)
   WHERE id = _d.id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'dropout_moved_to_cohort', 'enrollment', _d.enrollment_id,
          jsonb_build_object('case_id', _d.id, 'from_cohort_id', _d.cohort_id, 'to_cohort_id', p_cohort_id));
END;
$$;

-- Staff: record the outcome when the student told them by phone instead of the link.
CREATE OR REPLACE FUNCTION public.resolve_dropout_case(p_case_id uuid, p_status text, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _d public.dropout_cases;
BEGIN
  IF p_status NOT IN ('rejoin_requested', 'withdrawn', 'returned') THEN RAISE EXCEPTION 'Unknown outcome'; END IF;
  SELECT * INTO _d FROM public.dropout_cases WHERE id = p_case_id FOR UPDATE;
  IF _d.id IS NULL OR NOT public._can_manage_dropout(_d) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _d.status NOT IN ('open', 'rejoin_requested') THEN RAISE EXCEPTION 'This case is already %', _d.status; END IF;
  IF COALESCE(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Add a short note on what the student said'; END IF;

  UPDATE public.dropout_cases
     SET status = p_status, resolved_by = auth.uid(),
         resolved_at = CASE WHEN p_status = 'rejoin_requested' THEN NULL ELSE now() END,
         chosen_at = COALESCE(chosen_at, now()), resolution_note = trim(p_note)
   WHERE id = _d.id;
  IF p_status = 'withdrawn' THEN
    UPDATE public.cohort_students SET status = 'dropped' WHERE cohort_id = _d.cohort_id AND enrollment_id = _d.enrollment_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'dropout_' || p_status, 'enrollment', _d.enrollment_id, jsonb_build_object('case_id', _d.id, 'note', trim(p_note)));
END;
$$;

CREATE OR REPLACE FUNCTION public.list_dropout_cases(p_status text DEFAULT 'live')
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(x ORDER BY x.detected_at DESC), '[]'::jsonb) FROM (
    SELECT d.id, d.enrollment_id, d.status, d.detected_at, d.last_attended_at, d.chosen_at, d.choice_note,
           d.messages_sent, d.resolution_note, d.resolved_at,
           COALESCE(NULLIF(trim(pr.full_name), ''), e.full_name) AS student_name, e.email, e.phone,
           NULLIF(trim(e.guardian_name), '') AS guardian_name, NULLIF(trim(e.guardian_phone), '') AS guardian_phone,
           p.program_name, co.cohort_label, d.classroom_id,
           nc.id AS next_cohort_id, nc.cohort_label AS next_cohort_label, nc.start_date AS next_cohort_start,
           COALESCE(e.outstanding_balance, 0) AS outstanding,
           (SELECT jsonb_agg(jsonb_build_object('id', c.id, 'label', c.cohort_label, 'start_date', c.start_date) ORDER BY c.start_date NULLS LAST)
              FROM public.cohorts c WHERE c.program_id = e.program_id AND c.id <> d.cohort_id AND c.status IN ('upcoming', 'active')) AS cohort_options
    FROM public.dropout_cases d
    JOIN public.enrollments e ON e.id = d.enrollment_id
    JOIN public.programs p ON p.id = e.program_id
    JOIN public.cohorts co ON co.id = d.cohort_id
    LEFT JOIN public.cohorts nc ON nc.id = d.next_cohort_id
    LEFT JOIN public.profiles pr ON pr.user_id = e.user_id
    WHERE public._can_manage_dropout(d)
      AND CASE p_status WHEN 'live' THEN d.status IN ('open', 'rejoin_requested')
                        WHEN 'all' THEN true ELSE d.status = p_status END
    LIMIT 300
  ) x;
$$;

REVOKE ALL ON FUNCTION public._next_cohort_for(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._dropout_staff(public.dropout_cases) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._can_manage_dropout(public.dropout_cases) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.detect_dropouts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_dropout_outreach() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_dropout_to_cohort(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_dropout_case(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_dropout_cases(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_dropout_outreach() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_dropout_choice(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.choose_dropout_option(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_dropout_to_cohort(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_dropout_case(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_dropout_cases(text) TO authenticated;

-- 07:45 UTC (08:45 WAT), after the risk flags; send-dropout-outreach runs at 08:00 UTC.
SELECT cron.unschedule('detect-dropouts') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-dropouts');
SELECT cron.schedule('detect-dropouts', '45 7 * * *', $$SELECT public.detect_dropouts();$$);

SELECT cron.unschedule('send-dropout-outreach') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-dropout-outreach');
SELECT cron.schedule(
  'send-dropout-outreach',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ozjxktxbzhkujavmzjrf.supabase.co/functions/v1/send-dropout-outreach',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='crm_cron_secret' LIMIT 1)),
    body := '{}'::jsonb
  );
  $$
);
