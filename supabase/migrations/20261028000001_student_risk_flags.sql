-- Engagement alerts: flag students who are drifting away while there is still
-- time to bring them back, and tell the cohort's tutor.
--   * missed_classes: absent from the cohort's last 2 closed sessions (30 days).
--     Absence = no attendance_records row; only present/late/excused are stored.
--   * missing_assignment: a published assignment for their cohort (or the whole
--     classroom) went past due 12h+ ago, within 14 days, with no submission.
-- A session where under half the cohort marked attendance is not counted against
-- anyone: that pattern means attendance wasn't taken, not that the class skipped.
-- get_student_risk_flags reports those sessions separately to the tutor.
-- refresh_student_risk_flags runs daily; flags clear themselves once the student
-- attends or submits, and a tutor can dismiss one so it stops showing.

CREATE TABLE IF NOT EXISTS public.student_risk_flags (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id         uuid REFERENCES public.hubs(id) ON DELETE CASCADE,
  classroom_id   uuid REFERENCES public.classrooms(id) ON DELETE CASCADE,
  cohort_id      uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  student_id     uuid NOT NULL,
  enrollment_id  uuid REFERENCES public.enrollments(id) ON DELETE SET NULL,
  reason         text NOT NULL CHECK (reason IN ('missed_classes', 'missing_assignment')),
  detail         jsonb NOT NULL DEFAULT '{}',
  flagged_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz,
  dismissed_at   timestamptz,
  dismissed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_risk_flags_open
  ON public.student_risk_flags (cohort_id, student_id, reason) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_student_risk_flags_classroom
  ON public.student_risk_flags (classroom_id) WHERE resolved_at IS NULL;

DROP TRIGGER IF EXISTS trg_student_risk_flags_set_hub_id ON public.student_risk_flags;
CREATE TRIGGER trg_student_risk_flags_set_hub_id
  BEFORE INSERT ON public.student_risk_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

ALTER TABLE public.student_risk_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Classroom staff and admins read risk flags" ON public.student_risk_flags FOR SELECT
  USING (public.classroom_staff_access(classroom_id));

GRANT SELECT ON public.student_risk_flags TO authenticated;
GRANT ALL ON public.student_risk_flags TO service_role;

-- Sessions that count towards absences: closed, last 30 days, and at least half
-- the cohort marked attendance.
CREATE OR REPLACE FUNCTION public._countable_attendance_sessions()
RETURNS TABLE (session_id uuid, cohort_id uuid, created_at timestamptz, marked integer, cohort_size integer, countable boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.cohort_id, s.created_at,
         (SELECT count(DISTINCT r.student_id) FROM public.attendance_records r WHERE r.session_id = s.id)::integer,
         sz.n::integer,
         (SELECT count(DISTINCT r.student_id) FROM public.attendance_records r WHERE r.session_id = s.id) * 2 >= sz.n
  FROM public.attendance_sessions s
  JOIN public.cohorts c ON c.id = s.cohort_id AND c.status = 'active'
  CROSS JOIN LATERAL (
    SELECT count(*) AS n FROM public.cohort_students cs
    WHERE cs.cohort_id = s.cohort_id AND cs.status = 'active' AND cs.joined_at <= s.created_at
  ) sz
  WHERE s.status = 'closed' AND s.created_at > now() - interval '30 days' AND sz.n > 0;
$$;

CREATE OR REPLACE FUNCTION public._current_risk_signals()
RETURNS TABLE (hub_id uuid, classroom_id uuid, cohort_id uuid, student_id uuid, enrollment_id uuid, reason text, detail jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH members AS (
    SELECT cs.cohort_id, cs.student_id, cs.enrollment_id, cs.joined_at, c.classroom_id, c.hub_id
    FROM public.cohort_students cs
    JOIN public.cohorts c ON c.id = cs.cohort_id
    WHERE cs.status = 'active' AND c.status = 'active' AND cs.student_id IS NOT NULL
  ),
  ranked AS (
    SELECT m.cohort_id, m.student_id, s.session_id, s.created_at,
           row_number() OVER (PARTITION BY m.cohort_id, m.student_id ORDER BY s.created_at DESC) AS rn,
           EXISTS (SELECT 1 FROM public.attendance_records r WHERE r.session_id = s.session_id AND r.student_id = m.student_id) AS attended
    FROM members m
    JOIN public._countable_attendance_sessions() s ON s.cohort_id = m.cohort_id AND s.countable AND s.created_at >= m.joined_at
  ),
  missed AS (
    SELECT cohort_id, student_id,
           jsonb_build_object('sessions', jsonb_agg(jsonb_build_object('id', session_id, 'at', created_at) ORDER BY created_at DESC)) AS detail
    FROM ranked WHERE rn <= 2
    GROUP BY cohort_id, student_id
    HAVING count(*) = 2 AND NOT bool_or(attended)
  ),
  overdue AS (
    SELECT m.cohort_id, m.student_id,
           jsonb_build_object('assignments', jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'due', a.due_date) ORDER BY a.due_date DESC)) AS detail
    FROM members m
    JOIN public.assignments a ON a.status = 'published'
      AND (a.cohort_id = m.cohort_id OR (a.cohort_id IS NULL AND a.classroom_id = m.classroom_id))
      AND a.due_date < now() - interval '12 hours'
      AND a.due_date > now() - interval '14 days'
      AND a.due_date > m.joined_at
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assignment_submissions sb WHERE sb.assignment_id = a.id AND sb.student_id = m.student_id
    )
    GROUP BY m.cohort_id, m.student_id
  )
  SELECT m.hub_id, m.classroom_id, m.cohort_id, m.student_id, m.enrollment_id, 'missed_classes', x.detail
  FROM missed x JOIN members m USING (cohort_id, student_id)
  UNION ALL
  SELECT m.hub_id, m.classroom_id, m.cohort_id, m.student_id, m.enrollment_id, 'missing_assignment', x.detail
  FROM overdue x JOIN members m USING (cohort_id, student_id);
