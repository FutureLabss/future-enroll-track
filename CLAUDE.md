# CLAUDE.md — LMS Codebase Rules

## Working style

**Investigate before acting.** Never modify code or produce a solution based on assumptions. Read the relevant files, trace the actual data flow, and confirm how things currently work before changing anything. If a bug is reported, find the root cause rather than patching the symptom. State what you verified and what you assumed.

**Work toward the outcome, not the instruction.** Treat the request as a goal state, not a task list. If the stated steps will not achieve the goal, say so and propose the path that will. Keep working until the outcome actually holds, not until the steps are technically complete.

**Verify your own work before presenting it.** After writing or changing code, check it yourself: re-read it against the requirements, trace edge cases, run tests or the code itself where possible. Do not hand back work you have not checked. If you cannot verify something, flag it explicitly rather than staying silent.

**Take notes on long tasks.** For multi-step work, maintain a running summary of decisions made, things tried and rejected, and open questions. Refer back to these notes rather than re-deriving context. Update them as understanding improves.

**Handle ambiguity by investigating, not guessing.** When something is unclear, first check whether the answer exists in the codebase, docs, or prior context. Only ask the user if investigation cannot resolve it, and then ask one precise question, not a list.

**Plan at the right scale.** For large tasks, produce a short plan first: what will change, in what order, and how you will know each part works. Then execute in coherent chunks rather than tiny fragments that lose the thread.

**Be token-efficient.** Do not restate the problem, pad with caveats, or re-explain unchanged code. Show only what changed and why. Precision over volume.

**Own the failure modes.** Before finishing, ask: what would break this? Race conditions, empty states, auth edge cases, bad input. Address the plausible ones, name the ones you deliberately deferred.

### Long, multi-step tasks
For anything sustained or multi-stage (new features, migrations touching more than one table, cross-cutting refactors), follow @LONG_TASK_PROTOCOL.md in full: Orient → Plan → Execute → Verify, with gates between phases and a running notes block. Don't skip straight to editing because the fix looks obvious — the RLS/hooks incidents below happened because changes shipped without that discipline.

---

## Stack
- **Frontend**: React + TypeScript, Vite, Tailwind, shadcn/ui
- **Backend**: Supabase (Postgres + RLS + Edge Functions)
- **Auth**: Supabase Auth — `auth.uid()` in RLS, `useAuth()` in components
- **Routing**: React Router v6

---

## Component Patterns

### Pages
- One default export per file, named after the route (e.g. `ClassroomDetailPage`)
- Data fetching in the page component, not in children
- Pass data down as props; children don't fetch independently unless they have their own hook

### Shared components — always reach for these first
| Component | Use for |
|-----------|---------|
| `<PageHeader title description actions />` | Every admin page top bar |
| `<DataTable columns data searchable emptyMessage />` | Any list of records |
| `<StatusBadge status />` | Enrollment/payment status chips |
| `<StatCard />` | Summary number cards |
| `<Badge variant="outline" className={STATUS_COLOURS[s]} />` | Cohort/classroom status |

### Don't duplicate UI — link instead
If another page already handles a view, navigate to it rather than rebuilding the layout inline. Example: classroom cohorts tab → `navigate('/admin/cohorts')`.

### Dialogs
- Use shadcn `<Dialog>` for all modals
- Keep form logic as an inner function component inside the page file when it's only used once
- `toast.success` / `toast.error` (sonner) for all feedback — never `alert()`

---

## Data & Hooks

### Hook conventions
- One hook per domain: `useClassroom`, `useFinanceSummary`, `useMonthDetail`, etc.
- Return `{ data, loading, error, refetch }` shape
- Hooks call Supabase directly — no Redux, no context store for server data

### Two-step profile lookup pattern
When a FK points to `auth.users` (not `profiles`), you can't chain joins. Fetch IDs first, then batch-fetch profiles:
```ts
const ids = rows.map(r => r.requested_by);
const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', ids);
const map = new Map(profiles.map(p => [p.user_id, p]));
```

### Finance bucketing (critical)
- **FutureLabs**: revenue bucketed by `installments.due_date` where `status = 'paid'`
- **RhemaHub**: revenue bucketed by `payments.created_at`
- Always fetch both legs and merge client-side — never query only one table

---

## Supabase / Database Rules

