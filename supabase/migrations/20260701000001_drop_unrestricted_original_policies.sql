-- The original 20260308 migration named policies "Admins can manage X" (with "can").
-- Migrations 20260629000002 and 20260629000004 tried to drop "Admins manage X" (no "can")
-- which silently no-oped (DROP POLICY IF EXISTS). Both the old unrestricted policy and our
-- new hub-scoped policy were active simultaneously. PostgreSQL ORs RLS policies, so
-- ANY admin could read ALL rows across ALL hubs — the hub-scoped replacement had no effect.
--
-- Fix: drop the correct original policy names.

DROP POLICY IF EXISTS "Admins can manage enrollments"  ON public.enrollments;
DROP POLICY IF EXISTS "Admins can manage invoices"     ON public.invoices;
DROP POLICY IF EXISTS "Admins can manage installments" ON public.installments;
DROP POLICY IF EXISTS "Admins can manage cohorts"      ON public.cohorts;
