-- Meta only lets a business start WhatsApp conversations with people who agreed to
-- hear from it there. NULL = never asked, true/false = their answer; the *_at columns
-- record when it was given, stamped by the database rather than trusted from the client.
-- Guardians are asked separately: the student typed their number in, they never opted in.
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS guardian_contact_opt_in boolean,
  ADD COLUMN IF NOT EXISTS guardian_contact_opt_in_at timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_whatsapp_consent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.whatsapp_opt_in_at := CASE WHEN NEW.whatsapp_opt_in IS NULL THEN NULL ELSE now() END;
    NEW.guardian_contact_opt_in_at := CASE WHEN NEW.guardian_contact_opt_in IS NULL THEN NULL ELSE now() END;
  ELSE
    IF NEW.whatsapp_opt_in IS DISTINCT FROM OLD.whatsapp_opt_in THEN NEW.whatsapp_opt_in_at := now();
    ELSE NEW.whatsapp_opt_in_at := OLD.whatsapp_opt_in_at; END IF;
    IF NEW.guardian_contact_opt_in IS DISTINCT FROM OLD.guardian_contact_opt_in THEN NEW.guardian_contact_opt_in_at := now();
    ELSE NEW.guardian_contact_opt_in_at := OLD.guardian_contact_opt_in_at; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_whatsapp_consent ON public.enrollments;
CREATE TRIGGER trg_stamp_whatsapp_consent
  BEFORE INSERT OR UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_whatsapp_consent();

-- The signed-in student's answer, across their live enrollments.
CREATE OR REPLACE FUNCTION public.my_whatsapp_consent()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'has_enrollment', count(*) > 0,
    'asked', count(*) > 0 AND bool_and(e.whatsapp_opt_in IS NOT NULL),
    'whatsapp', COALESCE(bool_or(e.whatsapp_opt_in), false),
    'guardian', COALESCE(bool_or(e.guardian_contact_opt_in), false),
    'phone', max(e.phone),
    'guardian_phone', max(NULLIF(trim(e.guardian_phone), '')))
  FROM public.enrollments e
  WHERE e.user_id = auth.uid() AND e.enrollment_status NOT IN ('cancelled', 'withdrawn');
$$;

CREATE OR REPLACE FUNCTION public.set_my_whatsapp_consent(p_whatsapp boolean, p_guardian boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  UPDATE public.enrollments SET whatsapp_opt_in = p_whatsapp, guardian_contact_opt_in = p_guardian
   WHERE user_id = auth.uid() AND enrollment_status NOT IN ('cancelled', 'withdrawn');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Outreach to students who dropped off must honour the same consent.
DROP FUNCTION IF EXISTS public.claim_dropout_outreach();
CREATE FUNCTION public.claim_dropout_outreach()
RETURNS TABLE (case_id uuid, token text, email text, full_name text, phone text, program_name text,
               cohort_label text, next_cohort_label text, next_cohort_start date, hub_name text, reply_to text,
               message_no integer, whatsapp_ok boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT d.id FROM public.dropout_cases d
    WHERE d.status = 'open'
      AND (d.messages_sent = 0 OR (d.messages_sent = 1 AND d.last_messaged_at < now() - interval '7 days'))
    FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.dropout_cases d SET messages_sent = d.messages_sent + 1, last_messaged_at = now()
      FROM due WHERE d.id = due.id
    RETURNING d.*
  )
  SELECT u.id, u.token, e.email, COALESCE(NULLIF(trim(pr.full_name), ''), e.full_name), e.phone, p.program_name,
         co.cohort_label, nc.cohort_label, nc.start_date, h.name, h.contact_email, u.messages_sent,
         COALESCE(e.whatsapp_opt_in, false)
  FROM upd u
  JOIN public.enrollments e ON e.id = u.enrollment_id
  JOIN public.programs p ON p.id = e.program_id
  JOIN public.cohorts co ON co.id = u.cohort_id
  LEFT JOIN public.cohorts nc ON nc.id = u.next_cohort_id
  LEFT JOIN public.hubs h ON h.id = u.hub_id
  LEFT JOIN public.profiles pr ON pr.user_id = e.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_dropout_outreach() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_dropout_outreach() TO service_role;
REVOKE ALL ON FUNCTION public.my_whatsapp_consent() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_my_whatsapp_consent(boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_whatsapp_consent() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_whatsapp_consent(boolean, boolean) TO authenticated;
