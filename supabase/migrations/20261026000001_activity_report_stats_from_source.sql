-- The Activity Report's stat cards and per-classroom table were counted from
-- activity_events, which only exist from the day the triggers went live
-- (2026-10-22) and only for the transitions the triggers watch. That made every
-- figure wrong: "Classes held" counted schedules marked completed (tutors don't
-- mark them; classes are recorded by taking attendance), "Attendance sessions"
-- only counted sessions that had been closed, anything before go-live was
-- missing, and installment payments were never logged at all.
--
-- The numbers now come straight from the source tables for the requested range.
-- activity_events stays the timeline only.
--   classes held        = attendance sessions opened in range
--                         + schedules marked completed (dated in range) with no attendance session
--   classes cancelled   = schedules cancelled, dated in range
--   attendance sessions = attendance sessions opened in range
--   check-ins           = attendance records (present/late) marked in range
--   sessions scheduled  = schedules created in range
--   submissions         = assignment submissions made in range
--   assignments         = published assignments created in range (there is no published_at)
--   enrollments         = enrollments created in range
--   payments            = cash basis, both legs, exactly as get_finance_summary's revenue_cash
-- Schedule dates are Lagos wall-clock dates, so the range is converted with Africa/Lagos.

CREATE OR REPLACE FUNCTION public._activity_hub_visible(p_hub_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
      OR EXISTS (
        SELECT 1 FROM public.activity_report_viewers v
        WHERE v.user_id = auth.uid() AND v.hub_id = p_hub_id
      );
$$;

REVOKE ALL ON FUNCTION public._activity_hub_visible(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_activity_stats(p_since timestamptz, p_until timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from date := (p_since AT TIME ZONE 'Africa/Lagos')::date;
  _to   date := (p_until AT TIME ZONE 'Africa/Lagos')::date;
  _out  jsonb;
BEGIN
  IF NOT public.can_view_activity_report() THEN
    RAISE EXCEPTION 'Access denied: activity report';
  END IF;

  WITH rooms AS (
    SELECT c.id FROM public.classrooms c WHERE public._activity_hub_visible(c.hub_id)
  ),
  att AS (
    SELECT s.id FROM public.attendance_sessions s
    WHERE s.classroom_id IN (SELECT id FROM rooms)
      AND s.created_at >= p_since AND s.created_at <= p_until
  ),
  sch AS (
    SELECT s.id, s.status, s.scheduled_date, s.created_at FROM public.schedules s
    WHERE s.classroom_id IN (SELECT id FROM rooms)
  ),
  money AS (
    SELECT p.amount
    FROM public.payments p
    JOIN public.invoices i     ON i.id  = p.invoice_id
    JOIN public.enrollments e  ON e.id  = i.enrollment_id
    JOIN public.programs pr    ON pr.id = e.program_id
    WHERE public._activity_hub_visible(pr.hub_id)
      AND i.status != 'cancelled'
      AND COALESCE(p.paid_at_actual, p.payment_date::timestamptz) >= p_since
      AND COALESCE(p.paid_at_actual, p.payment_date::timestamptz) <= p_until
    UNION ALL
    SELECT inst.amount
    FROM public.installments inst
    JOIN public.invoices i     ON i.id  = inst.invoice_id
    JOIN public.enrollments e  ON e.id  = i.enrollment_id
    JOIN public.programs pr    ON pr.id = e.program_id
    WHERE public._activity_hub_visible(pr.hub_id)
      AND inst.status = 'paid'
      AND i.status != 'cancelled'
      AND COALESCE(inst.paid_at_actual, inst.paid_at) >= p_since
      AND COALESCE(inst.paid_at_actual, inst.paid_at) <= p_until
  )
  SELECT jsonb_build_object(
    'classes_held',
      (SELECT count(*) FROM att)
      + (SELECT count(*) FROM sch
         WHERE sch.status = 'completed' AND sch.scheduled_date BETWEEN _from AND _to
           AND NOT EXISTS (SELECT 1 FROM public.attendance_sessions a WHERE a.schedule_id = sch.id)),
    'classes_cancelled',
      (SELECT count(*) FROM sch WHERE sch.status = 'cancelled' AND sch.scheduled_date BETWEEN _from AND _to),
    'attendance_sessions', (SELECT count(*) FROM att),
    'check_ins',
      (SELECT count(*) FROM public.attendance_records r
       WHERE r.classroom_id IN (SELECT id FROM rooms)
         AND r.attendance_status IN ('present', 'late')
         AND r.marked_at >= p_since AND r.marked_at <= p_until),
    'sessions_scheduled',
      (SELECT count(*) FROM sch WHERE sch.created_at >= p_since AND sch.created_at <= p_until),
    'submissions',
      (SELECT count(*) FROM public.assignment_submissions sub
       JOIN public.assignments a ON a.id = sub.assignment_id
       WHERE a.classroom_id IN (SELECT id FROM rooms)
         AND COALESCE(sub.submitted_at, sub.created_at) >= p_since
         AND COALESCE(sub.submitted_at, sub.created_at) <= p_until),
    'assignments_published',
      (SELECT count(*) FROM public.assignments a
       WHERE a.classroom_id IN (SELECT id FROM rooms)
         AND a.status = 'published'
         AND a.created_at >= p_since AND a.created_at <= p_until),
    'enrollments',
      (SELECT count(*) FROM public.enrollments e
       JOIN public.programs pr ON pr.id = e.program_id
       WHERE public._activity_hub_visible(pr.hub_id)
         AND e.created_at >= p_since AND e.created_at <= p_until),
    'payments_count', (SELECT count(*) FROM money),
    'payments_amount', (SELECT COALESCE(sum(amount), 0) FROM money)
  ) INTO _out;

  RETURN _out;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_activity_classroom_stats(p_since timestamptz, p_until timestamptz DEFAULT now())
RETURNS TABLE (
  classroom_id     uuid,
  classroom_name   text,
  hub_name         text,
  classes_held     bigint,
  classes_cancelled bigint,
  check_ins        bigint,
  submissions      bigint,
  last_activity_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from date := (p_since AT TIME ZONE 'Africa/Lagos')::date;
  _to   date := (p_until AT TIME ZONE 'Africa/Lagos')::date;
BEGIN
  IF NOT public.can_view_activity_report() THEN
    RAISE EXCEPTION 'Access denied: activity report';
  END IF;

  RETURN QUERY
  WITH rooms AS (
    SELECT c.id, c.name, h.name AS hub_name
    FROM public.classrooms c
    LEFT JOIN public.hubs h ON h.id = c.hub_id
    WHERE public._activity_hub_visible(c.hub_id)
  ),
  att AS (
    SELECT s.classroom_id, count(*) AS n, max(s.created_at) AS last_at
    FROM public.attendance_sessions s
    WHERE s.created_at >= p_since AND s.created_at <= p_until
    GROUP BY s.classroom_id
  ),
  sch AS (
    SELECT s.classroom_id,
           count(*) FILTER (WHERE s.status = 'completed'
             AND NOT EXISTS (SELECT 1 FROM public.attendance_sessions a WHERE a.schedule_id = s.id)) AS completed_only,
           count(*) FILTER (WHERE s.status = 'cancelled') AS cancelled,
           max(s.updated_at) AS last_at
    FROM public.schedules s
    WHERE s.scheduled_date BETWEEN _from AND _to
      AND s.status IN ('completed', 'cancelled')
    GROUP BY s.classroom_id
  ),
  chk AS (
    SELECT r.classroom_id, count(*) AS n, max(r.marked_at) AS last_at
    FROM public.attendance_records r
    WHERE r.attendance_status IN ('present', 'late')
      AND r.marked_at >= p_since AND r.marked_at <= p_until
    GROUP BY r.classroom_id
  ),
  sub AS (
    SELECT a.classroom_id, count(*) AS n, max(COALESCE(x.submitted_at, x.created_at)) AS last_at
    FROM public.assignment_submissions x
    JOIN public.assignments a ON a.id = x.assignment_id
    WHERE COALESCE(x.submitted_at, x.created_at) >= p_since
      AND COALESCE(x.submitted_at, x.created_at) <= p_until
    GROUP BY a.classroom_id
  )
  SELECT rooms.id, rooms.name, rooms.hub_name,
         COALESCE(att.n, 0) + COALESCE(sch.completed_only, 0),
         COALESCE(sch.cancelled, 0),
         COALESCE(chk.n, 0),
         COALESCE(sub.n, 0),
         GREATEST(att.last_at, sch.last_at, chk.last_at, sub.last_at)
  FROM rooms
  LEFT JOIN att ON att.classroom_id = rooms.id
  LEFT JOIN sch ON sch.classroom_id = rooms.id
  LEFT JOIN chk ON chk.classroom_id = rooms.id
  LEFT JOIN sub ON sub.classroom_id = rooms.id
  WHERE att.n IS NOT NULL OR sch.classroom_id IS NOT NULL OR chk.n IS NOT NULL OR sub.n IS NOT NULL
  ORDER BY 4 DESC, 6 DESC, rooms.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_activity_stats(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_activity_classroom_stats(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_activity_stats(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_activity_classroom_stats(timestamptz, timestamptz) TO authenticated;
