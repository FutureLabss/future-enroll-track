-- Aggregate dashboard stats server-side so AdminDashboard doesn't
-- pull every enrollment/invoice/other_income row over the wire.
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _hub      uuid;
  _is_super boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  _hub      := public.get_my_hub_id();
  _is_super := public.is_superadmin();

  RETURN (
    WITH e AS (
      SELECT total_amount, amount_paid, enrollment_status
      FROM public.enrollments
      WHERE _is_super OR hub_id = _hub
    ),
    inv AS (
      SELECT total_amount
      FROM public.invoices
      WHERE _is_super OR hub_id = _hub
    ),
    oi AS (
      SELECT amount
      FROM public.other_income
      WHERE _is_super OR hub_id = _hub
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
