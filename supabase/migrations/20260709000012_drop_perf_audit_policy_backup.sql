-- Housekeeping from the perf-audit closeout note: _rls_policy_backup_20260705 held
-- the pre-initplan-rewrite policies as a rollback artifact. The rewrite it insured
-- was itself rolled back on 2026-07-06 (20260706000003) and the audit closed with
-- "drop after soak" — soak has passed and the classroom tables now have their own
-- fresh snapshot in _rls_policy_backup_classroom (20260709000001).

drop table if exists public._rls_policy_backup_20260705;
