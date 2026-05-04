
CREATE OR REPLACE FUNCTION public.get_enrollment_performance(
  p_months integer DEFAULT 12,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE(
  month date,
  target_count integer,
  actual_count integer,
  variance integer,
  achievement_pct numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _start date;
  _end date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can view enrollment performance';
  END IF;

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    _start := date_trunc('month', p_start_date)::date;
    _end := date_trunc('month', p_end_date)::date;
  ELSE
    _end := date_trunc('month', CURRENT_DATE)::date;
    _start := (date_trunc('month', CURRENT_DATE) - ((GREATEST(p_months,1)-1) || ' months')::interval)::date;
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(_start, _end, '1 month'::interval)::date AS m
  ),
  actual AS (
    SELECT date_trunc('month', e.created_at)::date AS m, COUNT(*)::int AS cnt
    FROM public.enrollments e
    GROUP BY 1
  ),
  tgt AS (
    SELECT t.target_month AS m, t.target_count AS cnt
    FROM public.enrollment_targets t
  )
  SELECT
    months.m AS month,
    COALESCE(tgt.cnt, 0)::int AS target_count,
    COALESCE(actual.cnt, 0)::int AS actual_count,
    (COALESCE(actual.cnt,0) - COALESCE(tgt.cnt,0))::int AS variance,
    CASE WHEN COALESCE(tgt.cnt,0) > 0
         THEN ROUND((COALESCE(actual.cnt,0)::numeric / tgt.cnt::numeric) * 100, 1)
         ELSE NULL END AS achievement_pct
  FROM months
  LEFT JOIN actual ON actual.m = months.m
  LEFT JOIN tgt ON tgt.m = months.m
  ORDER BY months.m DESC;
END;
$$;