$$;

REVOKE ALL ON FUNCTION public._countable_attendance_sessions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._current_risk_signals() FROM PUBLIC, anon, authenticated;

-- Daily: open new flags, refresh or clear existing ones, and send each cohort's
-- tutor one notification about students newly flagged in it.
CREATE OR REPLACE FUNCTION public.refresh_student_risk_flags()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run        timestamptz := clock_timestamp();
  _c          record;
  _recipients uuid[];
  _notified   integer := 0;
BEGIN
  DROP TABLE IF EXISTS _signals;
  CREATE TEMP TABLE _signals ON COMMIT DROP AS SELECT * FROM public._current_risk_signals();

  UPDATE public.student_risk_flags f
     SET detail = s.detail, last_seen_at = _run
    FROM _signals s
   WHERE f.resolved_at IS NULL
     AND f.cohort_id = s.cohort_id AND f.student_id = s.student_id AND f.reason = s.reason;

  UPDATE public.student_risk_flags f
     SET resolved_at = _run
   WHERE f.resolved_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM _signals s WHERE s.cohort_id = f.cohort_id AND s.student_id = f.student_id AND s.reason = f.reason);

  INSERT INTO public.student_risk_flags (hub_id, classroom_id, cohort_id, student_id, enrollment_id, reason, detail, flagged_at, last_seen_at)
  SELECT s.hub_id, s.classroom_id, s.cohort_id, s.student_id, s.enrollment_id, s.reason, s.detail, _run, _run
  FROM _signals s
  ON CONFLICT (cohort_id, student_id, reason) WHERE resolved_at IS NULL DO NOTHING;

  FOR _c IN
    SELECT f.cohort_id, f.classroom_id, f.hub_id, co.cohort_label, co.primary_tutor_id,
           count(DISTINCT f.student_id) AS students,
           count(*) FILTER (WHERE f.reason = 'missed_classes') AS missed,
           count(*) FILTER (WHERE f.reason = 'missing_assignment') AS overdue
    FROM public.student_risk_flags f
    JOIN public.cohorts co ON co.id = f.cohort_id
    WHERE f.flagged_at = _run AND f.classroom_id IS NOT NULL
    GROUP BY f.cohort_id, f.classroom_id, f.hub_id, co.cohort_label, co.primary_tutor_id
  LOOP
    _recipients := CASE WHEN _c.primary_tutor_id IS NOT NULL THEN public.staff_user_ids(_c.primary_tutor_id) END;
    IF COALESCE(cardinality(_recipients), 0) = 0 THEN
      _recipients := ARRAY(
        SELECT cs.user_id FROM public.classroom_staff cs
        WHERE cs.classroom_id = _c.classroom_id AND cs.status = 'active'
          AND cs.staff_type = 'teaching' AND cs.user_id IS NOT NULL
      );
    END IF;

    _notified := _notified + public.notify_users(_recipients, 'students_need_attention',
      CASE WHEN _c.students = 1 THEN '1 student needs attention in ' ELSE _c.students || ' students need attention in ' END || _c.cohort_label,
      concat_ws(' and ',
        CASE WHEN _c.missed > 0 THEN _c.missed || ' missed the last two classes' END,
        CASE WHEN _c.overdue > 0 THEN _c.overdue || ' haven''t submitted an assignment that''s past due' END
      ) || '. A quick message now is the best chance of keeping them on track.',
      '/staff/classrooms/' || _c.classroom_id || '?tab=students', _c.hub_id, _c.cohort_id);
  END LOOP;

  RETURN _notified;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_student_risk_flags() FROM PUBLIC, anon, authenticated;

