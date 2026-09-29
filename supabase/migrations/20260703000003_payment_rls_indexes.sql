-- The RLS policy on invoices/payments/installments does an EXISTS subquery that
-- joins: invoices → enrollments (e.id = invoices.enrollment_id) → programs.
-- Without an index on invoices.enrollment_id, Postgres scans the full enrollments
-- table for every row being evaluated — the root cause of the payments query hanging.
-- Also index programs.hub_id which is the final filter in every hub-scoped EXISTS check.

CREATE INDEX IF NOT EXISTS idx_invoices_enrollment_id
  ON public.invoices (enrollment_id);

CREATE INDEX IF NOT EXISTS idx_programs_hub_id
  ON public.programs (hub_id);
