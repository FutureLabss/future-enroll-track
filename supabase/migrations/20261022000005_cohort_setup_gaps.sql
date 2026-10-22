-- Two standing rules for cohorts, applied to existing and past cohorts too:
--   1. every cohort that isn't archived has a primary tutor, including completed
--      ones, so the record shows who taught it;
--   2. every running cohort has a schedule, i.e. at least one upcoming
--      'scheduled' session. "Running" = marked active, or not completed/archived
--      with today inside its start..end dates. A cohort still marked active after
--      its end date counts as running, and its reminder says to add sessions or mark it completed.
-- Creation flows enforce both up front (UI + trg_activity_cohorts). This is the
-- standing check behind the in-app warnings and the daily nudge. The first run
-- happens when this migration is applied, so existing cohorts are prompted at once.

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
  needs_tutor        boolean,
  ended              boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH open_cohorts AS (
    SELECT co.*,
           (co.status <> 'completed' AND (
              co.status = 'active'
              OR (co.start_date IS NOT NULL AND co.start_date <= current_date
                  AND (co.end_date IS NULL OR co.end_date >= current_date)))) AS running,
           EXISTS (
             SELECT 1 FROM public.schedules s
             WHERE s.cohort_id = co.id AND s.status = 'scheduled' AND s.scheduled_date >= current_date
           ) AS has_upcoming
    FROM public.cohorts co
    WHERE co.status <> 'archived'
  )
  SELECT oc.id, oc.cohort_label, oc.classroom_id, cl.name, oc.program_id,
         COALESCE(cl.hub_id, oc.hub_id), oc.status, oc.start_date, oc.end_date,
         oc.primary_tutor_id, st.full_name,
         (SELECT count(*) FROM public.schedules s WHERE s.cohort_id = oc.id AND s.scheduled_date < current_date),
         oc.running AND NOT oc.has_upcoming,
         oc.primary_tutor_id IS NULL,
         COALESCE(oc.end_date < current_date, false)
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
  needs_tutor        boolean,
  ended              boolean
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

-- Daily. Missing schedule: whoever may set it (primary tutor, else teaching
-- staff, else training managers), one reminder per person per cohort every 3 days. Missing tutor: the hub's admins, who assign tutors, batched into one
-- reminder per admin per hub every 3 days, because past cohorts can add up to dozens.
CREATE OR REPLACE FUNCTION public.remind_cohort_setup_gaps()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _c          record;
  _h          record;
  _recipients uuid[];
  _link       text;
  _total      integer := 0;
BEGIN
  FOR _c IN SELECT * FROM public._cohort_setup_gaps() WHERE needs_schedule LOOP
    -- Only people who may set the schedule (20261022000007): the primary tutor,
    -- else the classroom's teaching staff, else the hub's training managers.
    IF _c.primary_tutor_id IS NOT NULL THEN
      _recipients := public.staff_user_ids(_c.primary_tutor_id);
    ELSE
      _recipients := ARRAY(
        SELECT cs.user_id FROM public.classroom_staff cs
        WHERE cs.classroom_id = _c.classroom_id AND cs.status = 'active'
          AND cs.staff_type = 'teaching' AND cs.user_id IS NOT NULL
      );
    END IF;
    _link := '/staff/classrooms/' || _c.classroom_id || '?tab=cohorts&setupSchedule=' || _c.cohort_id;
    IF _c.classroom_id IS NULL OR cardinality(_recipients) = 0 THEN
      _recipients := ARRAY(
        SELECT hm.user_id FROM public.hub_members hm
        WHERE hm.hub_id = _c.hub_id AND hm.hub_role = 'manager'
      );
      _link := CASE WHEN _c.classroom_id IS NOT NULL THEN '/admin/classrooms/' || _c.classroom_id ELSE '/admin/cohorts/' || _c.cohort_id END;
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
      _c.cohort_label || CASE WHEN _c.ended THEN ' ended but is still marked active' ELSE ' has no upcoming classes' END,
      CASE WHEN _c.ended
        THEN 'Cohort "' || _c.cohort_label || '"' || COALESCE(' in ' || _c.classroom_name, '')
          || ' ended on ' || to_char(_c.end_date, 'DD Mon YYYY')
          || ' but is still marked active with no upcoming classes. Mark it completed, or extend it and add its sessions.'
        ELSE 'Cohort "' || _c.cohort_label || '"' || COALESCE(' in ' || _c.classroom_name, '')
          || ' is running but has no upcoming sessions on its schedule. Every running cohort needs a schedule. Please add one.'
      END,
      _link, _c.hub_id, _c.cohort_id);
  END LOOP;

  FOR _h IN
    SELECT g.hub_id, count(*) AS n,
           string_agg(g.cohort_label, ', ' ORDER BY g.start_date DESC NULLS LAST) AS labels
    FROM public._cohort_setup_gaps() g
    WHERE g.needs_tutor AND g.hub_id IS NOT NULL
    GROUP BY g.hub_id
  LOOP
    _recipients := ARRAY(
      SELECT hm.user_id FROM public.hub_members hm
      JOIN public.user_roles ur ON ur.user_id = hm.user_id AND ur.role = 'admin'::app_role
      WHERE hm.hub_id = _h.hub_id
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = hm.user_id AND n.type = 'cohort_tutor_missing' AND n.entity_id = _h.hub_id
            AND n.created_at > now() - interval '3 days'
        )
    );

    _total := _total + public.notify_users(_recipients, 'cohort_tutor_missing',
      CASE WHEN _h.n = 1 THEN '1 cohort has no primary tutor' ELSE _h.n || ' cohorts have no primary tutor' END,
      'Every cohort needs a primary tutor, including past ones. Missing: ' || left(_h.labels, 400)
        || CASE WHEN length(_h.labels) > 400 THEN '…' ELSE '' END || '. Assign them from the Cohorts page.',
      '/admin/cohorts', _h.hub_id, _h.hub_id);
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

-- Prompt for existing and past cohorts now instead of waiting for tomorrow's run.
SELECT public.remind_cohort_setup_gaps();