-- What a tutor or admin sees on the classroom's Students tab.
CREATE OR REPLACE FUNCTION public.get_student_risk_flags(p_classroom_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.classroom_staff_access(p_classroom_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN jsonb_build_object(
    'flags', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'cohort_id', f.cohort_id, 'cohort_label', co.cohort_label,
        'student_id', f.student_id,
        'student_name', COALESCE(NULLIF(trim(p.full_name), ''), e.full_name),
        'email', COALESCE(p.email, e.email), 'phone', e.phone,
        'reason', f.reason, 'detail', f.detail, 'flagged_at', f.flagged_at,
        'dismissed', f.dismissed_at IS NOT NULL
      ) ORDER BY f.dismissed_at NULLS FIRST, f.flagged_at DESC)
      FROM public.student_risk_flags f
      JOIN public.cohorts co ON co.id = f.cohort_id
      LEFT JOIN public.profiles p ON p.user_id = f.student_id
      LEFT JOIN public.enrollments e ON e.id = f.enrollment_id
      WHERE f.classroom_id = p_classroom_id AND f.resolved_at IS NULL
    ), '[]'::jsonb),
    'uncounted_sessions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'cohort_label', co.cohort_label, 'at', s.created_at, 'marked', s.marked, 'cohort_size', s.cohort_size
      ) ORDER BY s.created_at DESC)
      FROM public._countable_attendance_sessions() s
      JOIN public.cohorts co ON co.id = s.cohort_id
      WHERE co.classroom_id = p_classroom_id AND NOT s.countable AND s.created_at > now() - interval '14 days'
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_student_risk_flag(p_flag_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _f public.student_risk_flags;
BEGIN
  SELECT * INTO _f FROM public.student_risk_flags WHERE id = p_flag_id;
  IF _f.id IS NULL OR NOT public.classroom_staff_access(_f.classroom_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE public.student_risk_flags SET dismissed_at = now(), dismissed_by = auth.uid() WHERE id = p_flag_id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'student_risk_flag_dismissed', 'student_risk_flag', p_flag_id,
          jsonb_build_object('reason', _f.reason, 'student_id', _f.student_id, 'cohort_id', _f.cohort_id));
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_risk_flags(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dismiss_student_risk_flag(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_risk_flags(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_student_risk_flag(uuid) TO authenticated;

-- 07:30 UTC = 08:30 WAT, after the cohort setup reminders.
SELECT cron.unschedule('refresh-student-risk-flags')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-student-risk-flags');

SELECT cron.schedule(
  'refresh-student-risk-flags',
  '30 7 * * *',
  $$SELECT public.refresh_student_risk_flags();$$
);
