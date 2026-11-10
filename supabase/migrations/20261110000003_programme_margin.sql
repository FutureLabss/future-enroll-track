-- What each programme earns against what its tutors are paid, for the Activity Report.
-- Revenue = fees received in the period (cash basis, bank date first, the same basis as
-- the Finance dashboard). Tutors are on monthly pay, not per class, so a tutor's pay for
-- the period is split evenly across the programmes they teach: those of the cohorts they
-- are primary tutor of, plus their own programme when their title says tutor. Everyone
-- else (CEO, front desk, managers, marketing) is overhead, reported separately and not
-- charged to any programme.

CREATE OR REPLACE FUNCTION public.get_programme_margin(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub uuid := public.get_my_hub_id();
  _result jsonb;
BEGIN
  IF NOT (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND public.can_view_activity_report())) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  WITH revenue AS (
    SELECT e.program_id, sum(i.amount) AS amount, count(DISTINCT e.id) AS students
    FROM public.installments i
    JOIN public.invoices v ON v.id = i.invoice_id AND v.status <> 'cancelled'
    JOIN public.enrollments e ON e.id = v.enrollment_id
    JOIN public.programs p ON p.id = e.program_id AND p.hub_id = _hub
    WHERE i.status = 'paid'
      AND (COALESCE(i.paid_at_actual, i.paid_at) AT TIME ZONE 'Africa/Lagos')::date BETWEEN p_from AND p_to
    GROUP BY e.program_id
  ),
  pay AS (
    SELECT s.id AS staff_id, s.full_name, s.role_title, sum(r.amount) AS amount
    FROM public.payroll_runs r
    JOIN public.staff s ON s.id = r.staff_id AND s.hub_id = _hub
    WHERE r.status = 'paid' AND r.pay_month BETWEEN date_trunc('month', p_from)::date AND p_to
    GROUP BY s.id, s.full_name, s.role_title
  ),
  teaches AS (
    SELECT DISTINCT s.id AS staff_id, c.program_id
    FROM public.staff s JOIN public.cohorts c ON c.primary_tutor_id = s.id
    WHERE s.hub_id = _hub AND c.program_id IS NOT NULL
    UNION
    SELECT s.id, s.program_id FROM public.staff s
    WHERE s.hub_id = _hub AND s.program_id IS NOT NULL AND s.role_title ILIKE '%tutor%'
  ),
  split AS (
    SELECT t.program_id, p.staff_id, p.full_name,
           p.amount / count(*) OVER (PARTITION BY p.staff_id) AS amount
    FROM pay p JOIN teaches t ON t.staff_id = p.staff_id
  ),
  tutor_pay AS (
    SELECT program_id, sum(amount) AS amount,
           jsonb_agg(jsonb_build_object('name', full_name, 'amount', round(amount)) ORDER BY amount DESC) AS tutors
    FROM split GROUP BY program_id
  ),
  overhead AS (
    SELECT COALESCE(sum(p.amount), 0) AS amount,
           COALESCE(jsonb_agg(jsonb_build_object('name', p.full_name, 'role', p.role_title, 'amount', p.amount) ORDER BY p.amount DESC), '[]'::jsonb) AS staff
    FROM pay p WHERE NOT EXISTS (SELECT 1 FROM teaches t WHERE t.staff_id = p.staff_id)
  ),
  rows AS (
    SELECT pr.id AS program_id, pr.program_name,
           COALESCE(r.amount, 0) AS revenue, COALESCE(r.students, 0) AS paying_students,
           round(COALESCE(tp.amount, 0)) AS tutor_pay, COALESCE(tp.tutors, '[]'::jsonb) AS tutors
    FROM public.programs pr
    LEFT JOIN revenue r ON r.program_id = pr.id
    LEFT JOIN tutor_pay tp ON tp.program_id = pr.id
    WHERE pr.hub_id = _hub AND (r.amount IS NOT NULL OR tp.amount IS NOT NULL)
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(rows) ORDER BY revenue DESC) FROM rows), '[]'::jsonb),
    'overhead', (SELECT to_jsonb(overhead) FROM overhead)
  ) INTO _result;
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_programme_margin(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_programme_margin(date, date) TO authenticated;
