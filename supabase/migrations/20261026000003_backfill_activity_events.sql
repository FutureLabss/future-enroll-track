-- The activity triggers went live on 2026-10-22, so the Activity Report timeline
-- had nothing before that. Rebuild past events from the timestamps the source
-- tables already hold. Each row is tagged {"backfilled": true}; no notifications
-- are sent. Every insert skips anything already logged (same event type and
-- entity, or for batched events the same cohort and Lagos day), so this is safe to re-run.
-- Times are the best evidence each table has: e.g. schedule completion and
-- cancellation use updated_at, and payments use the same cash-basis date as
-- get_finance_summary (bank timestamp when matched, else the staff-entered date).

-- Attendance opened / closed
INSERT INTO public.activity_events (hub_id, actor_id, event_type, category, entity_type, entity_id, classroom_id, cohort_id, summary, details, created_at)
SELECT cl.hub_id, s.generated_by, 'attendance_opened', 'attendance', 'attendance_session', s.id, s.classroom_id, s.cohort_id,
       'Attendance opened for ' || public.activity_scope_label(s.classroom_id, s.cohort_id),
       jsonb_build_object('duration_mins', s.duration_mins, 'backfilled', true), s.created_at
FROM public.attendance_sessions s
JOIN public.classrooms cl ON cl.id = s.classroom_id
WHERE NOT EXISTS (SELECT 1 FROM public.activity_events e WHERE e.event_type = 'attendance_opened' AND e.entity_id = s.id);

INSERT INTO public.activity_events (hub_id, actor_id, event_type, category, entity_type, entity_id, classroom_id, cohort_id, summary, details, created_at)
SELECT cl.hub_id, s.generated_by, 'attendance_closed', 'attendance', 'attendance_session', s.id, s.classroom_id, s.cohort_id,
       'Attendance closed for ' || public.activity_scope_label(s.classroom_id, s.cohort_id)
         || ': ' || r.present || ' present, ' || r.late || ' late',
       jsonb_build_object('present', r.present, 'late', r.late, 'backfilled', true), s.closed_at
FROM public.attendance_sessions s
JOIN public.classrooms cl ON cl.id = s.classroom_id
CROSS JOIN LATERAL (
  SELECT count(*) FILTER (WHERE attendance_status = 'present') AS present,
         count(*) FILTER (WHERE attendance_status = 'late') AS late
  FROM public.attendance_records WHERE session_id = s.id
) r
WHERE s.status = 'closed' AND s.closed_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.activity_events e WHERE e.event_type = 'attendance_closed' AND e.entity_id = s.id);

-- Sessions scheduled: one event per classroom/cohort per Lagos day they were created
INSERT INTO public.activity_events (hub_id, actor_id, event_type, category, entity_type, entity_id, classroom_id, cohort_id, summary, details, created_at)
SELECT cl.hub_id, g.actor, 'sessions_scheduled', 'schedule', 'schedule', CASE WHEN g.n = 1 THEN g.any_id END, g.classroom_id, g.cohort_id,
       g.n || ' class session' || CASE WHEN g.n = 1 THEN '' ELSE 's' END || ' scheduled for '
         || public.activity_scope_label(g.classroom_id, g.cohort_id)
         || CASE WHEN g.n = 1 THEN ' on ' || to_char(g.first_date, 'Dy DD Mon YYYY')
                 ELSE ' from ' || to_char(g.first_date, 'DD Mon') || ' to ' || to_char(g.last_date, 'DD Mon YYYY') END,
       jsonb_build_object('count', g.n, 'first_date', g.first_date, 'last_date', g.last_date, 'backfilled', true), g.at
FROM (
  SELECT s.classroom_id, s.cohort_id, (s.created_at AT TIME ZONE 'Africa/Lagos')::date AS day,
         count(*) AS n, min(s.scheduled_date) AS first_date, max(s.scheduled_date) AS last_date,
         min(s.created_at) AS at, (array_agg(s.created_by) FILTER (WHERE s.created_by IS NOT NULL))[1] AS actor,
         min(s.id::text)::uuid AS any_id
  FROM public.schedules s
  GROUP BY 1, 2, 3
) g
JOIN public.classrooms cl ON cl.id = g.classroom_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.activity_events e
  WHERE e.event_type = 'sessions_scheduled'
    AND e.classroom_id = g.classroom_id
    AND e.cohort_id IS NOT DISTINCT FROM g.cohort_id
    AND (e.created_at AT TIME ZONE 'Africa/Lagos')::date = g.day
);

