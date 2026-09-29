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

### One student, one enrollment — check the phone, not the email
Six students were enrolled twice between Jan and Sep 2026 and their payments counted twice (₦380,000). `EnrollPage.tsx` had guarded against this since launch, but on `(email, program_id)` — and **every real duplicate used a second email address while keeping the same phone number** ("Chukwuemerie Nwachukwu" vs "Nwachukwu Chukwemerie Triumphant", same number, both marked ₦150,000 paid). The guard watched the field that reliably differs and ignored the one that reliably matches.
- `enrollments.phone_normalized` (generated, last 10 digits) is the comparison key — raw `phone` arrives as `+234…`, `0…`, and with stray tabs. Index it, compare on it, never compare raw `phone`.
- **Never put a UNIQUE constraint on it.** Siblings legitimately share a parent's number: the Udomah children hold three enrollments on three different programmes, the Umia twins two on one programme, all bank-confirmed. The public form therefore blocks only same-phone **and** same-programme, and tells siblings to call the desk.
- `enrollments_needing_duplicate_review` is the standing report. The discriminator that settled all six cases is **`bank_confirmed`**: a phantom copy carries paid installments that no deposit backs (0) while each real sibling has their own (>0). Name-token overlap alone cannot separate twins from a duplicate — don't try.
- A duplicate is never only a data-tidiness problem: it double-counts revenue, splits one student's payments across two records so both look half-paid, and makes both get chased for money already sent.

### Record who paid when it isn't the student
`installments.paid_by` / `payments.paid_by` hold the name on the transfer when a parent, sibling, sponsor or employer pays. **Every "mark paid" flow must offer it**, alongside the date field.
- This is the one fact reconciliation cannot recover later. The bank statement knows the *sender*; the LMS knows the *student*; the link between them exists only in the conversation at the front desk. 15 of the 44 unmatched Jan–Sep payments are unmatchable for exactly this reason.
- Name matching cannot substitute for it and fails **in both directions** — a shared common surname produces false positives (one loose pass produced 116 bogus matches), and a third-party payer shares no name with the student at all, producing false negatives. Lawrence Inyang paid for Umoren Aniebiet Okon; the payer's surname pointed at a different student entirely.
- **Known third-party payers** (they pay for several students, so their name will never match the student's): `EPHRAIM FRIDAY AKPAN`, `ESSIEN PRAISE PATRICK` / `PRAISE ESSIEN`, `GRACE EDET EKANEM` / `EKANEM GRACE EDET`, `UFEKONG MOBILE`, `JOY AMOS FRANCIS`. `USENOBONG USEN ETOKAKPAN` is a **workspace** customer, not a sponsor — his recurring small credits are desk fees, never tuition. A deposit from one of these is a sponsor payment awaiting allocation, not an unexplained credit — ask which student it was for rather than trying to match it by name.
- `paid_at_source = 'other_account'` marks money paid into the company's **second** Moniepoint account `8288325467`, whose statement has never been imported. `paid_at_actual` stays NULL — the landing date lives in a ledger we do not hold — but the row is *explained*, so it stops being re-investigated on every pass. Bla, Godiya Danjuma's ₦50,000 is the first confirmed case. Importing that statement turns these into real matches.


### Enrollment cached totals (`total_amount`/`amount_paid`) — keep them synced on every write path
`enrollments.total_amount` and `amount_paid` are plain columns, not derived from `invoices`/`installments` — every page that shows a student's financial status (Cohort students table, Reports, Admin Dashboard, Program/Cohort detail, `EnrollmentsPage`) reads these cached columns, not the live invoice. `outstanding_balance` is a generated column (`total_amount - amount_paid`), so it inherits whatever these two say, right or wrong.
- `admin_update_invoice` recalculates `amount_paid` correctly on every edit but, until 2026-08-17, never touched `total_amount` — so editing an invoice's total (adding/removing installments) left the enrollment's cached total frozen at whatever it was before the edit, forever. Concrete case: `INV-001019` edited down to ₦50,000 on 2026-07-15 — invoice and `amount_paid` both correctly showed ₦50,000, `enrollments.total_amount` stayed at the pre-edit ₦100,000, so the Cohort students table showed ₦50,000 outstanding on an invoice that was actually fully paid. 6 enrollments found drifted this way (both directions — some too high, some too low), backfilled in `20260817000001`.
- If you add or touch any invoice-editing path, it must recompute **both** `amount_paid` (sum of paid installments) and `total_amount` (sum of that enrollment's non-cancelled invoices) — not just one. `admin_update_invoice` is the reference implementation.

### Four dates, and which one is revenue
There are four distinct dates in play and conflating any two of them is how revenue lands in the wrong month:

| Date | Means | Trust |
|------|-------|-------|
| `installments.due_date` | when payment was *scheduled* | exact, but not when money moved |
| `payments.created_at` | when the row was typed in | exact, and almost never the payment date |
| `payments.payment_date` / `installments.paid_at` | what staff entered / stamped | a recollection; `now()` on old rows |
| `paid_at_actual` (+ `bank_transactions.occurred_at`) | when the bank says money landed | the only real evidence |

- `paid_at_actual` is **NULL until proven**, and `paid_at_source` records the provenance (`bank_statement`/`paystack` are evidence; `staff_entered` is not). Never populate it with a guess — a NULL that falls back to the old basis is honest, a wrong timestamp is not.
- **Moniepoint exports two incompatible statement layouts** and the importer detects which: *detailed* (settlement columns, date wrapped over three lines in a 9-char column — the 2026 exports) and *simple* (Debit/Credit/Balance only, date over two lines, column width drifting between pages — the 2025 exports). A parser written for one returns **zero rows** on the other, and page-break lines carry a leading form feed that pushes the date out of column zero. Coverage is now continuous: HQ `8288339819` May 2025 → Sep 2026 (2025 closes at ₦183.08, exactly the 2026 opening), plus `8288325467` for 2025.
- `bank_transactions` is the imported Moniepoint ledger (`scripts/import-bank-statement.py`, idempotent on `(account_number, transaction_ref)`). The importer refuses to emit unless its extracted credits and debits equal the totals the statement prints for itself.
- **Matching is never automatic.** In Jan–Sep 2026, 275 of 291 external deposits share their exact amount with another deposit (74 separate deposits of ₦2,000). Amount cannot identify a payer, so `suggest_bank_matches()` scores candidates and `confirm_bank_match()` is the only thing that writes `paid_at_actual`.
- **Any path that rebuilds installments must carry the reconciliation columns across.** `admin_update_invoice` deletes every installment and re-inserts from the submitted JSON; until `20260911000001` that INSERT omitted `paid_at_actual`/`paid_at_source`/`bank_transaction_id`, so one invoice edit silently threw away the bank evidence for that invoice and the cash basis fell back to the typed `paid_at`. The edit payload carries no installment ids, so evidence is re-attached on `(amount, due_date)` with duplicates paired off in order — and is deliberately **dropped** when a row's amount or due date changed, because that is no longer the row the bank matched.
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
