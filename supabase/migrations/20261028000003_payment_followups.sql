-- Payment follow-up: what staff did about an unpaid balance, kept per enrollment.
--   * called / whatsapp / note: a contact attempt, shown as "last contact".
--   * promise: the student agreed to pay promised_amount by promised_date. Until
--     that date passes, overdue reminder emails to them stop (check-due-reminders
--     asks payment_reminder_holds), so nobody is chased for money already agreed.
--   * written_off: staff stop chasing the balance. Only collections status: it
--     changes no invoice, installment or revenue figure. reopened undoes it.

CREATE TABLE IF NOT EXISTS public.payment_followups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id           uuid REFERENCES public.hubs(id) ON DELETE CASCADE,
  enrollment_id    uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('called', 'whatsapp', 'note', 'promise', 'written_off', 'reopened')),
  note             text,
  promised_amount  numeric CHECK (promised_amount IS NULL OR promised_amount > 0),
  promised_date    date,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (kind <> 'promise' OR promised_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_payment_followups_enrollment ON public.payment_followups (enrollment_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_payment_followups_set_hub_id ON public.payment_followups;
CREATE TRIGGER trg_payment_followups_set_hub_id
  BEFORE INSERT ON public.payment_followups
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

ALTER TABLE public.payment_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read payment follow-ups" ON public.payment_followups FOR SELECT
  USING (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id()));

GRANT SELECT ON public.payment_followups TO authenticated;
GRANT ALL ON public.payment_followups TO service_role;

-- Collections state per enrollment: the latest promise / write-off decision.
CREATE OR REPLACE FUNCTION public._payment_followup_state(p_hub_id uuid)
RETURNS TABLE (
  enrollment_id    uuid,
  last_kind        text,
  last_note        text,
  last_at          timestamptz,
  last_by          text,
  promised_amount  numeric,
  promised_date    date,
  promise_active   boolean,
  promise_broken   boolean,
  written_off      boolean,
  contacts         integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH f AS (
    SELECT * FROM public.payment_followups WHERE p_hub_id IS NULL OR hub_id = p_hub_id
  ),
  latest AS (
    SELECT DISTINCT ON (f.enrollment_id) f.enrollment_id, f.kind, f.note, f.created_at, f.created_by
    FROM f ORDER BY f.enrollment_id, f.created_at DESC
  ),
  decision AS (
    SELECT DISTINCT ON (f.enrollment_id) f.enrollment_id, f.kind, f.promised_amount, f.promised_date
    FROM f WHERE f.kind IN ('promise', 'written_off', 'reopened')
    ORDER BY f.enrollment_id, f.created_at DESC
  ),
  today AS (SELECT (now() AT TIME ZONE 'Africa/Lagos')::date AS d)
  SELECT l.enrollment_id, l.kind, l.note, l.created_at,
         COALESCE(NULLIF(trim(p.full_name), ''), p.email),
         CASE WHEN d.kind = 'promise' THEN d.promised_amount END,
         CASE WHEN d.kind = 'promise' THEN d.promised_date END,
         COALESCE(d.kind = 'promise' AND d.promised_date >= today.d, false),
         COALESCE(d.kind = 'promise' AND d.promised_date < today.d, false),
         COALESCE(d.kind = 'written_off', false),
         (SELECT count(*)::integer FROM f WHERE f.enrollment_id = l.enrollment_id AND f.kind IN ('called', 'whatsapp'))
  FROM latest l
  CROSS JOIN today
  LEFT JOIN decision d ON d.enrollment_id = l.enrollment_id
  LEFT JOIN public.profiles p ON p.user_id = l.created_by;
$$;

REVOKE ALL ON FUNCTION public._payment_followup_state(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_payment_followup_state()
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
  RETURN QUERY SELECT to_jsonb(s) FROM public._payment_followup_state(public.get_my_hub_id()) s;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_payment_followup(
  p_enrollment_id   uuid,
  p_kind            text,
  p_note            text DEFAULT NULL,
  p_promised_amount numeric DEFAULT NULL,
  p_promised_date   date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub uuid;
  _id  uuid;
BEGIN
  SELECT p.hub_id INTO _hub FROM public.enrollments e JOIN public.programs p ON p.id = e.program_id WHERE e.id = p_enrollment_id;
  IF _hub IS NULL OR NOT (public.is_superadmin() OR (public.has_role(auth.uid(), 'admin'::app_role) AND _hub = public.get_my_hub_id())) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF p_kind = 'promise' AND (p_promised_date IS NULL OR p_promised_date < (now() AT TIME ZONE 'Africa/Lagos')::date) THEN
    RAISE EXCEPTION 'A promise needs a date that is today or later';
  END IF;

  INSERT INTO public.payment_followups (hub_id, enrollment_id, kind, note, promised_amount, promised_date, created_by)
  VALUES (_hub, p_enrollment_id, p_kind, NULLIF(trim(p_note), ''),
          CASE WHEN p_kind = 'promise' THEN p_promised_amount END,
          CASE WHEN p_kind = 'promise' THEN p_promised_date END,
          auth.uid())
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'payment_followup_' || p_kind, 'enrollment', p_enrollment_id,
          jsonb_strip_nulls(jsonb_build_object('note', p_note, 'promised_amount', p_promised_amount, 'promised_date', p_promised_date)));
  RETURN _id;
END;
$$;

-- For check-due-reminders: enrollments whose overdue emails are on hold.
CREATE OR REPLACE FUNCTION public.payment_reminder_holds(p_enrollment_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.enrollment_id FROM public._payment_followup_state(NULL) s
  WHERE s.enrollment_id = ANY (p_enrollment_ids) AND (s.promise_active OR s.written_off);
$$;

REVOKE ALL ON FUNCTION public.get_payment_followup_state() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_payment_followup(uuid, text, text, numeric, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_reminder_holds(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_followup_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_payment_followup(uuid, text, text, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payment_reminder_holds(uuid[]) TO service_role;
