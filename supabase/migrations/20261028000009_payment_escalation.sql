-- Overdue payments: an escalating sequence instead of the same email every day
-- (Oct 2026: 27 students got ~23 identical overdue emails each in 30 days).
--   * Steps, by days past the oldest unpaid due date: 1, 3, 7, 10, 14, 21, 30, 37,
--     44, 51, 60, then every 14 days. One message per step per installment, so a
--     missed cron run sends only the latest step, never a burst.
--   * Day 30: classroom access pauses (payment_access_paused) until they pay, a staff
--     member logs a promise to pay, or the balance is written off, but never sooner
--     than 7 days after a warning (step 7+) naming the date. Students already past
--     day 30 at go-live are warned first and paused a week later. The guardian on the
--     enrollment is contacted from day 30 (WhatsApp, once configured).
--   * Automatic messages stop 90 days past due, as before; older balances (24 in
--     Oct 2026, many 100-400 days) are for staff to chase from the Outstanding page.
--   * No messages while a promise stands, after a write-off, or after the student
--     formally withdrew (dropout_cases, next migration).
-- check-due-reminders reads overdue_escalations_due and records each send.

CREATE TABLE IF NOT EXISTS public.payment_escalations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id          uuid REFERENCES public.hubs(id) ON DELETE CASCADE,
  enrollment_id   uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  installment_id  uuid NOT NULL REFERENCES public.installments(id) ON DELETE CASCADE,
  stage_day       integer NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (installment_id, stage_day)
);

CREATE INDEX IF NOT EXISTS idx_payment_escalations_enrollment ON public.payment_escalations (enrollment_id, sent_at DESC);

DROP TRIGGER IF EXISTS trg_payment_escalations_set_hub_id ON public.payment_escalations;
CREATE TRIGGER trg_payment_escalations_set_hub_id
  BEFORE INSERT ON public.payment_escalations
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

