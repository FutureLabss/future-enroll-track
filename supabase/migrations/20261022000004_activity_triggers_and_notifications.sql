-- Record classroom/cohort/enrollment activity into activity_events and notify the
-- users each event concerns (students of the cohort/classroom, the tutors, the
-- assignment author, the graded student...).
--
-- Every trigger body swallows its own errors (RAISE WARNING): a failure to log or
-- notify must never roll back the teacher's or admin's actual write.
-- Bulk writes (generate_cohort_schedule inserts dozens of sessions, intake adds
-- whole classes to a cohort) use statement-level triggers with transition tables
-- so they produce one event and one notification per person, not one per row.

-- ── Audience helpers ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.activity_hub_for(p_classroom_id uuid, p_cohort_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT hub_id FROM public.classrooms WHERE id = p_classroom_id),
    (SELECT co.hub_id FROM public.cohorts co WHERE co.id = p_cohort_id),
    (SELECT pr.hub_id FROM public.cohorts co JOIN public.programs pr ON pr.id = co.program_id WHERE co.id = p_cohort_id),
    public.get_my_hub_id()
  );
$$;

-- Students a classroom item is for: the cohort's active members when it targets a
-- cohort, otherwise everyone in the classroom.
CREATE OR REPLACE FUNCTION public.activity_student_audience(p_classroom_id uuid, p_cohort_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_cohort_id IS NOT NULL THEN
      ARRAY(SELECT student_id FROM public.cohort_students WHERE cohort_id = p_cohort_id AND status = 'active')
    ELSE
      ARRAY(SELECT student_id FROM public.classroom_students WHERE classroom_id = p_classroom_id)
  END;
$$;

CREATE OR REPLACE FUNCTION public.activity_staff_audience(p_classroom_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT DISTINCT user_id FROM public.classroom_staff
    WHERE classroom_id = p_classroom_id AND status = 'active' AND user_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.activity_scope_label(p_classroom_id uuid, p_cohort_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT cohort_label FROM public.cohorts WHERE id = p_cohort_id),
    (SELECT name FROM public.classrooms WHERE id = p_classroom_id),
    'classroom'
  );
$$;

CREATE OR REPLACE FUNCTION public.activity_session_label(p_schedule public.schedules)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(p_schedule.title, ''),
    (SELECT title FROM public.lessons WHERE id = p_schedule.lesson_id),
    'Class'
  );
$$;

