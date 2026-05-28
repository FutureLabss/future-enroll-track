-- The previous SELECT policy joined auth.users, which the authenticator role
-- cannot access. This caused "permission denied for table users" on every
-- staff_invoices query, aborting the query for all users including superadmin.
-- Replace with auth.jwt() ->> 'email' to read the caller's email from the
-- JWT token directly — no table access required.

DROP POLICY IF EXISTS "Staff can view own invoices" ON public.staff_invoices;

CREATE POLICY "Staff can view own invoices" ON public.staff_invoices
FOR SELECT USING (
  submitted_by = auth.uid()
  OR has_role(auth.uid(), 'admin')
  OR is_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.staff s
    WHERE lower(s.email) = lower(auth.jwt() ->> 'email')
      AND s.id = staff_invoices.staff_id
  )
);
