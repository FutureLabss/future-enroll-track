-- Scholarships: fees FutureLabs waives for a student. Unlike a sponsor (PIND, Ritman),
-- nobody pays, so a scholarship must never appear as a paid installment: that is how
-- revenue got inflated before (Gideon Oboh's free place was recorded as ₦100,000 paid).
-- Awarding one takes the amount off the student's unpaid installments, latest due
-- first, so the balance, reminders and the certificate fee rule all follow; revenue does
-- not change. With no unpaid installments (a free place with no invoice), it only
-- records the value given.

CREATE TABLE IF NOT EXISTS public.scholarships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id          uuid REFERENCES public.hubs(id) ON DELETE CASCADE,
  enrollment_id   uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  amount          numeric NOT NULL CHECK (amount > 0),
  applied_amount  numeric NOT NULL DEFAULT 0 CHECK (applied_amount >= 0),
  funded_by       text NOT NULL DEFAULT 'FutureLabs',
  reason          text NOT NULL CHECK (length(trim(reason)) > 0),
  awarded_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  awarded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at      timestamptz,
  revoke_reason   text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_scholarships_live ON public.scholarships (enrollment_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scholarships_hub ON public.scholarships (hub_id, awarded_at DESC);

DROP TRIGGER IF EXISTS trg_scholarships_set_hub_id ON public.scholarships;
CREATE TRIGGER trg_scholarships_set_hub_id
  BEFORE INSERT ON public.scholarships
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

-- Same people who approve certificates: the CEO or a training manager of the hub.
CREATE OR REPLACE FUNCTION public.can_award_scholarship(p_enrollment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.hub_members hm
      WHERE hm.user_id = auth.uid() AND hm.hub_role = 'manager' AND hm.hub_id = public._enrollment_hub(p_enrollment_id)
    );
$$;

ALTER TABLE public.scholarships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hub admins read scholarships" ON public.scholarships FOR SELECT
  USING (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

GRANT SELECT ON public.scholarships TO authenticated;
GRANT ALL ON public.scholarships TO service_role;

-- Totals follow admin_update_invoice: amount_paid from paid installments, total_amount
-- from the enrollment's non-cancelled invoices.
CREATE OR REPLACE FUNCTION public._recompute_enrollment_totals(p_enrollment_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.enrollments e SET
    total_amount = (SELECT COALESCE(sum(v.total_amount), 0) FROM public.invoices v WHERE v.enrollment_id = e.id AND v.status <> 'cancelled'),
    amount_paid = (SELECT COALESCE(sum(i.amount), 0) FROM public.invoices v JOIN public.installments i ON i.invoice_id = v.id
                   WHERE v.enrollment_id = e.id AND v.status <> 'cancelled' AND i.status = 'paid')
  WHERE e.id = p_enrollment_id;
$$;

CREATE OR REPLACE FUNCTION public.award_scholarship(p_enrollment_id uuid, p_amount numeric, p_reason text, p_funded_by text DEFAULT 'FutureLabs')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _left numeric := p_amount;
  _applied numeric := 0;
  _cut numeric;
  _inst record;
  _id uuid;
BEGIN
  IF NOT public.can_award_scholarship(p_enrollment_id) THEN
    RAISE EXCEPTION 'Only the CEO or a training manager can award a scholarship';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Enter the scholarship amount'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Give a reason for the scholarship'; END IF;
  IF EXISTS (SELECT 1 FROM public.scholarships WHERE enrollment_id = p_enrollment_id AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'This student already has a scholarship. Revoke it first to change the amount.';
  END IF;

  FOR _inst IN
    SELECT i.id, i.amount, i.invoice_id FROM public.installments i JOIN public.invoices v ON v.id = i.invoice_id
    WHERE v.enrollment_id = p_enrollment_id AND v.status <> 'cancelled' AND i.status <> 'paid'
    ORDER BY i.due_date DESC, i.created_at DESC
    FOR UPDATE OF i
  LOOP
    EXIT WHEN _left <= 0;
    _cut := least(_left, _inst.amount);
    IF _inst.amount - _cut > 0 AND _inst.amount - _cut < 1000 THEN
      RAISE EXCEPTION 'That would leave ₦% on an installment, under the ₦1,000 minimum. Award ₦% more or ₦% less.',
        _inst.amount - _cut, _inst.amount - _cut, 1000 - (_inst.amount - _cut);
    END IF;
    IF _cut = _inst.amount THEN
      DELETE FROM public.installments WHERE id = _inst.id;
    ELSE
      UPDATE public.installments SET amount = amount - _cut WHERE id = _inst.id;
    END IF;
    UPDATE public.invoices SET total_amount = total_amount - _cut WHERE id = _inst.invoice_id;
    _left := _left - _cut;
    _applied := _applied + _cut;
  END LOOP;

  -- An invoice with nothing left to pay is paid; one with nothing on it at all is void.
  UPDATE public.invoices v SET status = CASE
      WHEN EXISTS (SELECT 1 FROM public.installments i WHERE i.invoice_id = v.id) THEN 'paid' ELSE 'cancelled' END
  WHERE v.enrollment_id = p_enrollment_id AND v.status <> 'cancelled'
    AND NOT EXISTS (SELECT 1 FROM public.installments i WHERE i.invoice_id = v.id AND i.status <> 'paid');

  PERFORM public._recompute_enrollment_totals(p_enrollment_id);

  INSERT INTO public.scholarships (hub_id, enrollment_id, amount, applied_amount, funded_by, reason, awarded_by)
  VALUES (public._enrollment_hub(p_enrollment_id), p_enrollment_id, p_amount, _applied,
          coalesce(nullif(trim(p_funded_by), ''), 'FutureLabs'), trim(p_reason), auth.uid())
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'award_scholarship', 'enrollment', p_enrollment_id,
          jsonb_build_object('scholarship_id', _id, 'amount', p_amount, 'applied_amount', _applied, 'funded_by', p_funded_by, 'reason', p_reason));
  RETURN _id;
END;
$$;

-- Revoking puts the waived balance back as one installment due in 7 days.
CREATE OR REPLACE FUNCTION public.revoke_scholarship(p_scholarship_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.scholarships;
  _invoice uuid;
BEGIN
  SELECT * INTO s FROM public.scholarships WHERE id = p_scholarship_id AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scholarship not found'; END IF;
  IF NOT public.can_award_scholarship(s.enrollment_id) THEN
    RAISE EXCEPTION 'Only the CEO or a training manager can revoke a scholarship';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Give a reason for revoking'; END IF;

  IF s.applied_amount > 0 THEN
    SELECT id INTO _invoice FROM public.invoices
    WHERE enrollment_id = s.enrollment_id ORDER BY (status <> 'cancelled') DESC, created_at DESC LIMIT 1;
    UPDATE public.invoices SET total_amount = total_amount + s.applied_amount, status = 'active' WHERE id = _invoice;
    INSERT INTO public.installments (invoice_id, amount, due_date, status)
    VALUES (_invoice, s.applied_amount, (now() AT TIME ZONE 'Africa/Lagos')::date + 7, 'pending');
    PERFORM public._recompute_enrollment_totals(s.enrollment_id);
  END IF;

  UPDATE public.scholarships SET revoked_at = clock_timestamp(), revoked_by = auth.uid(), revoke_reason = trim(p_reason) WHERE id = s.id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'revoke_scholarship', 'enrollment', s.enrollment_id,
          jsonb_build_object('scholarship_id', s.id, 'restored_amount', s.applied_amount, 'reason', p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.list_scholarships(p_include_revoked boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(x ORDER BY x.awarded_at DESC), '[]'::jsonb) FROM (
    SELECT s.id, s.enrollment_id, s.amount, s.applied_amount, s.funded_by, s.reason, s.awarded_at, s.revoked_at, s.revoke_reason,
           e.full_name AS student_name, p.program_name, c.cohort_label,
           COALESCE(e.outstanding_balance, 0) AS outstanding,
           (SELECT pr.full_name FROM public.profiles pr WHERE pr.user_id = s.awarded_by) AS awarded_by_name,
           public.can_award_scholarship(s.enrollment_id) AS can_manage
    FROM public.scholarships s
    JOIN public.enrollments e ON e.id = s.enrollment_id
    JOIN public.programs p ON p.id = e.program_id
    LEFT JOIN public.cohorts c ON c.id = e.cohort_id
    WHERE (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND s.hub_id = public.get_my_hub_id()))
      AND (p_include_revoked OR s.revoked_at IS NULL)
  ) x;
$$;

REVOKE ALL ON FUNCTION public._recompute_enrollment_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_award_scholarship(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.award_scholarship(uuid, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_scholarship(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_scholarships(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_award_scholarship(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_scholarship(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_scholarship(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_scholarships(boolean) TO authenticated;