REVOKE ALL ON FUNCTION public.activity_hub_for(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_student_audience(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_staff_audience(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_scope_label(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_session_label(public.schedules) FROM PUBLIC, anon, authenticated;

-- ── Cohorts ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_activity_cohorts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub       uuid;
  _staff     uuid[];
  _tutor     uuid[];
  _tutor_nm  text;
  _link      text;
  _scheduled boolean;
BEGIN
  BEGIN
    _hub   := public.activity_hub_for(NEW.classroom_id, NEW.id);
    _staff := public.activity_staff_audience(NEW.classroom_id);
    _tutor := CASE WHEN NEW.primary_tutor_id IS NOT NULL THEN public.staff_user_ids(NEW.primary_tutor_id) ELSE '{}'::uuid[] END;
    SELECT full_name INTO _tutor_nm FROM public.staff WHERE id = NEW.primary_tutor_id;
    _link  := CASE WHEN NEW.classroom_id IS NOT NULL
                   THEN '/staff/classrooms/' || NEW.classroom_id || '?tab=cohorts&setupSchedule=' || NEW.id
              END;
    _scheduled := EXISTS (
      SELECT 1 FROM public.schedules s
      WHERE s.cohort_id = NEW.id AND s.status = 'scheduled' AND s.scheduled_date >= current_date
    );

    IF TG_OP = 'INSERT' THEN
      PERFORM public.record_activity(_hub, 'cohort_created', 'cohort', 'cohort', NEW.id, NEW.classroom_id, NEW.id,
        'Cohort "' || NEW.cohort_label || '" created' || COALESCE(' with ' || _tutor_nm || ' as primary tutor', ' without a primary tutor'),
        jsonb_build_object('start_date', NEW.start_date, 'end_date', NEW.end_date, 'status', NEW.status,
                           'primary_tutor_id', NEW.primary_tutor_id));

      IF cardinality(_tutor) > 0 THEN
        PERFORM public.notify_users(_tutor, 'cohort_schedule_setup',
          'You''re the primary tutor for ' || NEW.cohort_label,
          'You were made primary tutor of the new cohort "' || NEW.cohort_label || '". Every running cohort needs a class schedule, so set up its sessions now.',
          _link, _hub, NEW.id);
      ELSE
        PERFORM public.notify_users(_staff, 'cohort_schedule_setup',
          'Set up the schedule for ' || NEW.cohort_label,
          'A new cohort "' || NEW.cohort_label || '" was created in your classroom. Every running cohort needs a class schedule, so add its sessions now.',
          _link, _hub, NEW.id);
      END IF;
      RETURN NULL;
    END IF;

    IF NEW.primary_tutor_id IS DISTINCT FROM OLD.primary_tutor_id THEN
      PERFORM public.record_activity(_hub, 'tutor_assigned', 'cohort', 'cohort', NEW.id, NEW.classroom_id, NEW.id,
        COALESCE(_tutor_nm || ' is now primary tutor of "' || NEW.cohort_label || '"',
                 'Cohort "' || NEW.cohort_label || '" has no primary tutor'),
        jsonb_build_object('from', OLD.primary_tutor_id, 'to', NEW.primary_tutor_id));

      PERFORM public.notify_users(_tutor, 'cohort_tutor_assigned',
        'You''re the primary tutor for ' || NEW.cohort_label,
        'You are now the primary tutor of "' || NEW.cohort_label || '".'
          || CASE WHEN _scheduled THEN ' Its schedule is in your classroom workspace and synced calendar.'
                  ELSE ' It has no upcoming classes yet, so please set up its schedule.' END,
        _link, _hub, NEW.id);
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.record_activity(_hub, 'cohort_status_changed', 'cohort', 'cohort', NEW.id, NEW.classroom_id, NEW.id,
        'Cohort "' || NEW.cohort_label || '" is now ' || NEW.status,
        jsonb_build_object('from', OLD.status, 'to', NEW.status));

      IF NEW.status = 'active' AND NOT _scheduled THEN
        PERFORM public.notify_users(_tutor || _staff, 'cohort_schedule_missing',
          NEW.cohort_label || ' is running without a schedule',
          'Cohort "' || NEW.cohort_label || '" was marked active but has no upcoming classes. Set up its schedule so students know when to attend.',
          _link, _hub, NEW.id);
      END IF;
    END IF;

    IF NEW.start_date IS DISTINCT FROM OLD.start_date OR NEW.end_date IS DISTINCT FROM OLD.end_date THEN
      PERFORM public.record_activity(_hub, 'cohort_dates_changed', 'cohort', 'cohort', NEW.id, NEW.classroom_id, NEW.id,
        'Cohort "' || NEW.cohort_label || '" dates changed',
        jsonb_build_object('start_date', NEW.start_date, 'end_date', NEW.end_date,
                           'old_start_date', OLD.start_date, 'old_end_date', OLD.end_date));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_activity_cohorts: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_cohorts ON public.cohorts;
CREATE TRIGGER trg_activity_cohorts
  AFTER INSERT OR UPDATE ON public.cohorts
  FOR EACH ROW EXECUTE FUNCTION public.trg_activity_cohorts();

-- ── Schedules (class sessions) ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_activity_schedules_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _g     record;
  _hub   uuid;
  _label text;
  _when  text;
BEGIN
  BEGIN
    FOR _g IN
      SELECT classroom_id, cohort_id, count(*) AS n, min(scheduled_date) AS first_date, max(scheduled_date) AS last_date,
             min(id::text)::uuid AS any_id
      FROM new_rows
      GROUP BY classroom_id, cohort_id
    LOOP
      _hub   := public.activity_hub_for(_g.classroom_id, _g.cohort_id);
      _label := public.activity_scope_label(_g.classroom_id, _g.cohort_id);
      _when  := CASE WHEN _g.n = 1
                     THEN 'on ' || to_char(_g.first_date, 'Dy DD Mon YYYY')
                     ELSE 'from ' || to_char(_g.first_date, 'DD Mon') || ' to ' || to_char(_g.last_date, 'DD Mon YYYY')
                END;

      PERFORM public.record_activity(_hub, 'sessions_scheduled', 'schedule', 'schedule',
        CASE WHEN _g.n = 1 THEN _g.any_id END, _g.classroom_id, _g.cohort_id,
        _g.n || ' class session' || CASE WHEN _g.n = 1 THEN '' ELSE 's' END || ' scheduled for ' || _label || ' ' || _when,
        jsonb_build_object('count', _g.n, 'first_date', _g.first_date, 'last_date', _g.last_date));

      PERFORM public.notify_users(public.activity_student_audience(_g.classroom_id, _g.cohort_id), 'schedule',
        'New class schedule: ' || _label,
        _g.n || ' class session' || CASE WHEN _g.n = 1 THEN ' was' ELSE 's were' END || ' scheduled ' || _when
          || '. Subscribe to your calendar from your profile to keep them in sync.',
        '/student/classrooms/' || _g.classroom_id, _hub, _g.cohort_id);

      PERFORM public.notify_users(public.activity_staff_audience(_g.classroom_id), 'schedule',
        'Schedule updated: ' || _label,
        _g.n || ' class session' || CASE WHEN _g.n = 1 THEN ' was' ELSE 's were' END || ' added ' || _when || '.',
        '/staff/classrooms/' || _g.classroom_id || '?tab=schedule', _hub, _g.cohort_id);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_activity_schedules_insert: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_schedules_insert ON public.schedules;
CREATE TRIGGER trg_activity_schedules_insert
  AFTER INSERT ON public.schedules
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_activity_schedules_insert();

CREATE OR REPLACE FUNCTION public.trg_activity_schedules_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub     uuid;
  _label   text;
  _scope   text;
  _when    text;
  _msg     text;
  _details jsonb;
BEGIN
  BEGIN
    _hub   := public.activity_hub_for(NEW.classroom_id, NEW.cohort_id);
    _label := public.activity_session_label(NEW);
    _scope := public.activity_scope_label(NEW.classroom_id, NEW.cohort_id);
    _when  := to_char(NEW.scheduled_date, 'Dy DD Mon YYYY') || ', ' || to_char(NEW.start_time, 'HH24:MI') || '–' || to_char(NEW.end_time, 'HH24:MI');
    _details := jsonb_build_object('scheduled_date', NEW.scheduled_date, 'start_time', NEW.start_time,
                                   'end_time', NEW.end_time, 'status', NEW.status);

    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'completed' THEN
      PERFORM public.record_activity(_hub, 'session_completed', 'schedule', 'schedule', NEW.id, NEW.classroom_id, NEW.cohort_id,
        _label || ' held for ' || _scope || ' (' || _when || ')', _details);

    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'cancelled' THEN
      PERFORM public.record_activity(_hub, 'session_cancelled', 'schedule', 'schedule', NEW.id, NEW.classroom_id, NEW.cohort_id,
        _label || ' cancelled for ' || _scope || ' (' || _when || ')', _details);

      _msg := _label || ' for ' || _scope || ' on ' || _when || ' has been cancelled.';
      PERFORM public.notify_users(public.activity_student_audience(NEW.classroom_id, NEW.cohort_id),
        'schedule_cancelled', 'Class cancelled: ' || _label, _msg,
        '/student/classrooms/' || NEW.classroom_id, _hub, NEW.id);
      PERFORM public.notify_users(public.activity_staff_audience(NEW.classroom_id),
        'schedule_cancelled', 'Class cancelled: ' || _label, _msg,
        '/staff/classrooms/' || NEW.classroom_id || '?tab=schedule', _hub, NEW.id);

    ELSIF NEW.status = 'scheduled' AND (
         NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
      OR NEW.start_time     IS DISTINCT FROM OLD.start_time
      OR NEW.end_time       IS DISTINCT FROM OLD.end_time
      OR NEW.location       IS DISTINCT FROM OLD.location
      OR NEW.meeting_link   IS DISTINCT FROM OLD.meeting_link
    ) THEN
      PERFORM public.record_activity(_hub, 'session_rescheduled', 'schedule', 'schedule', NEW.id, NEW.classroom_id, NEW.cohort_id,
        _label || ' for ' || _scope || ' changed to ' || _when,
        _details || jsonb_build_object('old_scheduled_date', OLD.scheduled_date, 'old_start_time', OLD.start_time));

      _msg := _label || ' for ' || _scope || ' is now ' || _when
          || COALESCE(' · ' || NULLIF(NEW.location, ''), '') || '. Your subscribed calendar updates automatically.';
      PERFORM public.notify_users(public.activity_student_audience(NEW.classroom_id, NEW.cohort_id),
        'schedule_changed', 'Class updated: ' || _label, _msg,
        '/student/classrooms/' || NEW.classroom_id, _hub, NEW.id);
      PERFORM public.notify_users(public.activity_staff_audience(NEW.classroom_id),
        'schedule_changed', 'Class updated: ' || _label, _msg,
        '/staff/classrooms/' || NEW.classroom_id || '?tab=schedule', _hub, NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_activity_schedules_update: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_schedules_update ON public.schedules;
CREATE TRIGGER trg_activity_schedules_update
  AFTER UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.trg_activity_schedules_update();

CREATE OR REPLACE FUNCTION public.trg_activity_schedules_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _g     record;
  _hub   uuid;
  _label text;
BEGIN
  BEGIN
    FOR _g IN
      SELECT o.classroom_id, o.cohort_id, count(*) AS n,
             count(*) FILTER (WHERE o.status = 'scheduled' AND o.scheduled_date >= current_date) AS upcoming
      FROM old_rows o
      -- Cascades from a deleted classroom/cohort are not "sessions removed".
      WHERE EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = o.classroom_id)
        AND (o.cohort_id IS NULL OR EXISTS (SELECT 1 FROM public.cohorts c WHERE c.id = o.cohort_id))
      GROUP BY o.classroom_id, o.cohort_id
    LOOP
      _hub   := public.activity_hub_for(_g.classroom_id, _g.cohort_id);
      _label := public.activity_scope_label(_g.classroom_id, _g.cohort_id);

      PERFORM public.record_activity(_hub, 'sessions_removed', 'schedule', 'schedule', NULL, _g.classroom_id, _g.cohort_id,
        _g.n || ' class session' || CASE WHEN _g.n = 1 THEN '' ELSE 's' END || ' removed from ' || _label,
        jsonb_build_object('count', _g.n, 'upcoming', _g.upcoming));

      IF _g.upcoming > 0 THEN
        PERFORM public.notify_users(public.activity_student_audience(_g.classroom_id, _g.cohort_id), 'schedule_changed',
          'Schedule changed: ' || _label,
          _g.upcoming || ' upcoming class session' || CASE WHEN _g.upcoming = 1 THEN ' was' ELSE 's were' END
            || ' removed from the ' || _label || ' schedule.',
          '/student/classrooms/' || _g.classroom_id, _hub, _g.cohort_id);
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_activity_schedules_delete: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_schedules_delete ON public.schedules;
CREATE TRIGGER trg_activity_schedules_delete
  AFTER DELETE ON public.schedules
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_activity_schedules_delete();

-- ── Attendance ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_activity_attendance_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub     uuid;
  _scope   text;
  _present int;
  _late    int;
BEGIN
  BEGIN
    _hub   := public.activity_hub_for(NEW.classroom_id, NEW.cohort_id);
    _scope := public.activity_scope_label(NEW.classroom_id, NEW.cohort_id);

    IF TG_OP = 'INSERT' THEN
      PERFORM public.record_activity(_hub, 'attendance_opened', 'attendance', 'attendance_session', NEW.id, NEW.classroom_id, NEW.cohort_id,
        'Attendance opened for ' || _scope,
        jsonb_build_object('duration_mins', NEW.duration_mins));
    ELSIF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
      SELECT count(*) FILTER (WHERE attendance_status = 'present'),
             count(*) FILTER (WHERE attendance_status = 'late')
        INTO _present, _late
      FROM public.attendance_records WHERE session_id = NEW.id;

      PERFORM public.record_activity(_hub, 'attendance_closed', 'attendance', 'attendance_session', NEW.id, NEW.classroom_id, NEW.cohort_id,
        'Attendance closed for ' || _scope || ': ' || _present || ' present, ' || _late || ' late',
        jsonb_build_object('present', _present, 'late', _late));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_activity_attendance_sessions: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_attendance_sessions ON public.attendance_sessions;
CREATE TRIGGER trg_activity_attendance_sessions
  AFTER INSERT OR UPDATE OF status ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.trg_activity_attendance_sessions();

-- ── Assignments & submissions ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_activity_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub   uuid;
  _scope text;
BEGIN
  BEGIN
    IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
      _hub   := public.activity_hub_for(NEW.classroom_id, NEW.cohort_id);
      _scope := public.activity_scope_label(NEW.classroom_id, NEW.cohort_id);

      PERFORM public.record_activity(_hub, 'assignment_published', 'assignment', 'assignment', NEW.id, NEW.classroom_id, NEW.cohort_id,
        'Assignment "' || NEW.title || '" published for ' || _scope,
        jsonb_build_object('due_date', NEW.due_date));

      PERFORM public.notify_users(public.activity_student_audience(NEW.classroom_id, NEW.cohort_id), 'assignment',
        'New assignment: ' || NEW.title,
        CASE WHEN NEW.due_date IS NOT NULL
             THEN 'Due ' || to_char(NEW.due_date AT TIME ZONE 'Africa/Lagos', 'Dy DD Mon YYYY, HH24:MI') || '.'
             ELSE 'A new assignment was posted in ' || _scope || '.'
        END,
        '/student/classrooms/' || NEW.classroom_id, _hub, NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_activity_assignments: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_assignments ON public.assignments;
CREATE TRIGGER trg_activity_assignments
  AFTER INSERT OR UPDATE OF status ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.trg_activity_assignments();

CREATE OR REPLACE FUNCTION public.trg_activity_assignment_submissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _a       public.assignments%ROWTYPE;
  _hub     uuid;
  _student text;
BEGIN
  BEGIN
    SELECT * INTO _a FROM public.assignments WHERE id = NEW.assignment_id;
    IF _a.id IS NULL THEN
      RETURN NULL;
    END IF;
    _hub := public.activity_hub_for(_a.classroom_id, _a.cohort_id);
    SELECT COALESCE(full_name, email, 'A student') INTO _student FROM public.profiles WHERE user_id = NEW.student_id;
    _student := COALESCE(_student, 'A student');

    IF TG_OP = 'INSERT' THEN
      PERFORM public.record_activity(_hub, 'assignment_submitted', 'assignment', 'assignment_submission', NEW.id, _a.classroom_id, _a.cohort_id,
        _student || ' submitted "' || _a.title || '"' || CASE WHEN NEW.status = 'late' THEN ' (late)' ELSE '' END,
        jsonb_build_object('assignment_id', _a.id, 'status', NEW.status));

      PERFORM public.notify_users(ARRAY[_a.created_by], 'assignment_submission',
        'New submission: ' || _a.title,
        _student || ' submitted "' || _a.title || '"' || CASE WHEN NEW.status = 'late' THEN ' after the due date.' ELSE '.' END,
        CASE WHEN public.has_role(_a.created_by, 'admin'::app_role)
             THEN '/admin/assignments/' || _a.id
             ELSE '/staff/assignments/' || _a.id
        END,
        _hub, NEW.id);

    ELSIF NEW.status = 'graded' AND OLD.status IS DISTINCT FROM 'graded' THEN
      PERFORM public.record_activity(_hub, 'assignment_graded', 'assignment', 'assignment_submission', NEW.id, _a.classroom_id, _a.cohort_id,
        _student || '''s "' || _a.title || '" graded' || COALESCE(': ' || NEW.grade, ''),
        jsonb_build_object('assignment_id', _a.id, 'grade', NEW.grade));

      PERFORM public.notify_users(ARRAY[NEW.student_id], 'assignment_graded',
        'Graded: ' || _a.title,
        'Your submission for "' || _a.title || '" was graded' || COALESCE(' (' || NEW.grade || ')', '') || '.',
        '/student/classrooms/' || _a.classroom_id, _hub, NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_activity_assignment_submissions: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_assignment_submissions ON public.assignment_submissions;
CREATE TRIGGER trg_activity_assignment_submissions
  AFTER INSERT OR UPDATE OF status ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_activity_assignment_submissions();

-- ── Cohort membership ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_activity_cohort_students()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _g   record;
  _hub uuid;
BEGIN
  BEGIN
    FOR _g IN
      SELECT n.cohort_id, co.cohort_label, co.classroom_id, count(*) AS cnt, array_agg(n.student_id) AS students
      FROM new_rows n
      JOIN public.cohorts co ON co.id = n.cohort_id
      GROUP BY n.cohort_id, co.cohort_label, co.classroom_id
    LOOP
      _hub := public.activity_hub_for(_g.classroom_id, _g.cohort_id);

      PERFORM public.record_activity(_hub, 'students_joined_cohort', 'cohort', 'cohort', _g.cohort_id, _g.classroom_id, _g.cohort_id,
        _g.cnt || ' student' || CASE WHEN _g.cnt = 1 THEN '' ELSE 's' END || ' added to ' || _g.cohort_label,
        jsonb_build_object('count', _g.cnt));

      PERFORM public.notify_users(_g.students, 'cohort_joined',
        'You''ve joined ' || _g.cohort_label,
        'You were added to the "' || _g.cohort_label || '" cohort. Your class schedule is in My Classrooms, and you can sync it to your calendar from your profile.',
        CASE WHEN _g.classroom_id IS NOT NULL THEN '/student/classrooms/' || _g.classroom_id ELSE '/student/classrooms' END,
        _hub, _g.cohort_id);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_activity_cohort_students: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_cohort_students ON public.cohort_students;
CREATE TRIGGER trg_activity_cohort_students
  AFTER INSERT ON public.cohort_students
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_activity_cohort_students();

-- ── Classroom staff ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_activity_classroom_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub       uuid;
  _classroom text;
  _name      text;
BEGIN
  BEGIN
    _hub := public.activity_hub_for(NEW.classroom_id, NULL);
    SELECT name INTO _classroom FROM public.classrooms WHERE id = NEW.classroom_id;
    SELECT full_name INTO _name FROM public.staff WHERE id = NEW.staff_id;

    PERFORM public.record_activity(_hub, 'staff_assigned', 'staff', 'classroom_staff', NEW.id, NEW.classroom_id, NULL,
      COALESCE(_name, 'A staff member') || ' assigned to ' || COALESCE(_classroom, 'a classroom'),
      jsonb_build_object('staff_type', NEW.staff_type));

    PERFORM public.notify_users(ARRAY[NEW.user_id], 'classroom_assigned',
      'You''ve been added to ' || COALESCE(_classroom, 'a classroom'),
      'You now have access to ' || COALESCE(_classroom, 'this classroom') || '. Check its cohorts and make sure each running cohort has a schedule.',
      '/staff/classrooms/' || NEW.classroom_id, _hub, NEW.classroom_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_activity_classroom_staff: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_classroom_staff ON public.classroom_staff;
CREATE TRIGGER trg_activity_classroom_staff
  AFTER INSERT ON public.classroom_staff
  FOR EACH ROW EXECUTE FUNCTION public.trg_activity_classroom_staff();

-- ── Cohort announcements ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_activity_cohort_announcements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _co  public.cohorts%ROWTYPE;
  _hub uuid;
BEGIN
  BEGIN
    SELECT * INTO _co FROM public.cohorts WHERE id = NEW.cohort_id;
    _hub := public.activity_hub_for(_co.classroom_id, NEW.cohort_id);

    PERFORM public.record_activity(_hub, 'announcement_posted', 'cohort', 'cohort_announcement', NEW.id, _co.classroom_id, NEW.cohort_id,
      'Announcement in ' || COALESCE(_co.cohort_label, 'cohort') || ': ' || NEW.title, '{}'::jsonb);

    PERFORM public.notify_users(public.activity_student_audience(_co.classroom_id, NEW.cohort_id), 'announcement',
      NEW.title, left(NEW.body, 280),
      CASE WHEN _co.classroom_id IS NOT NULL THEN '/student/classrooms/' || _co.classroom_id END,
      _hub, NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_activity_cohort_announcements: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_cohort_announcements ON public.cohort_announcements;
CREATE TRIGGER trg_activity_cohort_announcements
  AFTER INSERT ON public.cohort_announcements
  FOR EACH ROW EXECUTE FUNCTION public.trg_activity_cohort_announcements();

-- ── Enrollments & payments (report only; existing flows already notify) ────

CREATE OR REPLACE FUNCTION public.trg_activity_enrollments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub     uuid;
  _program text;
BEGIN
  BEGIN
    SELECT hub_id, program_name INTO _hub, _program FROM public.programs WHERE id = NEW.program_id;
    PERFORM public.record_activity(_hub, 'enrollment_created', 'enrollment', 'enrollment', NEW.id, NULL, NEW.cohort_id,
      NEW.full_name || ' enrolled in ' || COALESCE(_program, 'a program'),
      jsonb_build_object('program_id', NEW.program_id, 'status', NEW.enrollment_status));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_activity_enrollments: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_enrollments ON public.enrollments;
CREATE TRIGGER trg_activity_enrollments
  AFTER INSERT ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.trg_activity_enrollments();

CREATE OR REPLACE FUNCTION public.trg_activity_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub  uuid;
  _name text;
  _inv  text;
BEGIN
  BEGIN
    SELECT pr.hub_id, e.full_name, i.invoice_number INTO _hub, _name, _inv
    FROM public.invoices i
    JOIN public.enrollments e ON e.id = i.enrollment_id
    LEFT JOIN public.programs pr ON pr.id = e.program_id
    WHERE i.id = NEW.invoice_id;

    PERFORM public.record_activity(_hub, 'payment_recorded', 'finance', 'payment', NEW.id, NULL, NULL,
      '₦' || to_char(NEW.amount, 'FM999,999,999,990') || ' payment recorded for ' || COALESCE(_name, 'a student')
        || COALESCE(' (' || _inv || ')', ''),
      jsonb_build_object('amount', NEW.amount, 'invoice_id', NEW.invoice_id, 'method', NEW.payment_method));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_activity_payments: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_payments ON public.payments;
CREATE TRIGGER trg_activity_payments
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_activity_payments();

REVOKE ALL ON FUNCTION
  public.trg_activity_cohorts(),
  public.trg_activity_schedules_insert(),
  public.trg_activity_schedules_update(),
  public.trg_activity_schedules_delete(),
  public.trg_activity_attendance_sessions(),
  public.trg_activity_assignments(),
  public.trg_activity_assignment_submissions(),
  public.trg_activity_cohort_students(),
  public.trg_activity_classroom_staff(),
  public.trg_activity_cohort_announcements(),
  public.trg_activity_enrollments(),
  public.trg_activity_payments()
FROM PUBLIC, anon, authenticated;
