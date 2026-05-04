
CREATE TABLE public.enrollment_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_month date NOT NULL UNIQUE,
  target_count integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.enrollment_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage enrollment targets"
ON public.enrollment_targets
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_enrollment_targets_updated_at
BEFORE UPDATE ON public.enrollment_targets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Normalize target_month to first of month
CREATE OR REPLACE FUNCTION public.normalize_target_month()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.target_month := date_trunc('month', NEW.target_month)::date;
  RETURN NEW;
END;
$$;

CREATE TRIGGER normalize_enrollment_target_month
BEFORE INSERT OR UPDATE ON public.enrollment_targets
FOR EACH ROW EXECUTE FUNCTION public.normalize_target_month();

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
    SELECT date_trunc('month', e.created_at)::date AS m, COUNT(*)::int AS c
    FROM public.enrollments e
    GROUP BY 1
  ),
  tgt AS (
    SELECT target_month AS m, target_count AS c
    FROM public.enrollment_targets
  )
  SELECT
    months.m,
    COALESCE(tgt.c, 0)::int,
    COALESCE(actual.c, 0)::int,
    (COALESCE(actual.c,0) - COALESCE(tgt.c,0))::int,
    CASE WHEN COALESCE(tgt.c,0) > 0
         THEN ROUND((COALESCE(actual.c,0)::numeric / tgt.c::numeric) * 100, 1)
         ELSE NULL END
  FROM months
  LEFT JOIN actual ON actual.m = months.m
  LEFT JOIN tgt ON tgt.m = months.m
  ORDER BY months.m DESC;
END;
$$;
