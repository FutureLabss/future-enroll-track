-- Two standing rules for cohorts:
--   1. every open cohort (not completed/archived) has a primary tutor;
--   2. every running cohort has a schedule, i.e. at least one upcoming
--      'scheduled' session. "Running" = marked active, or not completed/archived
--      with today inside its start..end dates.
-- Creation flows enforce both up front (UI + trg_activity_cohorts). This is the
-- standing check behind the in-app warnings and the daily nudge for what slips through.

CREATE OR REPLACE FUNCTION public._cohort_setup_gaps()
RETURNS TABLE (
  cohort_id          uuid,
  cohort_label       text,
  classroom_id       uuid,
  classroom_name     text,
  program_id         uuid,
  hub_id             uuid,
  status             text,
  start_date         date,
  end_date           date,
  primary_tutor_id   uuid,
  primary_tutor_name text,
  past_sessions      bigint,
  needs_schedule     boolean,
  needs_tutor        boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH open_cohorts AS (
    SELECT co.*,
           (co.status = 'active'
            OR (co.start_date IS NOT NULL AND co.start_date <= current_date
                AND (co.end_date IS NULL OR co.end_date >= current_date))) AS running,
           EXISTS (
             SELECT 1 FROM public.schedules s
             WHERE s.cohort_id = co.id AND s.status = 'scheduled' AND s.scheduled_date >= current_date
           ) AS has_upcoming
    FROM public.cohorts co
    WHERE co.status NOT IN ('completed', 'archived')
  )
  SELECT oc.id, oc.cohort_label, oc.classroom_id, cl.name, oc.program_id,
         COALESCE(cl.hub_id, oc.hub_id), oc.status, oc.start_date, oc.end_date,
         oc.primary_tutor_id, st.full_name,
         (SELECT count(*) FROM public.schedules s WHERE s.cohort_id = oc.id AND s.scheduled_date < current_date),
         oc.running AND NOT oc.has_upcoming,
         oc.primary_tutor_id IS NULL
  FROM open_cohorts oc
  LEFT JOIN public.classrooms cl ON cl.id = oc.classroom_id
  LEFT JOIN public.staff st      ON st.id = oc.primary_tutor_id
  WHERE (oc.running AND NOT oc.has_upcoming) OR oc.primary_tutor_id IS NULL;
$$;

REVOKE ALL ON FUNCTION public._cohort_setup_gaps() FROM PUBLIC, anon, authenticated;

-- Superadmin: every hub. Admin: their hub. Staff: classrooms they work in, plus
-- cohorts they are primary tutor of.
CREATE OR REPLACE FUNCTION public.list_cohort_setup_gaps(p_classroom_id uuid DEFAULT NULL)
RETURNS TABLE (
  cohort_id          uuid,
  cohort_label       text,
  classroom_id       uuid,
  classroom_name     text,
  program_id         uuid,
  hub_id             uuid,
  status             text,
  start_date         date,
  end_date           date,
  primary_tutor_id   uuid,
  primary_tutor_name text,
  past_sessions      bigint,
  needs_schedule     boolean,
  needs_tutor        boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.*
  FROM public._cohort_setup_gaps() g
  WHERE (p_classroom_id IS NULL OR g.classroom_id = p_classroom_id)
    AND (
      public.is_superadmin()
      OR (public.has_role(auth.uid(), 'admin'::app_role) AND g.hub_id = public.get_my_hub_id())
      OR EXISTS (
        SELECT 1 FROM public.classroom_staff cs
        WHERE cs.classroom_id = g.classroom_id AND cs.user_id = auth.uid() AND cs.status = 'active'
      )
      OR (g.primary_tutor_id IS NOT NULL AND auth.uid() = ANY (public.staff_user_ids(g.primary_tutor_id)))
    )
  ORDER BY g.needs_schedule DESC, g.start_date NULLS LAST, g.cohort_label;
$$;

GRANT EXECUTE ON FUNCTION public.list_cohort_setup_gaps(uuid) TO authenticated;

-- Daily. Missing schedule: the primary tutor and the classroom's staff (or the
-- hub's admins when nobody is linked). Missing tutor: the hub's admins, who
-- assign tutors. At most one reminder per person per cohort per kind every 3 days.
CREATE OR REPLACE FUNCTION public.remind_cohort_setup_gaps()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _c          record;
  _admins     uuid[];
  _recipients uuid[];
  _link       text;
  _total      integer := 0;
BEGIN
  FOR _c IN SELECT * FROM public._cohort_setup_gaps() LOOP
    _admins := ARRAY(
      SELECT hm.user_id FROM public.hub_members hm
      JOIN public.user_roles ur ON ur.user_id = hm.user_id AND ur.role = 'admin'::app_role
      WHERE hm.hub_id = _c.hub_id
    );

    IF _c.needs_schedule THEN
      _recipients := public.activity_staff_audience(_c.classroom_id);
      IF _c.primary_tutor_id IS NOT NULL THEN
        _recipients := public.staff_user_ids(_c.primary_tutor_id) || _recipients;
      END IF;
      _link := '/staff/classrooms/' || _c.classroom_id || '?tab=cohorts&setupSchedule=' || _c.cohort_id;
      IF _c.classroom_id IS NULL OR cardinality(_recipients) = 0 THEN
        _recipients := _admins;
        _link := '/admin/cohorts/' || _c.cohort_id;
      END IF;

      _recipients := ARRAY(
        SELECT u FROM unnest(_recipients) AS u
        WHERE NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = u AND n.type = 'cohort_schedule_missing' AND n.entity_id = _c.cohort_id
            AND n.created_at > now() - interval '3 days'
        )
      );

      _total := _total + public.notify_users(_recipients, 'cohort_schedule_missing',
        _c.cohort_label || ' has no upcoming classes',
        'Cohort "' || _c.cohort_label || '"' || COALESCE(' in ' || _c.classroom_name, '')
          || ' is running but has no upcoming sessions on its schedule. Every running cohort needs a schedule. Please add one.',
        _link, _c.hub_id, _c.cohort_id);
    END IF;

    IF _c.needs_tutor THEN
      _recipients := ARRAY(
        SELECT u FROM unnest(_admins) AS u
        WHERE NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = u AND n.type = 'cohort_tutor_missing' AND n.entity_id = _c.cohort_id
            AND n.created_at > now() - interval '3 days'
        )
      );

      _total := _total + public.notify_users(_recipients, 'cohort_tutor_missing',
        _c.cohort_label || ' has no primary tutor',
        'Cohort "' || _c.cohort_label || '"' || COALESCE(' in ' || _c.classroom_name, '')
          || ' has no primary tutor. Every cohort needs one. Assign a tutor from the Cohorts page.',
        '/admin/cohorts', _c.hub_id, _c.cohort_id);
    END IF;
  END LOOP;

  RETURN _total;
END;
$$;

REVOKE ALL ON FUNCTION public.remind_cohort_setup_gaps() FROM PUBLIC, anon, authenticated;

-- 07:15 UTC = 08:15 WAT, after the 06:00 superadmin brief and 07:00 due reminders.
SELECT cron.unschedule('remind-cohort-setup-gaps')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'remind-cohort-setup-gaps');

SELECT cron.schedule(
  'remind-cohort-setup-gaps',
  '15 7 * * *',
  $$SELECT public.remind_cohort_setup_gaps();$$
);
