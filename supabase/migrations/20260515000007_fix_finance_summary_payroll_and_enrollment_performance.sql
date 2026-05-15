-- ── 1. get_finance_summary: use paid_at for payroll (cash-flow date, not work month) ──
-- Salaries for March marked paid in April should appear in April's expenses.
CREATE OR REPLACE FUNCTION public.get_finance_summary(
  p_months integer DEFAULT 12,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE(month date, revenue numeric, other_income_total numeric, payroll_total numeric, expenses_total numeric, profit numeric)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _start date;
  _end   date;
  _hub   uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only admins can view finance summary';
  END IF;

  _hub := public.get_my_hub_id();

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    _start := date_trunc('month', p_start_date)::date;
    _end   := date_trunc('month', p_end_date)::date;
  ELSE
    _end   := date_trunc('month', CURRENT_DATE)::date;
    _start := (date_trunc('month', CURRENT_DATE) - ((GREATEST(p_months, 1) - 1) || ' months')::interval)::date;
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(_start, _end, '1 month'::interval)::date AS m
  ),
  rev AS (
    SELECT date_trunc('month', paid_at)::date AS m,
           SUM(amount)                        AS total
    FROM (
      SELECT p.created_at AS paid_at, p.amount
      FROM public.payments   p
      JOIN public.invoices   i  ON i.id  = p.invoice_id
      JOIN public.enrollments e ON e.id  = i.enrollment_id
      JOIN public.programs   pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
      UNION ALL
      SELECT inst.due_date::timestamptz AS paid_at, inst.amount
      FROM public.installments inst
      JOIN public.invoices      i  ON i.id  = inst.invoice_id
      JOIN public.enrollments   e  ON e.id  = i.enrollment_id
      JOIN public.programs      pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
        AND inst.status = 'paid'
    ) src
    GROUP BY 1
  ),
  oi AS (
    SELECT date_trunc('month', o.payment_date)::date AS m,
           COALESCE(SUM(o.amount), 0)               AS total
    FROM public.other_income o
    WHERE o.hub_id = _hub
    GROUP BY 1
  ),
  pr AS (
    SELECT date_trunc('month', p.paid_at)::date AS m,
           COALESCE(SUM(p.amount), 0)           AS total
    FROM public.payroll_runs p
    JOIN public.staff        s ON s.id = p.staff_id
    WHERE s.hub_id = _hub AND p.status = 'paid' AND p.paid_at IS NOT NULL
    GROUP BY 1
  ),
  ex AS (
    SELECT date_trunc('month', e.payment_date)::date AS m,
           COALESCE(SUM(e.amount), 0)               AS total
    FROM public.expenses e
    WHERE e.hub_id = _hub
    GROUP BY 1
  )
  SELECT months.m,
         COALESCE(rev.total, 0),
         COALESCE(oi.total,  0),
         COALESCE(pr.total,  0),
         COALESCE(ex.total,  0),
         (COALESCE(rev.total, 0) + COALESCE(oi.total, 0))
           - COALESCE(pr.total, 0)
           - COALESCE(ex.total, 0)
  FROM months
  LEFT JOIN rev ON rev.m = months.m
  LEFT JOIN oi  ON oi.m  = months.m
  LEFT JOIN pr  ON pr.m  = months.m
  LEFT JOIN ex  ON ex.m  = months.m
  ORDER BY months.m DESC;
END;
$$;

