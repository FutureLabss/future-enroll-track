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
- **The Finance Dashboard defaults to cash basis** (`revenueBasis = 'paid'` in `FinanceDashboardPage.tsx`) — deliberate: expenses/payroll here are already bucketed by `payment_date`/`pay_month` (cash-basis), so cash-basis revenue is the internally-consistent choice for `profit`. Due-date stays available as a toggle for accrual-style/audit purposes, and because `paid_at` is less trustworthy on old backfilled rows (see below).
- **RhemaHub**: revenue bucketed by `payments.created_at` (already a real payment date, same in both bases)
- Always fetch both legs and merge client-side — never query only one table
- **`paid_at` accuracy matters now that it drives the default view.** Every "mark installment paid" action must stamp the real approval moment (`new Date().toISOString()`), never `due_date` or any other placeholder — `EditInvoicePage.tsx`'s "Auto-populate paid_at" used to default to `due_date` and got fixed (2026-08-11); 17 historical installments still carry that bad value (`paid_at::date = due_date` at midnight — a detectable signature if you need to find them again) and their true payment dates aren't recoverable from this system's audit trail.
- `useMonthDetail`'s `basis` param follows the dashboard's toggle for the month drill-down.

### Four dates, and which one is revenue
There are four distinct dates in play and conflating any two of them is how revenue lands in the wrong month:

| Date | Means | Trust |
|------|-------|-------|
| `installments.due_date` | when payment was *scheduled* | exact, but not when money moved |
| `payments.created_at` | when the row was typed in | exact, and almost never the payment date |
| `payments.payment_date` / `installments.paid_at` | what staff entered / stamped | a recollection; `now()` on old rows |
| `paid_at_actual` (+ `bank_transactions.occurred_at`) | when the bank says money landed | the only real evidence |

- `paid_at_actual` is **NULL until proven**, and `paid_at_source` records the provenance (`bank_statement`/`paystack` are evidence; `staff_entered` is not). Never populate it with a guess — a NULL that falls back to the old basis is honest, a wrong timestamp is not.
- `bank_transactions` is the imported Moniepoint ledger (`scripts/import-bank-statement.py`, idempotent on `(account_number, transaction_ref)`). The importer refuses to emit unless its extracted credits and debits equal the totals the statement prints for itself.
- **Matching is never automatic.** In Jan–Sep 2026, 275 of 291 external deposits share their exact amount with another deposit (74 separate deposits of ₦2,000). Amount cannot identify a payer, so `suggest_bank_matches()` scores candidates and `confirm_bank_match()` is the only thing that writes `paid_at_actual`.
- **Credits from account `8288325467` (the company's second Moniepoint account) are mostly real income, not internal shuffling.** Over Jan–Sep 2026 that account sent in ₦1,019,600 while this one only ever sent it ₦230,900 — so at most ₦230,900 is money coming back, and the remaining **₦788,700 is income** (other income, and refunds of funds previously sent over). `kind = 'internal_transfer'` marks these for review; **do not blanket-exclude them from revenue** — doing so understates Jan by ₦261,500 and Mar by ₦187,200.
- Counting all money in (₦7,615,468 net of the ₦230,900 round trip) against what the LMS records (₦7,094,600) leaves **₦520,868 of income that reached the bank but isn't in the system** — the gap to chase, and it runs the opposite way to what a naive "bank credits = revenue" read suggests.

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