-- Sessions completed / cancelled
INSERT INTO public.activity_events (hub_id, actor_id, event_type, category, entity_type, entity_id, classroom_id, cohort_id, summary, details, created_at)
SELECT cl.hub_id, NULL,
       CASE s.status WHEN 'completed' THEN 'session_completed' ELSE 'session_cancelled' END,
       'schedule', 'schedule', s.id, s.classroom_id, s.cohort_id,
       public.activity_session_label(s)
         || CASE s.status WHEN 'completed' THEN ' held for ' ELSE ' cancelled for ' END
         || public.activity_scope_label(s.classroom_id, s.cohort_id)
         || ' (' || to_char(s.scheduled_date, 'Dy DD Mon YYYY') || ', ' || to_char(s.start_time, 'HH24:MI') || '–' || to_char(s.end_time, 'HH24:MI') || ')',
       jsonb_build_object('scheduled_date', s.scheduled_date, 'status', s.status, 'backfilled', true), s.updated_at
FROM public.schedules s
JOIN public.classrooms cl ON cl.id = s.classroom_id
WHERE s.status IN ('completed', 'cancelled')
  AND NOT EXISTS (
    SELECT 1 FROM public.activity_events e
    WHERE e.event_type IN ('session_completed', 'session_cancelled') AND e.entity_id = s.id
  );

-- Assignments published, submitted, graded
INSERT INTO public.activity_events (hub_id, actor_id, event_type, category, entity_type, entity_id, classroom_id, cohort_id, summary, details, created_at)
SELECT cl.hub_id, a.created_by, 'assignment_published', 'assignment', 'assignment', a.id, a.classroom_id, a.cohort_id,
       'Assignment "' || a.title || '" published for ' || public.activity_scope_label(a.classroom_id, a.cohort_id),
       jsonb_build_object('due_date', a.due_date, 'backfilled', true), a.created_at
FROM public.assignments a
JOIN public.classrooms cl ON cl.id = a.classroom_id
WHERE a.status = 'published'
  AND NOT EXISTS (SELECT 1 FROM public.activity_events e WHERE e.event_type = 'assignment_published' AND e.entity_id = a.id);

INSERT INTO public.activity_events (hub_id, actor_id, event_type, category, entity_type, entity_id, classroom_id, cohort_id, summary, details, created_at)
SELECT cl.hub_id, x.student_id, 'assignment_submitted', 'assignment', 'assignment_submission', x.id, a.classroom_id, a.cohort_id,
       COALESCE(p.full_name, p.email, 'A student') || ' submitted "' || a.title || '"'
         || CASE WHEN x.status = 'late' THEN ' (late)' ELSE '' END,
       jsonb_build_object('assignment_id', a.id, 'status', x.status, 'backfilled', true),
       COALESCE(x.submitted_at, x.created_at)
FROM public.assignment_submissions x
JOIN public.assignments a ON a.id = x.assignment_id
JOIN public.classrooms cl ON cl.id = a.classroom_id
LEFT JOIN public.profiles p ON p.user_id = x.student_id
WHERE NOT EXISTS (SELECT 1 FROM public.activity_events e WHERE e.event_type = 'assignment_submitted' AND e.entity_id = x.id);

