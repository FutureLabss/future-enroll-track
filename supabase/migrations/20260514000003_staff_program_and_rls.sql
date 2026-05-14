-- 1. Allow admins to read the staff table (required for ClassroomDetailPage
--    roster dropdown and for AcceptInvitationPage's staff join to succeed)
CREATE POLICY "Admins read staff" ON public.staff
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Allow a staff member to read their own record via email match
--    (needed for StaffInvitationsPage and StaffInvoicesPage)
CREATE POLICY "Staff read own record" ON public.staff
  FOR SELECT USING (
    email IS NOT NULL AND
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- 3. Tie tutors to programs
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL;
