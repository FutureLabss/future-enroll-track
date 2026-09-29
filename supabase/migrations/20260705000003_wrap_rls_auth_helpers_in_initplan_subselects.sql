-- Performance audit finding B1: every RLS policy invoked auth.uid(),
-- has_role(), is_superadmin(), get_my_hub_id() and auth.jwt() unwrapped,
-- so Postgres re-evaluated them per row. Wrapping each call in a scalar
-- subselect lets the planner hoist it into an InitPlan evaluated once per
-- statement. Semantics are unchanged: all these functions are STABLE and
-- argument-constant within a statement.
--
-- A snapshot of the previous expressions is kept in _rls_policy_backup_20260705
-- for rollback; drop that table once the change has soaked.

CREATE TABLE IF NOT EXISTS public._rls_policy_backup_20260705 AS
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check, now() AS backed_up_at
FROM pg_policies WHERE schemaname = 'public';

ALTER TABLE public._rls_policy_backup_20260705 ENABLE ROW LEVEL SECURITY; -- no policies: superuser/service only

DO $do$
DECLARE
  pol record;
  new_qual text;
  new_check text;
  stmt text;
  n_changed int := 0;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies WHERE schemaname = 'public'
  LOOP
    new_qual := CASE WHEN pol.qual IS NULL THEN NULL ELSE
      regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        pol.qual,
        '(public\.)?has_role\(auth\.uid\(\), ''([^'']*)''::app_role\)', '(SELECT public.has_role(auth.uid(), ''\2''::app_role))', 'g'),
        '(public\.)?is_superadmin\(auth\.uid\(\)\)', '(SELECT public.is_superadmin(auth.uid()))', 'g'),
        '(public\.)?is_superadmin\(\)', '(SELECT public.is_superadmin())', 'g'),
        '(public\.)?get_my_hub_id\(\)', '(SELECT public.get_my_hub_id())', 'g'),
        'auth\.jwt\(\)', '(SELECT auth.jwt())', 'g'),
        'auth\.uid\(\)', '(SELECT auth.uid())', 'g')
    END;

    new_check := CASE WHEN pol.with_check IS NULL THEN NULL ELSE
      regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        pol.with_check,
        '(public\.)?has_role\(auth\.uid\(\), ''([^'']*)''::app_role\)', '(SELECT public.has_role(auth.uid(), ''\2''::app_role))', 'g'),
        '(public\.)?is_superadmin\(auth\.uid\(\)\)', '(SELECT public.is_superadmin(auth.uid()))', 'g'),
        '(public\.)?is_superadmin\(\)', '(SELECT public.is_superadmin())', 'g'),
        '(public\.)?get_my_hub_id\(\)', '(SELECT public.get_my_hub_id())', 'g'),
        'auth\.jwt\(\)', '(SELECT auth.jwt())', 'g'),
        'auth\.uid\(\)', '(SELECT auth.uid())', 'g')
    END;

    IF new_qual IS NOT DISTINCT FROM pol.qual AND new_check IS NOT DISTINCT FROM pol.with_check THEN
      CONTINUE;
    END IF;

    stmt := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    IF new_qual IS DISTINCT FROM pol.qual AND new_qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS DISTINCT FROM pol.with_check AND new_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE stmt;
    n_changed := n_changed + 1;
  END LOOP;

  RAISE NOTICE 'Rewrote % policies', n_changed;
END;
$do$;
