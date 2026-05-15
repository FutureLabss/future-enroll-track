-- The "Staff read own record" policy queries auth.users inline, which the
-- authenticated role cannot do. Replace with JWT email claim instead.
DROP POLICY IF EXISTS "Staff read own record" ON public.staff;

CREATE POLICY "Staff read own record"
  ON public.staff FOR SELECT
  USING (email IS NOT NULL AND email = (auth.jwt() ->> 'email'));
