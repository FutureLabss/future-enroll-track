-- ROLLBACK of 20260705000003 (wrap_rls_auth_helpers_in_initplan_subselects).
-- The (select ...) wrappers made per-row execution cheaper but exploded query
-- PLANNING on tables whose policies nest EXISTS over other RLS-protected
-- tables (assignments, cohorts, cohort_students, classrooms, presentations):
-- plans grew to ~1000 InitPlan nodes and planning alone exceeded the 8s
-- statement timeout, taking the classroom pages down on 2026-07-06.
-- Restores every policy to its snapshotted pre-rewrite expression.
-- Do NOT re-apply the initplan rewrite wholesale; if revisited, apply only to
-- leaf tables with flat policies and measure planning time first.

DO $do$
DECLARE
  pol record;
  stmt text;
  n int := 0;
BEGIN
  FOR pol IN
    SELECT b.schemaname, b.tablename, b.policyname, b.qual, b.with_check
    FROM public._rls_policy_backup_20260705 b
  LOOP
    IF EXISTS (SELECT 1 FROM pg_policies p
               WHERE p.schemaname = pol.schemaname AND p.tablename = pol.tablename AND p.policyname = pol.policyname) THEN
      stmt := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
      IF pol.qual IS NOT NULL THEN
        stmt := stmt || format(' USING (%s)', pol.qual);
      END IF;
      IF pol.with_check IS NOT NULL THEN
        stmt := stmt || format(' WITH CHECK (%s)', pol.with_check);
      END IF;
      EXECUTE stmt;
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'restored % policies', n;
END $do$;