INSERT INTO public.activity_events (hub_id, actor_id, event_type, category, entity_type, entity_id, classroom_id, cohort_id, summary, details, created_at)
SELECT cl.hub_id, x.graded_by, 'assignment_graded', 'assignment', 'assignment_submission', x.id, a.classroom_id, a.cohort_id,
       COALESCE(p.full_name, p.email, 'A student') || '''s "' || a.title || '" graded' || COALESCE(': ' || x.grade, ''),
       jsonb_build_object('assignment_id', a.id, 'grade', x.grade, 'backfilled', true), x.graded_at
FROM public.assignment_submissions x
JOIN public.assignments a ON a.id = x.assignment_id
JOIN public.classrooms cl ON cl.id = a.classroom_id
LEFT JOIN public.profiles p ON p.user_id = x.student_id
WHERE x.status = 'graded' AND x.graded_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.activity_events e WHERE e.event_type = 'assignment_graded' AND e.entity_id = x.id);

-- Cohorts created, students joining (one event per cohort per Lagos day)
INSERT INTO public.activity_events (hub_id, actor_id, event_type, category, entity_type, entity_id, classroom_id, cohort_id, summary, details, created_at)
SELECT public.activity_hub_for(co.classroom_id, co.id), NULL, 'cohort_created', 'cohort', 'cohort', co.id, co.classroom_id, co.id,
       'Cohort "' || co.cohort_label || '" created',
       jsonb_build_object('start_date', co.start_date, 'end_date', co.end_date, 'backfilled', true), co.created_at
FROM public.cohorts co
WHERE NOT EXISTS (SELECT 1 FROM public.activity_events e WHERE e.event_type = 'cohort_created' AND e.entity_id = co.id);

INSERT INTO public.activity_events (hub_id, actor_id, event_type, category, entity_type, entity_id, classroom_id, cohort_id, summary, details, created_at)
SELECT public.activity_hub_for(co.classroom_id, co.id), NULL, 'students_joined_cohort', 'cohort', 'cohort', co.id, co.classroom_id, co.id,
       g.n || ' student' || CASE WHEN g.n = 1 THEN '' ELSE 's' END || ' added to ' || co.cohort_label,
       jsonb_build_object('count', g.n, 'backfilled', true), g.at
FROM (
  SELECT cs.cohort_id, (cs.joined_at AT TIME ZONE 'Africa/Lagos')::date AS day, count(*) AS n, min(cs.joined_at) AS at
  FROM public.cohort_students cs
  GROUP BY 1, 2
) g
JOIN public.cohorts co ON co.id = g.cohort_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.activity_events e
  WHERE e.event_type = 'students_joined_cohort' AND e.cohort_id = g.cohort_id
    AND (e.created_at AT TIME ZONE 'Africa/Lagos')::date = g.day
);

-- Staff assigned to classrooms
INSERT INTO public.activity_events (hub_id, actor_id, event_type, category, entity_type, entity_id, classroom_id, cohort_id, summary, details, created_at)
SELECT cl.hub_id, cs.assigned_by, 'staff_assigned', 'staff', 'classroom_staff', cs.id, cs.classroom_id, NULL,
       COALESCE(st.full_name, 'A staff member') || ' assigned to ' || cl.name,
       jsonb_build_object('staff_type', cs.staff_type, 'backfilled', true), cs.assigned_at
FROM public.classroom_staff cs
JOIN public.classrooms cl ON cl.id = cs.classroom_id
LEFT JOIN public.staff st ON st.id = cs.staff_id
WHERE NOT EXISTS (SELECT 1 FROM public.activity_events e WHERE e.event_type = 'staff_assigned' AND e.entity_id = cs.id);

-- Enrollments
INSERT INTO public.activity_events (hub_id, actor_id, event_type, category, entity_type, entity_id, classroom_id, cohort_id, summary, details, created_at)
SELECT pr.hub_id, NULL, 'enrollment_created', 'enrollment', 'enrollment', e.id, NULL,
       CASE WHEN EXISTS (SELECT 1 FROM public.cohorts c WHERE c.id = e.cohort_id) THEN e.cohort_id END,
       e.full_name || ' enrolled in ' || COALESCE(pr.program_name, 'a program'),
       jsonb_build_object('program_id', e.program_id, 'status', e.enrollment_status, 'backfilled', true), e.created_at
FROM public.enrollments e
LEFT JOIN public.programs pr ON pr.id = e.program_id
WHERE NOT EXISTS (SELECT 1 FROM public.activity_events x WHERE x.event_type = 'enrollment_created' AND x.entity_id = e.id);

-- Payments (both legs, cancelled invoices excluded, cash-basis date)
INSERT INTO public.activity_events (hub_id, actor_id, event_type, category, entity_type, entity_id, classroom_id, cohort_id, summary, details, created_at)
SELECT pr.hub_id, NULL, 'payment_recorded', 'finance', 'payment', p.id, NULL, NULL,
       '₦' || to_char(p.amount, 'FM999,999,999,990') || ' payment recorded for ' || COALESCE(e.full_name, 'a student')
         || COALESCE(' (' || i.invoice_number || ')', ''),
       jsonb_build_object('amount', p.amount, 'invoice_id', p.invoice_id, 'method', p.payment_method, 'backfilled', true),
       COALESCE(p.paid_at_actual, p.payment_date::timestamptz, p.created_at)
FROM public.payments p
JOIN public.invoices i ON i.id = p.invoice_id
JOIN public.enrollments e ON e.id = i.enrollment_id
LEFT JOIN public.programs pr ON pr.id = e.program_id
WHERE i.status != 'cancelled'
  AND NOT EXISTS (SELECT 1 FROM public.activity_events x WHERE x.event_type = 'payment_recorded' AND x.entity_id = p.id);

INSERT INTO public.activity_events (hub_id, actor_id, event_type, category, entity_type, entity_id, classroom_id, cohort_id, summary, details, created_at)
SELECT pr.hub_id, NULL, 'payment_recorded', 'finance', 'installment', inst.id, NULL, NULL,
       '₦' || to_char(inst.amount, 'FM999,999,999,990') || ' payment recorded for ' || COALESCE(e.full_name, 'a student')
         || COALESCE(' (' || i.invoice_number || ')', ''),
       jsonb_build_object('amount', inst.amount, 'invoice_id', inst.invoice_id, 'backfilled', true),
       COALESCE(inst.paid_at_actual, inst.paid_at)
FROM public.installments inst
JOIN public.invoices i ON i.id = inst.invoice_id
JOIN public.enrollments e ON e.id = i.enrollment_id
LEFT JOIN public.programs pr ON pr.id = e.program_id
WHERE inst.status = 'paid'
  AND COALESCE(inst.paid_at_actual, inst.paid_at) IS NOT NULL
  AND i.status != 'cancelled'
  AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.installment_id = inst.id)
  AND NOT EXISTS (SELECT 1 FROM public.activity_events x WHERE x.event_type = 'payment_recorded' AND x.entity_id = inst.id);
