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
- Dates: `new Date(iso).toLocaleDateString()` — never raw ISO strings in UI
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
