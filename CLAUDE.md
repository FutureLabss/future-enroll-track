# CLAUDE.md — LMS Codebase Rules

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
- **FutureLabs**: `get_finance_summary` returns two bases for the same installments — `revenue` bucketed by `installments.due_date` (accrual) and `revenue_cash` bucketed by `paid_at` (cash-basis, when the money actually landed) — both where `status = 'paid'`.
- **The Finance Dashboard defaults to cash basis** (`revenueBasis = 'paid'` in `FinanceDashboardPage.tsx`) — deliberate: expenses/payroll here are already bucketed by `payment_date`/`pay_month` (cash-basis), so cash-basis revenue is the internally-consistent choice for `profit`. Due-date stays available as a toggle for accrual-style/audit purposes, and because `paid_at`/`payment_date` are less trustworthy on old backfilled rows (see below).
- **RhemaHub**: revenue bucketed by `payments.payment_date` — a staff-editable date column (migration `20260812000001`), not `payments.created_at` (row-insertion time). `payments` had no date field of its own before this; `created_at` was being read as if it were a payment date, which broke the moment data entry lagged behind the real payment (a backlog cleared in one sitting stamps every row with that sitting's date — 17 installments spanning Jan-Mar due dates all landed on 2026-04-28 alone, ₦940,000, once cash-basis became the default. That specific incident is fixed by having a real `payment_date` to edit; the general failure mode — batch catch-up sessions distorting whichever month they happened in — recurs any time someone clears a backlog, so don't assume a `paid_at`/`payment_date` clustered on one calendar day reflects reality without checking).
- Always fetch both legs and merge client-side — never query only one table
- **Every "mark paid" action must let the user pick the real payment date — never silently stamp `new Date()`.** `PaymentsPage.tsx`, `PendingPaymentsPage.tsx`, `InvoiceDetailPage.tsx`, and `EditInvoicePage.tsx` all have an explicit, staff-editable date field for this (added/fixed 2026-08-11 to 2026-08-12). If you add a new "mark installment paid" or "record payment" flow, it needs one too, wired to `installments.paid_at` and/or `payments.payment_date` — not an implicit "now".
- Two known-bad historical signatures if you need to find already-corrupted rows (both undetectable from the data alone — true dates aren't recoverable): `installments.paid_at::date = due_date` at midnight (17 rows, `EditInvoicePage.tsx`'s old auto-fill bug, fixed 2026-08-11), and `installments.paid_at`/`payments.payment_date` values clustered on the same calendar day across installments with due dates in different, earlier months (batch catch-up sessions, ongoing pattern, not just historical — check `GROUP BY paid_at::date` for outlier days before trusting a given month's cash-basis figure).
- `useMonthDetail` mirrors `get_finance_summary` leg-for-leg, including the `invoices.status != 'cancelled'` exclusion on both legs (this drifted out of sync once already — 2026-05-21 to 2026-08-12 — so if you touch either the RPC or the hook, touch both) and the same `payment_date`/`paid_at` basis switch, following the dashboard's toggle for the month drill-down.

---

## Supabase / Database Rules

### Migrations
- One logical change per migration file — never bundle unrelated fixes
- Name: `YYYYMMDDNNNNNN_snake_case_description.sql`
- Every new table needs: `hub_id`, RLS enabled, hub-scoped policies, `set_hub_id_from_context()` trigger
- Apply via MCP (`mcp__supabase__apply_migration`) not CLI unless explicitly asked

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
