# Database Change Policy

Written after the two production outages of 2026-07-08 (13:08 and 15:34 UTC, ~30–40 min
each, all users locked out). Follow these rules; each one traces to a real failure.

## 1. Every schema change is a tracked migration file

- All DDL (tables, columns, functions, policies, roles) goes in
  `supabase/migrations/YYYYMMDDNNNNNN_snake_case_description.sql` — **written to the repo
  first**, then applied to prod (via MCP `apply_migration` or the Management API).
- Never run DDL in the dashboard SQL editor. Never apply a change to prod that isn't in
  the repo.
- Why: prod and the repo have already diverged once — the deployed `lessons` table has no
  `cohort_id`/`status`, but the repo migration says it does. `get_student_progress`
  referenced the repo shape and **errored on every call for five days** (July 3–8), and
  the resulting error was misattributed during incident #1. Divergence turns every future
  diagnosis into archaeology.

## 2. Role timeouts are enforced — long migrations must opt out explicitly

Migration `20260708000001` enforces these (applied 2026-07-08):

| Role | statement_timeout | lock_timeout | idle_in_transaction |
|---|---|---|---|
| postgres | 2min | 10s | 2min |
| service_role | 30s | 10s | 60s |
| authenticated | 8s (pre-existing) | — | 30s |
| anon | 3s (pre-existing) | — | 15s |

A backfill or index build that legitimately needs longer than 2 minutes must raise its
own limit *inside the migration* (scoped to that transaction):

```sql
SET LOCAL statement_timeout = '10min';
-- long-running statements here
```

Diagnostic queries via MCP/Management API run as `postgres` and share the 2min cap.

## 3. Capacity: the instance is Nano — treat heavy queries as outage risks

Both 2026-07-08 outages were **capacity collapses during class hours**, not lock
pile-ups: student-facing queries on RLS-heavy tables (`assignments`,
`assignment_submissions`, `schedules`, `field_values`, `lessons`/`modules`) burned their
full 8s statement timeout, cancellations triggered frontend refetches, load compounded
until Postgres stopped accepting connections (~12 minutes from first timeout to total
silence in incident #2).

Practical consequences:
- The project runs on the default **Nano** compute (0.5 GB RAM, shared CPU) with no
  compute add-on. Upgrading to Micro/Small is the single highest-leverage mitigation.
- Any new query path serving students at class time needs an `EXPLAIN` check of both
  planning and execution time (see CLAUDE.md on the RLS initplan incident).
- Frontend retry behavior amplifies incidents: react-query retries + refetch-on-focus
  turn one slow endpoint into a stampede. Keep default retries low on hot paths.

## 4. Incident playbook (what actually worked on 2026-07-08)

1. Confirm scope: `curl https://<ref>.supabase.co/auth/v1/health` (522 = origin down)
   and a real REST table query. Management API health:
   `GET https://api.supabase.com/v1/projects/<ref>/health?services=db,auth,rest`.
2. **Capture evidence before restarting** — the logs pipeline works even when the DB is
   unreachable: `GET /v1/projects/<ref>/analytics/endpoints/logs.all?sql=<bq-sql>` over
   `postgres_logs` (filter `error_severity in ('ERROR','FATAL','PANIC')`, pull
   `user_name`, `application_name`, `query`). `pg_stat_statements` does NOT reliably
   survive a restart — the logs are the durable record.
3. Try SQL diagnosis first (`pg_stat_activity`, `pg_blocking_pids`) via
   `POST /v1/projects/<ref>/database/query`; kill a specific blocker over blind restart.
4. If SQL is unreachable, restart: `POST /v1/projects/<ref>/restart`. Recovery takes
   ~8 minutes; poll the health endpoint every 10–15s.

## 5. Known deferred items

- Deployed frontend still requests `attendance_records.lat/lng` (fixed in repo to
  `student_lat`/`student_lng` on 2026-07-08) until the next deploy.
- `src/integrations/supabase/types.ts` is badly stale (missing `classrooms`, `lessons`,
  etc.) — regenerate from the live schema.
- `run-sql.js` contains a hardcoded connection string + password for an old project;
  rotate that password and delete the file or move creds to env.
- `supabase_auth_admin` (GoTrue's role) has no statement timeout; left untouched because
  Supabase manages it — revisit only with evidence it's part of a failure chain.
