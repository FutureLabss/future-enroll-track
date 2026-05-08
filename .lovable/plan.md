# Plan

This message bundles 8 changes. Grouping them by area to keep migrations clean.

---

## 1. Use first payment date as enrollment date (everywhere)

- **DB**: Update `get_enrollment_performance` and `get_finance_summary` to group by `first_payment_date` (fall back to `created_at` only if NULL — needed so unpaid pending enrollments still appear somewhere; but for actual_count in targets we'll use first_payment_date strictly so target = paying enrollments).
- Add helper: `enrollment_date(e)` = `COALESCE(first_payment_date, created_at)`.
- **UI**: In `EnrollmentsPage`, `AdminDashboard`, `StudentDashboard`, `OrgDashboard`, `EnrollmentDetailPage` — display and sort by `first_payment_date ?? created_at`, labeled "Enrollment Date".

## 2. Invoice edit/delete request + approve workflow

- **New table**: `invoice_change_requests` (id, invoice_id, requested_by, action `'edit'|'delete'`, payload jsonb, status `'pending'|'approved'|'rejected'`, reviewed_by, reviewed_at, reason).
- **RPCs**:
  - `request_invoice_change(p_invoice_id, p_action, p_payload)` — admins call.
  - `approve_invoice_change(p_request_id)` — superadmin only; executes via existing `admin_update_invoice` / `admin_delete_invoice`.
  - `reject_invoice_change(p_request_id, p_reason)`.
- **Restrict**: Modify `admin_update_invoice`/`admin_delete_invoice` to require superadmin OR an approved request flag (we pass an internal token / use `is_superadmin` check inside, and approve_* sets a `_GUC` or just inlines the SQL).
  - Simpler: rename existing functions to `_internal` (security definer, callable only via approve_*), and admin UI only calls `request_*`.
- **UI**:
  - In `EditInvoicePage` & invoice detail: when admin (non-super) clicks Save/Delete, submit a request instead with toast "Sent for superadmin approval".
  - New page `/admin/invoice-approvals` (superadmin only) listing pending requests with Approve/Reject.
  - Sidebar link visible only to superadmin.

## 3. Paystack link in enrollment-completion email

- Edit `supabase/functions/send-notification/index.ts` (or wherever the "complete enrollment" email is sent) to include a "Pay with Paystack" CTA link → `${FRONTEND_URL}/student/invoices/{invoiceId}?pay=1` which auto-triggers paystack-init.
- Update student invoice detail page to auto-open paystack when `?pay=1` is present.

## 4. First-login dashboard zeros bug

- Likely `AdminDashboard` runs queries before role/session is hydrated. Wrap fetch in `useAuth()` `loading` gate and re-fetch when `user` becomes available. Same for student/org dashboards if affected.

## 5. Auto-populate Payments page from recent invoices + other income

- `PaymentsPage`: combine recent paid installments/payments + recent other_income into a single chronological list. Add filter chips "All / Tuition / Other income". Default sorted desc by date, top 50.

## 6. Staff invoicing → expenses

- **New table**: `staff_invoices` (id, staff_id, submitted_by, title, description, amount, evidence_url, status `'pending'|'approved'|'rejected'`, reviewed_by, reviewed_at, expense_id, created_at).
- RLS: staff submit own; superadmin approves.
- **RPC**: `approve_staff_invoice(p_id, p_payment_date)` → inserts into `expenses` (category='Staff Reimbursement', vendor_name=staff name, amount, payment_date), links via `expense_id`.
- **UI**:
  - New page `/staff/invoices` for staff to submit + view (gated by staff role — but project has no staff role; use existing user_id linked to `staff` table by email, or allow any authenticated user with row in `staff` table).
  - Superadmin approval list at `/admin/staff-invoices`.
- **Note**: project currently lacks a "staff portal". Will allow superadmin to record on staff's behalf via the same form, plus expose `/staff/invoices` to anyone whose email matches a `staff.email` row.

## 7. Student invoices: Paystack + offline upload

- Student `StudentInvoiceDetailPage` already has Paystack init; add an "Upload Offline Payment Evidence" panel that creates a `pending_payments` row. Both options visible side-by-side.

## 8. Finance preset: "This month"

- Add `<SelectItem value="1">This month</SelectItem>` at top of preset list. RPC already supports `p_months=1` (returns current month only).

---

## Technical notes

- Migration order: one big migration covering items 1, 2, 6.
- Edge function changes for item 3.
- Frontend changes spread across ~10 files.
- No breaking changes to existing data.

---

## Out of scope (will skip unless asked)

- Rebuilding staff auth/role system (we'll match by email on `staff` table for now).
- Backfilling `first_payment_date` for historical enrollments — already populated by existing payment flow.

Reply "approve" to proceed, or tell me what to change.