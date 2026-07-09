# Classroom RLS Rework — Staged Plan (awaiting approval)

Status: **planned 2026-07-09, not yet approved, nothing applied to prod.**
Source: `docs/rls-rework-brief.md`, `docs/database-change-policy.md`, live prod state
verified read-only on 2026-07-09.

## Phase 0 findings (live-verified)

- **58 live policies** across the 13 scoped tables (dumped via Management API; see
  Stage 0 for the durable snapshot). Several tables have redundant permissive policies
  that OR together — e.g. `assignments` has THREE staff SELECT policies
  ("Classroom staff view assignments", "Staff read classroom assignments",
  "Teaching staff view classroom assignments"). Consolidation is part of the fix.
- **Root mechanism confirmed**: `is_superadmin`, `has_role`, `get_my_hub_id`,
  `get_classroom_hub_id` are all `LANGUAGE sql` → the planner inlines them and the
  RLS of every table they touch, multiplicatively. The finance helpers
  (`invoice_in_my_hub` etc.) are `plpgsql` → opaque to the planner. That language
  difference IS the fix.
- **Live schema confirms the divergence warning**: `lessons` has no
  `cohort_id`/`status` (hangs off `unit_id`); `tracks`/`modules`/`units`/`lessons`
  have no `classroom_id` — only `curricula` does. `field_values` hangs off
  `enrollment_id` only (no classroom/hub column) and has PUBLIC insert/update
  policies serving the pre-auth enrollment form — must be preserved verbatim.
- **Student access paths** (from live quals): (1) `classroom_students` direct,
  (2) `cohort_students → cohorts → classroom`, (3) active `enrollments → program →
  classrooms`; plus cohort scoping (`cohort_id IS NULL OR` member) and
  `status='published'` filters on assignments/presentations.
- `enrollment_is_mine(uuid)` from the finance migration already exists and fits
  `field_values` exactly — reuse it.
- `is_superadmin` has two overloads in prod — check which policies bind which at
  Stage 0; don't create a third.

## Helper design (Stage 0, migration B)

All: `plpgsql, STABLE, SECURITY DEFINER, SET search_path = public`, GRANT EXECUTE to
`authenticated` only. SECURITY DEFINER bypasses inner RLS, so each helper must encode
the full restriction itself (`status='active'` staff, non-cancelled/withdrawn
enrollments, hub scoping).

| Helper | Returns | Encodes |
|---|---|---|
| `get_my_accessible_classroom_ids()` | `uuid[]` | union of the 3 student paths + active `classroom_staff` + hub admin (all classrooms in my hub) + superadmin (all) |
| `get_my_staff_classroom_ids()` | `uuid[]` | active `classroom_staff` + hub admin + superadmin — the write-side set |
| `get_my_cohort_ids()` | `uuid[]` | `cohort_students` + active `enrollments.cohort_id` |
| content-chain accessors | `uuid[]` per level | curriculum/track/module/unit ids derived by joining down from accessible classroom ids |

Target policy shape per table: one flat student SELECT
(`classroom_id = ANY (get_my_accessible_classroom_ids()) AND (cohort_id IS NULL OR
cohort_id = ANY (get_my_cohort_ids())) AND status = 'published'` where applicable,
plus cheap direct checks like `student_id = auth.uid()`), one flat staff/admin write
policy on `get_my_staff_classroom_ids()`, keep the trivial superadmin policies
(15-char quals, harmless). Drop the redundant duplicates.

Known decision point, resolved empirically at Stage 1: `= ANY (stable_func())` may be
evaluated per row on a seq scan. If the Stage 1 gate shows execution time regressing,
fall back to the proven finance shape — per-row boolean helpers
(`classroom_accessible(_classroom_id uuid)`) with an indexed EXISTS inside. Semantics
identical; the gate decides.

## Stages — one migration each, repo file first, then apply

**Stage 0 — prep, zero behavior change (safe any time):**
- Migration A: rollback artifact. Check whether `_rls_policy_backup` (perf audit)
  still exists; either way create `_rls_policy_backup_classroom` capturing
  `pg_policies` for all 13 tables, AND commit a generated
  `docs/rls-rollback-classroom.sql` of executable `DROP POLICY`/`CREATE POLICY`
  statements per table. Restore command per table must be one line.
- Migration B: create helpers above. Unused functions change nothing → zero risk.
- Verify helpers standalone as test student `407c02ee-e80f-44f6-9a6f-70cc9c1cba2b`
  and a staff identity (pick one from `classroom_staff where status='active'` at
  execution time) — compare returned arrays to expected memberships before any
  policy references them.

**Stage 1 — `schedules`** (measured: 245 ms planning, 996 SubPlans; only 4 policies —
cleanest pattern-prover on a hot table).
**Stage 2 — `assignments`** (measured: 273 ms planning, 1,030 SubPlans; consolidate
the 3 duplicate staff SELECT policies).
**Stage 3 — `attendance_sessions` + `attendance_records`** (coupled pair; keep
"Students insert own attendance" INSERT semantics exactly — geofence flow).
**Stage 4 — `assignment_submissions`** (depends on assignments being flat).
**Stage 5 — `presentations` + `presentation_grades`** (coupled pair).
**Stage 6 — content chain `curricula → tracks → modules → units → lessons`** (one
tightly-coupled migration; write against the LIVE columns, not repo migration
20260518000026).
**Stage 7 — `field_values`**: swap only admin + student policies to
`enrollment_is_mine(enrollment_id)` / hub helper; do NOT touch the two public
policies (pre-auth enrollment form).
**Stage 8 — closeout**: re-run the brief's two baseline queries and compare; run
`get_advisors`; regenerate `src/integrations/supabase/types.ts`; record results.

## Verification gate — per stage, before keeping anything

1. `EXPLAIN (ANALYZE, SUMMARY)` on the table's hot query as student AND staff via
   `begin; select set_config('request.jwt.claims','{"sub":"<uid>","role":"authenticated"}',true); set local role authenticated; …; rollback;`
2. Planning < 10 ms target (< 50 ms acceptable). Check execution time too (per-row
   helper cost).
3. Row counts both directions: allowed identity sees exactly its rows (count them);
   restricted identity sees zero rows it shouldn't. For field_values: also exercise
   the public enrollment-form path.
4. On any failure: run that table's one-line restore from the Stage 0 artifact,
   re-verify with the identity tests, then diagnose.

## Constraints honored

- No initplan `(select …)` wrappers anywhere (2026-07-06 outage).
- Apply stages OUTSIDE class hours (both outages ~13:00–16:00 UTC). Window TBD with
  user.
- Nano instance: every migration is DDL-only (no backfills); role timeouts
  (postgres 2 min / 10 s lock) are ample for policy swaps — no `SET LOCAL` overrides
  needed.
- Repo migration file first, then apply via MCP `apply_migration`. Never dashboard.

## Open items for the user

1. Approve staging order (or reorder).
2. Pick the application window(s) — e.g. one stage per day outside class hours, or
   Stages 0–2 in one sitting then soak.
3. Prod read queries returning user ids are currently blocked by the permission
   classifier — either allow at execution time or provide a staff test uid.

## Out of scope (unchanged from brief)

Frontend retry back-off; Nano→Micro upgrade decision; `useAttendance.ts` lat/lng
re-check; dropping old `_rls_policy_backup`.
