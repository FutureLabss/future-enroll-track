# Refactoring Plan — FutureEnroll Track

Priority tiers: **P0** = bug/security, **P1** = quality, **P2** = nice-to-have.

---

## P0 — Bugs & Security

### P0.1 Superadmin email hardcoded in client bundle
- **Files**: `src/hooks/useAuth.tsx`, `src/pages/admin/StaffInvoicesAdminPage.tsx`
- **Problem**: `manassehudim@gmail.com` is checked in frontend code. Anyone can view the superadmin email via devtools.
- **Fix**: Move superadmin check server-side via an RPC (`is_superadmin()`) or a `superadmins` table lookup.

### P0.2 Hardcoded account number in source
- **File**: `src/pages/student/StudentInvoiceDetailPage.tsx`
- **Problem**: `8288339819` (Moniepoint MFB) is hardcoded at line 146.
- **Fix**: Store in `bank_details` table or env config, fetch at runtime.

### P0.3 Hardcoded callback URL
- **File**: `src/pages/student/StudentInvoiceDetailPage.tsx` line 92
- **Problem**: `https://admin.futurelabs.ng/student/invoices/${id}/payment-callback` breaks on other domains.
- **Fix**: `window.location.origin + /student/invoices/${id}/payment-callback`

### P0.4 `confirm()` used instead of Dialog
- **Files**: `src/pages/admin/CohortDetailPage.tsx` (~line 549), `src/pages/admin/BulkEmailPage.tsx`
- **Problem**: Blocks UI thread, breaks React state, violates CLAUDE.md convention.
- **Fix**: Replace with shadcn `<Dialog>` and `toast` pattern.

### P0.5 Dual lockfiles
- **Files**: `package-lock.json` + `bun.lock` + `bun.lockb`
- **Problem**: Dependency versions can diverge; CI and dev machines may install different resolutions.
- **Fix**: Pick one package manager, delete the other lockfiles, commit only one.

---

## P1 — Code Quality

### P1.1 Eliminate `as any` casts (~50+ instances)
- **Files**: Across admin pages (PaymentsPage, PendingPaymentsPage, StaffInvoicesAdminPage, etc.)
- **Problem**: Type safety is lost. RPC calls and new table names use `as any`.
- **Fix**: Extend `Database` type in `src/integrations/supabase/types.ts` for missing tables, or use typed RPC wrappers.

### P1.2 `console.error` left in committed code
- **File**: `src/pages/admin/BulkEmailPage.tsx` (line with `console.error('Failed emails:', data.errors)`)
- **Problem**: Violates CLAUDE.md "No `console.log` left in committed code".
- **Fix**: Replace with `toast.error`.

### P1.3 Large page files — single-responsibility violation
- **Files**:
  - `ClassroomDetailPage.tsx` (~1500 lines)
  - `ClassroomWorkspacePage.tsx` (~920 lines)
  - `StudentClassroomPage.tsx` (~841 lines)
- **Problem**: Hard to read, test, or modify safely.
- **Fix**: Extract sections into dedicated components (tabs, lists, forms) — aim for <500 lines per file.

### P1.4 Missing loading states on inline fetches
- **Files**: Several admin pages with inline `useEffect` + `supabase.from().select()` patterns
- **Problem**: Pages render partial/empty data before fetch completes, or don't communicate loading at all.
- **Fix**: Add `loading` state + spinner/skeleton for all data fetches.

### P1.5 No automated tests
- **File**: `src/test/` — one example test, no real coverage
- **Problem**: Regressions are undetectable.
- **Fix**: Add Vitest tests for hooks (useAuth, useFinanceSummary), critical page logic, and utility functions.

---

## P2 — Polish & Technical Debt

### P2.1 Edge functions with JWT verification disabled
- **Functions**: `send-notification`, `check-due-reminders`, `paystack-verify` (all have `verify_jwt = false`)
- **Problem**: These endpoints accept unauthenticated requests.
- **Fix**: Enable JWT verification where possible, or add API key/token auth. If intentionally public, document why.

### P2.2 Front-end superadmin check via RPC
- **Problem**: Currently uses `data?.some(s => s.email === 'manassehudim@gmail.com')` pattern.
- **Fix**: Create RPC `is_superadmin()` that checks `superadmins` table, call from client.

### P2.3 Edge function names as string literals
- **Files**: All `supabase.functions.invoke('send-notification', ...)` calls
- **Problem**: No type safety — a typo silently fails at runtime.
- **Fix**: Define function name constants or a typed enum.

### P2.4 Dual-bucket finance model not documented in code
- **Problem**: FutureLabs vs RhemaHub revenue bucketing is documented only in CLAUDE.md, not in the code.
- **Fix**: Add a comment block in `useFinanceSummary.ts` explaining the two-leg approach.

### P2.5 Invoice approvals page tied to superadmin email
- **File**: `InvoiceApprovalsPage.tsx`
- **Problem**: Checks `user?.email === 'manassehudim@gmail.com'` to gate access.
- **Fix**: Use `isSuperadmin` from `useAuth()` (which itself needs fixing — see P0.1/P2.2).
