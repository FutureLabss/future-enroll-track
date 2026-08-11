-- Backfill migration — see 20260724000002 for context. Two more pieces of
-- the July 2026 outage-response work that were applied directly to
-- production and never committed: revoking the new access-helper functions
-- from anon/PUBLIC (Postgres grants EXECUTE to PUBLIC by default on CREATE,
-- so a from-scratch rebuild from migrations would otherwise leave these
-- open), and per-role statement/lock timeouts to fail fast instead of
-- piling up locks under load.
--
-- Corresponds to remote-only migration history entries:
--   revoke_helper_execute_from_anon, set_role_timeouts_prevent_lock_pileup
--
-- NOT included here: "lock_down_security_definer_rpc_surface". Checked
-- current grants and several SECURITY DEFINER RPCs (e.g.
-- generate_attendance_session) still have PUBLIC/anon EXECUTE, so whatever
-- that migration actually restricted is narrower than its name suggests.
-- Guessing at REVOKE statements for functions that may be intentionally
-- anon-facing (e.g. the public enrollment form's submit_enrollment_fields)
-- risks breaking a real anonymous flow — flagged separately, not backfilled.

REVOKE EXECUTE ON FUNCTION public.classroom_read_access(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.classroom_staff_access(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.classroom_manage_access(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.classroom_attendance_access(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.classroom_admin_access(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cohort_is_mine(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.curriculum_classroom_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.track_classroom_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.module_classroom_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unit_classroom_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assignment_classroom_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.presentation_classroom_id(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.classroom_read_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classroom_staff_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classroom_manage_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classroom_attendance_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classroom_admin_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cohort_is_mine(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.curriculum_classroom_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_classroom_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.module_classroom_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unit_classroom_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assignment_classroom_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.presentation_classroom_id(uuid) TO authenticated;

ALTER ROLE anon SET statement_timeout = '3s';
ALTER ROLE anon SET idle_in_transaction_session_timeout = '15s';

ALTER ROLE authenticated SET statement_timeout = '8s';
ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '30s';

ALTER ROLE service_role SET statement_timeout = '30s';
ALTER ROLE service_role SET lock_timeout = '10s';
ALTER ROLE service_role SET idle_in_transaction_session_timeout = '60s';