ALTER TABLE public.payment_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read payment escalations" ON public.payment_escalations FOR SELECT
  USING (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

GRANT SELECT ON public.payment_escalations TO authenticated;
GRANT ALL ON public.payment_escalations TO service_role;

CREATE OR REPLACE FUNCTION public.escalation_stage(p_days_overdue integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_days_overdue < 1 THEN 0
    WHEN p_days_overdue >= 60 THEN 60 + 14 * ((p_days_overdue - 60) / 14)
    ELSE (SELECT max(s) FROM unnest(ARRAY[1, 3, 7, 10, 14, 21, 30, 37, 44, 51]) s WHERE s <= p_days_overdue)
  END;
$$;

-- The oldest unpaid, past-due installment per enrollment that still owes money.
CREATE OR REPLACE FUNCTION public._oldest_overdue()
RETURNS TABLE (enrollment_id uuid, hub_id uuid, invoice_id uuid, installment_id uuid, due_date date, amount numeric, days_overdue integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (e.id) e.id, p.hub_id, i.id, t.id, t.due_date, t.amount,
         ((now() AT TIME ZONE 'Africa/Lagos')::date - t.due_date)::integer
  FROM public.installments t
  JOIN public.invoices i ON i.id = t.invoice_id
  JOIN public.enrollments e ON e.id = i.enrollment_id
  JOIN public.programs p ON p.id = e.program_id
  WHERE t.status <> 'paid'
    AND i.status NOT IN ('paid', 'cancelled')
    AND t.due_date < (now() AT TIME ZONE 'Africa/Lagos')::date
    AND COALESCE(e.outstanding_balance, e.total_amount - e.amount_paid) > 0
  ORDER BY e.id, t.due_date, t.id;
$$;

-- When access pauses: 30 days past due, and at least 7 days after the first warning.
CREATE OR REPLACE FUNCTION public._pause_date(p_installment_id uuid, p_due_date date)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    p_due_date + 30,
    COALESCE((SELECT min(x.sent_at) FROM public.payment_escalations x WHERE x.installment_id = p_installment_id AND x.stage_day >= 7),
             now())::date + 7);
$$;

-- Promise to pay, write-off, or (once dropout_cases exists) a formal withdrawal.
CREATE OR REPLACE FUNCTION public._collections_on_hold(p_enrollment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public._payment_followup_state(NULL) s
             WHERE s.enrollment_id = p_enrollment_id AND (s.promise_active OR s.written_off)) THEN
    RETURN true;
  END IF;
  IF to_regclass('public.dropout_cases') IS NOT NULL THEN
    RETURN EXISTS (SELECT 1 FROM public.dropout_cases d WHERE d.enrollment_id = p_enrollment_id AND d.status = 'withdrawn');
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_access_paused(p_enrollment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public._oldest_overdue() o
           WHERE o.enrollment_id = p_enrollment_id AND o.days_overdue >= 30
             AND EXISTS (SELECT 1 FROM public.payment_escalations x
                         WHERE x.installment_id = o.installment_id AND x.stage_day >= 7)
             AND public._pause_date(o.installment_id, o.due_date) <= (now() AT TIME ZONE 'Africa/Lagos')::date)
     AND NOT public._collections_on_hold(p_enrollment_id);
$$;

-- For check-due-reminders: the next step to send for each overdue enrollment.
CREATE OR REPLACE FUNCTION public.overdue_escalations_due()
RETURNS TABLE (
  enrollment_id   uuid,
  invoice_id      uuid,
  installment_id  uuid,
  due_date        date,
  amount          numeric,
  days_overdue    integer,
  stage_day       integer,
  pause_date      date,
  access_paused   boolean,
  guardian_name   text,
  guardian_phone  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.enrollment_id, o.invoice_id, o.installment_id, o.due_date, o.amount, o.days_overdue,
         public.escalation_stage(o.days_overdue), public._pause_date(o.installment_id, o.due_date),
         public.payment_access_paused(o.enrollment_id),
         NULLIF(trim(e.guardian_name), ''), NULLIF(trim(e.guardian_phone), '')
  FROM public._oldest_overdue() o
  JOIN public.enrollments e ON e.id = o.enrollment_id
  WHERE o.days_overdue <= 90
    AND public.escalation_stage(o.days_overdue) > COALESCE(
          (SELECT max(x.stage_day) FROM public.payment_escalations x WHERE x.installment_id = o.installment_id), 0)
    AND NOT public._collections_on_hold(o.enrollment_id);
$$;

CREATE OR REPLACE FUNCTION public.record_payment_escalation(p_enrollment_id uuid, p_installment_id uuid, p_stage_day integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.payment_escalations (hub_id, enrollment_id, installment_id, stage_day)
  SELECT p.hub_id, p_enrollment_id, p_installment_id, p_stage_day
  FROM public.enrollments e JOIN public.programs p ON p.id = e.program_id WHERE e.id = p_enrollment_id
  ON CONFLICT (installment_id, stage_day) DO NOTHING;
$$;

-- For the signed-in student: their paused enrollments, to lock the classroom.
CREATE OR REPLACE FUNCTION public.my_paused_enrollments()
RETURNS TABLE (enrollment_id uuid, program_id uuid, program_name text, outstanding numeric, due_date date, invoice_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, p.id, p.program_name, COALESCE(e.outstanding_balance, e.total_amount - e.amount_paid), o.due_date, o.invoice_id
  FROM public.enrollments e
  JOIN public.programs p ON p.id = e.program_id
  JOIN public._oldest_overdue() o ON o.enrollment_id = e.id
  WHERE e.user_id = auth.uid() AND public.payment_access_paused(e.id);
$$;

-- For the Outstanding page: guardian, pause and step per enrollment.
CREATE OR REPLACE FUNCTION public.get_collection_details()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY
  SELECT jsonb_build_object(
    'enrollment_id', o.enrollment_id,
    'days_overdue', o.days_overdue,
    'access_paused', public.payment_access_paused(o.enrollment_id),
    'pause_date', public._pause_date(o.installment_id, o.due_date),
    'on_hold', public._collections_on_hold(o.enrollment_id),
    'guardian_name', NULLIF(trim(e.guardian_name), ''),
    'guardian_phone', NULLIF(trim(e.guardian_phone), ''),
    'last_step', (SELECT max(x.stage_day) FROM public.payment_escalations x WHERE x.installment_id = o.installment_id),
    'messages_sent', (SELECT count(*) FROM public.payment_escalations x WHERE x.enrollment_id = o.enrollment_id))
  FROM public._oldest_overdue() o
  JOIN public.enrollments e ON e.id = o.enrollment_id
  WHERE public.is_superadmin() OR o.hub_id = public.get_my_hub_id();
END;
$$;

-- A paused student can't mark themselves present; tutors can still record anyone.
CREATE OR REPLACE FUNCTION public.trg_block_paused_self_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.enrollment_id IS NOT NULL AND auth.uid() IS NOT NULL AND auth.uid() = NEW.student_id
     AND public.payment_access_paused(NEW.enrollment_id) THEN
    RAISE EXCEPTION 'Your classroom access is paused because your payment is more than 30 days overdue. Pay or speak to the front desk to continue.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_paused_self_attendance ON public.attendance_records;
CREATE TRIGGER trg_block_paused_self_attendance
  BEFORE INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_paused_self_attendance();

REVOKE ALL ON FUNCTION public._oldest_overdue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._pause_date(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._collections_on_hold(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.overdue_escalations_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_payment_escalation(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_access_paused(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_paused_enrollments() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_collection_details() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.overdue_escalations_due() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_payment_escalation(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.my_paused_enrollments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_collection_details() TO authenticated;
