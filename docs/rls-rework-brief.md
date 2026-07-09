# Classroom RLS Rework — Handoff Brief

Context for the session that plans and executes this. Everything below was live-verified
on 2026-07-08 after two same-day production outages (see
`docs/database-change-policy.md` and the incident memory).

## The problem, measured

RLS policies on the classroom/content tables expand into enormous per-query filters.
Measured 2026-07-08 on the idle production DB, as a real student identity
(`EXPLAIN (ANALYZE, SUMMARY)` via Management API, JWT claims set to student
`407c02ee-e80f-44f6-9a6f-70cc9c1cba2b`):

| Query | Table rows | Execution | Planning | SubPlans in filter |
|---|---|---|---|---|
| `select … from assignments` | 0 | 23 ms | **273 ms** | **1,030** |
| `select … from schedules` | 3 | 63 ms | **245 ms** | 996 |

PostgREST uses the simple protocol — no plan caching — so planning cost is paid on
EVERY request. Outage mechanism: ~60 users at class time × ~250 ms pure CPU per query
× 2 shared vCPUs (Nano) → queueing → 8 s authenticated statement_timeout → react-query
retries amplify → connection exhaustion → total collapse (~12 min from first timeout).

## Why the policies explode

Each policy is an OR of ~5 access paths (teaching staff / co-staff / enrolled student /
hub admin / superadmin), and each path runs EXISTS over other tables whose own RLS
policies get inlined too — multiplicative expansion. The `is_superadmin()`,
`has_role()`, `get_my_hub_id()`, `get_classroom_hub_id()` helpers appear dozens of
times per filter.

## The proven fix pattern (already shipped for finance)

Migration `20260707000001_finance_rls_helpers_stop_policy_expansion.sql` fixed the same
disease on finance tables: move membership checks into `SECURITY DEFINER` helper
functions (a boundary Postgres cannot inline through), one flat policy per
table/action. Read that migration first and replicate its shape.

Target design: one helper like `get_my_accessible_classroom_ids() returns uuid[]`
(SECURITY DEFINER, STABLE, `SET search_path = public`), so each policy becomes
`classroom_id = ANY (get_my_accessible_classroom_ids())` plus the cheap direct checks
(`student_id = auth.uid()`).

## Scope (tables that died in the outage logs)

`assignments`, `assignment_submissions`, `schedules`, `field_values`,
`attendance_sessions`, `attendance_records`, `presentations`, `presentation_grades`,
and the content chain `curricula → tracks → modules → units → lessons`.

## Hard constraints — all paid for with outages

1. **2026-07-06 incident**: wrapping RLS helpers in `(select …)` initplan subselects
   wholesale took the app down — planning alone blew past 8 s. Rolled back in
   `20260706000003`. Do NOT repeat; the fix is helper-function boundaries, not
   initplan wrappers.
2. **Prod schema ≠ repo migrations.** Deployed `lessons` has NO `cohort_id`/`status`
   (hangs off `unit_id`); repo migration 20260518000026 claims otherwise. Verify every
   column against the LIVE schema before writing policies
   (`select column_name from information_schema.columns where …` via Management API).
3. **Verification gate per table, before keeping any change**:
   - `EXPLAIN (ANALYZE, SUMMARY)` as student AND as staff identity: planning time
     < 10 ms target (< 50 ms acceptable), and row counts correct in BOTH directions
     (allowed identity sees exactly its rows; restricted identity sees none it
     shouldn't). Identity simulation:
     `begin; select set_config('request.jwt.claims','{"sub":"<uid>","role":"authenticated"}',true); set local role authenticated; <query>;`
   - Test student: `407c02ee-…` (above). Pick a staff row from `classroom_staff`.
4. **Rollback artifact before each table**: dump current policies
   (`select policyname, pg_get_expr(...)` or `pg_policies`) to a file in the repo or a
   backup table (precedent: `_rls_policy_backup` from the perf audit — check if it
   still exists before creating another).
5. One table (or one tightly-coupled group) per migration, repo file first, then apply.

## Tooling that works (no Supabase MCP needed)

- SQL against prod: `POST https://api.supabase.com/v1/projects/ozjxktxbzhkujavmzjrf/database/query`
  with `Authorization: Bearer $(cat ~/.supabase/access-token)`, JSON body
  `{"query":"…"}`. Runs as `postgres` (2 min statement cap; `SET LOCAL statement_timeout`
  to override inside a migration).
- Multi-statement strings work; `$$dollar quoting$$` avoids shell-escaping pain.
- Logs even when DB is down: `GET …/analytics/endpoints/logs.all?sql=<bq-sql>` over
  `postgres_logs`.
- Health: `GET …/health?services=db,auth,rest`. Restart (last resort): `POST …/restart`
  (~8 min recovery).

## Related but out of scope here

- Frontend retry back-off / disable refetch-on-focus on hot paths (separate PR).
- Compute upgrade decision (Nano → Micro) — orthogonal cushion, user's call.
- `get_student_progress` already fixed (20260708000002). Frontend `lat/lng` fix status:
  check `src/hooks/useAttendance.ts` — was fixed then reverted same day; confirm
  current state against live columns `student_lat`/`student_lng` before touching.
- Stale `src/integrations/supabase/types.ts` — regenerate after the rework.
