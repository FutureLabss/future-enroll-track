-- Eliminate 4-5 client-side round trips in enrichSchedules by joining
-- schedules → lessons → units, modules, cohorts, profiles server-side.
CREATE OR REPLACE FUNCTION public.get_classroom_schedules(p_classroom_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',             s.id,
        'classroom_id',   s.classroom_id,
        'cohort_id',      s.cohort_id,
        'lesson_id',      s.lesson_id,
        'module_id',      s.module_id,
        'unit_id',        s.unit_id,
        'instructor_id',  s.instructor_id,
        'title',          s.title,
        'scheduled_date', s.scheduled_date,
        'start_time',     s.start_time,
        'end_time',       s.end_time,
        'location',       s.location,
        'meeting_link',   s.meeting_link,
        'status',         s.status,
        'created_at',     s.created_at,
        'lessons',
          CASE WHEN l.id IS NOT NULL THEN
            jsonb_build_object(
              'title', l.title,
              'units', CASE WHEN u.id IS NOT NULL
                THEN jsonb_build_object('title', u.title)
                ELSE NULL END
            )
          ELSE NULL END,
        'modules',
          CASE WHEN m.id IS NOT NULL
            THEN jsonb_build_object('title', m.title)
            ELSE NULL END,
        'cohorts',
          CASE WHEN c.id IS NOT NULL
            THEN jsonb_build_object('cohort_label', c.cohort_label)
            ELSE NULL END,
        'staff',
          CASE WHEN prof.user_id IS NOT NULL
            THEN jsonb_build_object('full_name', prof.full_name)
            ELSE NULL END
      )
      ORDER BY s.scheduled_date ASC, s.start_time ASC
    ),
    '[]'::jsonb
  )
  FROM   public.schedules  s
  LEFT JOIN public.lessons  l    ON l.id        = s.lesson_id
  LEFT JOIN public.units    u    ON u.id         = l.unit_id
  LEFT JOIN public.modules  m    ON m.id         = s.module_id
  LEFT JOIN public.cohorts  c    ON c.id         = s.cohort_id
  LEFT JOIN public.profiles prof ON prof.user_id  = s.instructor_id
  WHERE  s.classroom_id = p_classroom_id
$$;

GRANT EXECUTE ON FUNCTION public.get_classroom_schedules(uuid) TO authenticated;