### Migrations
- One logical change per migration file — never bundle unrelated fixes
- Name: `YYYYMMDDNNNNNN_snake_case_description.sql`
- Every new table needs: `hub_id`, RLS enabled, hub-scoped policies, `set_hub_id_from_context()` trigger
- Apply via MCP (`mcp__supabase__apply_migration`) not CLI unless explicitly asked
- **Repo first, always**: no DDL via the SQL editor or ad-hoc queries; every prod change
  exists as a migration file before it's applied. Prod has already diverged from the
  repo once (deployed `lessons` has no `cohort_id`) and it cost five days of a broken
  RPC plus a misdiagnosed outage — see @docs/database-change-policy.md
- Role timeouts are enforced (postgres: 2min statement / 10s lock). A migration that
  legitimately needs longer starts with `SET LOCAL statement_timeout = '10min';`
- **Trust the live schema over repo migrations** when they disagree; verify columns via
  a live query before writing functions/policies against them

### RLS policy structure
```sql
-- Read: students see their own data
CREATE POLICY "Students read X" ON public.X FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM classroom_students cs
    WHERE cs.classroom_id = X.classroom_id AND cs.student_id = auth.uid()
  ));

-- Write: admins scoped to their hub
CREATE POLICY "Admins manage X" ON public.X FOR ALL
  USING (has_role(auth.uid(), 'admin') AND hub_id = get_my_hub_id())
  WITH CHECK (has_role(auth.uid(), 'admin') AND hub_id = get_my_hub_id());
```

### RPCs
- Use `SECURITY DEFINER SET search_path = public` on all RPCs
- Check role inside the function body: `IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION ...`
- Always `GRANT EXECUTE ON FUNCTION ... TO authenticated`
- Audit-trail actions: insert into `audit_logs(user_id, action, entity_type, entity_id, details jsonb)`

### Never wrap RLS helpers in (select …) wholesale
Wrapping `auth.uid()`/`has_role()`/`is_superadmin()`/`get_my_hub_id()` in scalar subselects
(the standard Supabase initplan advice) took this app down on 2026-07-06: policies here nest
EXISTS over other RLS-protected tables, so the wrappers multiplied into ~1000 InitPlan nodes
per query and PLANNING alone blew past the 8s statement timeout on classroom tables. If you
try it again, do it per-table on flat policies only, and check `EXPLAIN (SUMMARY)` planning
time as that table's most complex role (staff/student) before keeping it.

### Fragile RLS chain (content hierarchy)
`curricula → tracks → modules → units → lessons → schedules` policies join 5-6 tables deep
(see `20260518000026_lms_v2_content_hierarchy.sql`). Every hop currently lands on a PK or
indexed column — if you change any join key in this chain, verify a supporting index exists,
or all five dependent tables degrade at once. This shape already caused one recursion outage
(`20260515000015_fix_classroom_rls_circular_references.sql`).

### Classroom ↔ student sync (key invariant)
Students must exist in **`classroom_students`** to see a classroom. Adding to `cohort_students` alone is not enough — `trg_sync_cohort_student_to_classroom` handles the sync automatically. Never bypass it.

---

## Access Control

### Role check order
1. `is_superadmin()` — email `manassehudim@gmail.com`, full bypass
2. `has_role(auth.uid(), 'admin')` — hub-scoped admin
3. `classroom_staff` with `classroom_permissions` — staff with specific flags
4. `classroom_students` / `cohort_students` — student read access

### Frontend guard pattern
```tsx
const { isSuperadmin, isAdmin } = useAuth();
if (!isAdmin) return <div>Access denied</div>;
// superadmin-only controls:
{isSuperadmin && <Button>Dangerous Action</Button>}
```

---

## Style Rules

- Status colour map: define once per file, reuse — `STATUS_COLOURS: Record<string, string>`
- Currency: always `₦${Number(val).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`
- Dates: `new Date(iso).toLocaleDateString('en-NG')` — always pass 'en-NG' explicitly (bare calls render American MM/DD for US-locale browsers); never raw ISO strings in UI
- No comments unless the WHY is non-obvious
- No `console.log` left in committed code
- Tailwind only — no inline `style={}` unless computing dynamic values

---

## What NOT to do
- Don't add error handling for impossible cases
- Don't create helper abstractions for code used only once
- Don't duplicate a page's layout — navigate to it instead
- Don't query `auth.users` directly from the client — use `profiles` table
- Don't push migrations that contain unrequested changes
- Don't use `alert()` or `confirm()` — use Dialog or toast