-- ── 2. get_enrollment_performance: use first paid installment date ──
-- Previously used e.created_at (enrollment record creation), now uses
-- the date of the first installment payment for accurate monthly reporting.
CREATE OR REPLACE FUNCTION public.get_enrollment_performance(
  p_months integer DEFAULT 12,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE(month date, target_count integer, actual_count integer, variance integer, achievement_pct numeric)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  _start date;
  _end   date;
  _hub   uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only admins can view enrollment performance';
  END IF;

  _hub := public.get_my_hub_id();

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    _start := date_trunc('month', p_start_date)::date;
    _end   := date_trunc('month', p_end_date)::date;
  ELSE
    _end   := date_trunc('month', CURRENT_DATE)::date;
    _start := (date_trunc('month', CURRENT_DATE) - ((GREATEST(p_months, 1) - 1) || ' months')::interval)::date;
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(_start, _end, '1 month'::interval)::date AS m
  ),
  first_payments AS (
    SELECT i.enrollment_id, MIN(inst.paid_at) AS first_paid_at
    FROM public.invoices i
    JOIN public.installments inst ON inst.invoice_id = i.id AND inst.status = 'paid'
    GROUP BY i.enrollment_id
  ),
  actual AS (
    SELECT date_trunc('month', fp.first_paid_at)::date AS m,
           COUNT(*)::int AS cnt
    FROM public.enrollments e
    JOIN public.programs pr ON pr.id = e.program_id
    JOIN first_payments fp  ON fp.enrollment_id = e.id
    WHERE pr.hub_id = _hub
      AND e.enrollment_status NOT IN ('cancelled', 'withdrawn')
    GROUP BY 1
  ),
  tgt AS (
    SELECT t.target_month AS m, t.target_count AS cnt
    FROM public.enrollment_targets t
    WHERE t.hub_id = _hub
  )
  SELECT months.m,
         COALESCE(tgt.cnt, 0)::int,
         COALESCE(actual.cnt, 0)::int,
         (COALESCE(actual.cnt, 0) - COALESCE(tgt.cnt, 0))::int,
         CASE WHEN COALESCE(tgt.cnt, 0) > 0
              THEN ROUND((COALESCE(actual.cnt, 0)::numeric / tgt.cnt::numeric) * 100, 1)
              ELSE NULL END
  FROM months
  LEFT JOIN actual ON actual.m = months.m
  LEFT JOIN tgt    ON tgt.m   = months.m
  ORDER BY months.m DESC;
END;
$$;

-- ── 3. promote_staff_to_admin ──
CREATE OR REPLACE FUNCTION public.promote_staff_to_admin(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _hub_id uuid;
BEGIN
  IF NOT public.is_superadmin() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can promote staff';
  END IF;

  SELECT c.hub_id INTO _hub_id
  FROM public.classroom_staff cs
  JOIN public.classrooms c ON c.id = cs.classroom_id
  WHERE cs.user_id = p_user_id
  LIMIT 1;

  IF _hub_id IS NULL THEN
    _hub_id := public.get_my_hub_id();
  END IF;

  INSERT INTO public.hub_members (hub_id, user_id, hub_role)
  VALUES (_hub_id, p_user_id, 'admin')
  ON CONFLICT (user_id) DO UPDATE SET hub_id = _hub_id, hub_role = 'admin';

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- ── 4. list_staff_users ──
CREATE OR REPLACE FUNCTION public.list_staff_users()
RETURNS TABLE(user_id uuid, email text, full_name text, classrooms text[])
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _hub uuid;
BEGIN
  IF NOT public.is_superadmin() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can list staff';
  END IF;

  _hub := public.get_my_hub_id();

  RETURN QUERY
  SELECT DISTINCT
    ur.user_id,
    au.email::text,
    COALESCE(p.full_name, au.email)::text AS full_name,
    ARRAY_AGG(DISTINCT cl.name) FILTER (WHERE cl.name IS NOT NULL) AS classrooms
  FROM public.user_roles ur
  JOIN auth.users au ON au.id = ur.user_id
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  LEFT JOIN public.classroom_staff cs ON cs.user_id = ur.user_id AND cs.status = 'active'
  LEFT JOIN public.classrooms cl ON cl.id = cs.classroom_id AND cl.hub_id = _hub
  WHERE ur.role = 'staff'
    AND ur.user_id IN (
      SELECT cs2.user_id
      FROM public.classroom_staff cs2
      JOIN public.classrooms c ON c.id = cs2.classroom_id
      WHERE c.hub_id = _hub AND cs2.user_id IS NOT NULL
    )
  GROUP BY ur.user_id, au.email, p.full_name;
END;
$$;
