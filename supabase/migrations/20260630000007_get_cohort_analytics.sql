-- Aggregate cohort analytics: enrollment breakdown, attendance rate,
-- per-session trend (last 20), and per-student attendance counts.
CREATE OR REPLACE FUNCTION public.get_cohort_analytics(p_cohort_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH
  enroll_agg AS (
    SELECT
      COUNT(*)                                                              AS total_students,
      COUNT(*) FILTER (WHERE e.enrollment_status = 'active')               AS active_count,
      COUNT(*) FILTER (WHERE e.enrollment_status = 'pending')              AS pending_count,
      COUNT(*) FILTER (WHERE e.enrollment_status = 'overdue')              AS overdue_count,
      COUNT(*) FILTER (WHERE e.enrollment_status = 'completed')            AS completed_count,
      COUNT(*) FILTER (WHERE e.enrollment_status = 'cancelled')            AS cancelled_count,
      COALESCE(SUM(e.total_amount),        0)                              AS total_invoiced,
      COALESCE(SUM(e.amount_paid),         0)                              AS total_paid,
      COALESCE(SUM(e.outstanding_balance), 0)                              AS total_outstanding
    FROM public.cohort_students cs
    LEFT JOIN public.enrollments e ON e.id = cs.enrollment_id
    WHERE cs.cohort_id = p_cohort_id
  ),
  session_agg AS (
    SELECT
      COUNT(*)                                             AS total_sessions,
      COUNT(*) FILTER (WHERE status = 'closed')           AS closed_sessions,
      COUNT(*) FILTER (WHERE status = 'open')             AS open_sessions
    FROM public.attendance_sessions
    WHERE cohort_id = p_cohort_id
  ),
  record_agg AS (
    SELECT
      COUNT(ar.id)                                                          AS total_marks,
      COUNT(ar.id) FILTER (WHERE ar.attendance_status = 'present')         AS present_count,
      COUNT(ar.id) FILTER (WHERE ar.attendance_status = 'late')            AS late_count
    FROM public.attendance_sessions s
    JOIN public.attendance_records ar ON ar.session_id = s.id
    WHERE s.cohort_id = p_cohort_id
      AND s.status    = 'closed'
  ),
  trend_agg AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'code',    t.code,
        'date',    t.session_date,
        'present', t.present_count,
        'late',    t.late_count,
        'absent',  GREATEST(0, t.enrolled_count - t.present_count - t.late_count)
      ) ORDER BY t.session_date
    ) AS trend
    FROM (
      SELECT
        s.code,
        s.created_at::date                                                 AS session_date,
        COUNT(ar.id) FILTER (WHERE ar.attendance_status = 'present')      AS present_count,
        COUNT(ar.id) FILTER (WHERE ar.attendance_status = 'late')         AS late_count,
        (SELECT COUNT(*) FROM public.cohort_students WHERE cohort_id = p_cohort_id) AS enrolled_count
      FROM (
        SELECT id, code, created_at
        FROM public.attendance_sessions
        WHERE cohort_id = p_cohort_id AND status = 'closed'
        ORDER BY created_at DESC
        LIMIT 20
      ) s
      LEFT JOIN public.attendance_records ar ON ar.session_id = s.id
      GROUP BY s.id, s.code, s.created_at
    ) t
  ),
  student_agg AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'student_id',        t.student_id,
        'full_name',         t.full_name,
        'sessions_attended', t.sessions_attended,
        'total_sessions',    t.total_closed
      ) ORDER BY t.sessions_attended DESC
    ) AS students
    FROM (
      SELECT
        cs.student_id,
        p.full_name,
        COUNT(ar.id)                                                       AS sessions_attended,
        (SELECT COUNT(*) FROM public.attendance_sessions
         WHERE cohort_id = p_cohort_id AND status = 'closed')             AS total_closed
      FROM public.cohort_students cs
      LEFT JOIN public.profiles p ON p.user_id = cs.student_id
      LEFT JOIN public.attendance_sessions s
             ON s.cohort_id = p_cohort_id AND s.status = 'closed'
      LEFT JOIN public.attendance_records ar
             ON ar.session_id   = s.id
            AND ar.student_id   = cs.student_id
            AND ar.attendance_status IN ('present', 'late')
      WHERE cs.cohort_id = p_cohort_id
      GROUP BY cs.student_id, p.full_name
    ) t
  )
SELECT jsonb_build_object(
  'enrollment', jsonb_build_object(
    'total_students',    e.total_students,
    'active_count',      e.active_count,
    'pending_count',     e.pending_count,
    'overdue_count',     e.overdue_count,
    'completed_count',   e.completed_count,
    'cancelled_count',   e.cancelled_count,
    'total_invoiced',    e.total_invoiced,
    'total_paid',        e.total_paid,
    'total_outstanding', e.total_outstanding
  ),
  'sessions', jsonb_build_object(
    'total_sessions',  ss.total_sessions,
    'closed_sessions', ss.closed_sessions,
    'open_sessions',   ss.open_sessions
  ),
  'attendance', jsonb_build_object(
    'total_marks',     ra.total_marks,
    'present_count',   ra.present_count,
    'late_count',      ra.late_count,
    'attendance_rate', CASE
      WHEN ss.closed_sessions = 0 OR e.total_students = 0 THEN 0
      ELSE ROUND(
        (ra.present_count + ra.late_count)::numeric
        / NULLIF(ss.closed_sessions * e.total_students, 0) * 100
      , 1)
    END
  ),
  'trend',    COALESCE((SELECT trend    FROM trend_agg),   '[]'::jsonb),
  'students', COALESCE((SELECT students FROM student_agg), '[]'::jsonb)
)
FROM enroll_agg e, session_agg ss, record_agg ra
$$;

GRANT EXECUTE ON FUNCTION public.get_cohort_analytics(uuid) TO authenticated;
