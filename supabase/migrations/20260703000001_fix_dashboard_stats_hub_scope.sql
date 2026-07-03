-- get_dashboard_stats previously filtered enrollments and invoices with
-- `WHERE hub_id = get_my_hub_id()`, but those tables have no hub_id column —
-- hub scope for enrollments/invoices goes through program_id → programs.hub_id.
-- That column reference caused a runtime error, so all stats returned 0/null.
--
-- Fix: always scope by the caller's active hub context (get_my_hub_id()).
-- Superadmin is hub-scoped too — they switch hub via switch_hub_context() and
-- should only see data for the hub they are currently viewing.

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _hub uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  _hub := public.get_my_hub_id();

  RETURN (
    WITH e AS (
      SELECT e.total_amount, e.amount_paid, e.enrollment_status
      FROM public.enrollments e
      JOIN public.programs p ON p.id = e.program_id
      WHERE p.hub_id = _hub
    ),
    inv AS (
      SELECT i.total_amount
      FROM public.invoices i
      JOIN public.enrollments e ON e.id = i.enrollment_id
      JOIN public.programs p    ON p.id = e.program_id
      WHERE p.hub_id = _hub
    ),
    oi AS (
      SELECT amount
      FROM public.other_income
      WHERE hub_id = _hub
    )
    SELECT jsonb_build_object(
      'total_invoiced',    COALESCE((SELECT SUM(total_amount) FROM inv), 0),
      'total_collected',   COALESCE((SELECT SUM(amount_paid) FROM e), 0)
                         + COALESCE((SELECT SUM(amount) FROM oi), 0),
      'outstanding',       COALESCE((SELECT SUM(total_amount - amount_paid) FROM e), 0),
      'overdue_count',     COALESCE((SELECT COUNT(*) FROM e WHERE enrollment_status = 'overdue'), 0),
      'total_enrollments', COALESCE((SELECT COUNT(*) FROM e), 0)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;
