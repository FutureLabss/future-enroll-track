-- Certificates now go through a request and an approval (decided 2026-10-28):
--   * Request: the class tutor, a training manager, or a hub admin of the student's hub.
--   * Approve: the CEO (superadmin) or a training manager. Either one is enough, so
--     neither is a bottleneck; when one of them asks, it is issued at once.
--   * Fees: nothing is requested or issued while the enrollment has an outstanding
--     balance, except by the CEO, who must record why (scholarship, agreed write-off).
-- The balance is enrollments.outstanding_balance, the same figure check-due-reminders
-- trusts: the verify flow can mark an enrollment paid without updating installments.

ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS request_id          uuid,
  ADD COLUMN IF NOT EXISTS fee_override_reason text;

CREATE TABLE IF NOT EXISTS public.certificate_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id              uuid REFERENCES public.hubs(id) ON DELETE CASCADE,
  enrollment_id       uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  student_name        text NOT NULL CHECK (length(trim(student_name)) > 0),
  note                text,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  requested_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at          timestamptz,
  decision_note       text,
  certificate_id      uuid REFERENCES public.certificates(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_certificate_requests_pending ON public.certificate_requests (enrollment_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_certificate_requests_hub ON public.certificate_requests (hub_id, status, requested_at DESC);

DROP TRIGGER IF EXISTS trg_certificate_requests_set_hub_id ON public.certificate_requests;
CREATE TRIGGER trg_certificate_requests_set_hub_id
  BEFORE INSERT ON public.certificate_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

CREATE OR REPLACE FUNCTION public._enrollment_hub(p_enrollment_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.hub_id FROM public.enrollments e JOIN public.programs p ON p.id = e.program_id WHERE e.id = p_enrollment_id;
$$;

CREATE OR REPLACE FUNCTION public._enrollment_outstanding(p_enrollment_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(0, COALESCE(outstanding_balance, total_amount - amount_paid, 0)) FROM public.enrollments WHERE id = p_enrollment_id;
$$;

CREATE OR REPLACE FUNCTION public.can_approve_certificate(p_enrollment_id uuid)
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

CREATE OR REPLACE FUNCTION public.can_request_certificate(p_enrollment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_issue_certificate(p_enrollment_id)
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND public.get_my_hub_id() = public._enrollment_hub(p_enrollment_id));
$$;

ALTER TABLE public.certificate_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requesters and approvers read certificate requests" ON public.certificate_requests FOR SELECT
  USING (public.is_superadmin() OR requested_by = auth.uid() OR public.can_request_certificate(enrollment_id));

GRANT SELECT ON public.certificate_requests TO authenticated;
GRANT ALL ON public.certificate_requests TO service_role;

-- The issuing itself, shared by a direct issue and an approval. Callers check permission.
CREATE OR REPLACE FUNCTION public._issue_certificate(p_enrollment_id uuid, p_student_name text, p_fee_override text, p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _e       record;
  _cohort  public.cohorts;
  _id      uuid;
  _code    text;
  _issuer  text;
  _owed    numeric := public._enrollment_outstanding(p_enrollment_id);
BEGIN
  IF EXISTS (SELECT 1 FROM public.certificates WHERE enrollment_id = p_enrollment_id AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'This student already has a certificate for this programme';
  END IF;
  IF _owed > 0 THEN
    IF NOT public.is_superadmin() THEN
      RAISE EXCEPTION '%', 'This student still owes ₦' || to_char(_owed, 'FM999,999,999')
        || '. Certificates are issued once all fees are cleared; only the CEO can make an exception.';
    ELSIF COALESCE(trim(p_fee_override), '') = '' THEN
      RAISE EXCEPTION '%', 'This student still owes ₦' || to_char(_owed, 'FM999,999,999') || '. Give a reason to issue anyway.';
    END IF;
  END IF;

  SELECT e.id, e.user_id, e.full_name, p.program_name, p.hub_id,
         COALESCE(NULLIF(trim(pr.full_name), ''), e.full_name) AS display_name
    INTO _e
  FROM public.enrollments e
  JOIN public.programs p ON p.id = e.program_id
  LEFT JOIN public.profiles pr ON pr.user_id = e.user_id
  WHERE e.id = p_enrollment_id;

  SELECT * INTO _cohort FROM public.cohorts WHERE id = public._enrollment_cohort(p_enrollment_id);
  SELECT NULLIF(trim(full_name), '') INTO _issuer FROM public.profiles WHERE user_id = auth.uid();

  LOOP
    _code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.certificates WHERE code = _code);
  END LOOP;

  INSERT INTO public.certificates (hub_id, enrollment_id, cohort_id, student_id, code, student_name, program_name,
                                   cohort_label, completed_on, issued_by, issued_by_name, request_id, fee_override_reason)
  VALUES (_e.hub_id, p_enrollment_id, _cohort.id, _e.user_id, _code,
          regexp_replace(trim(COALESCE(NULLIF(trim(p_student_name), ''), _e.display_name)), '\s+', ' ', 'g'), _e.program_name,
          _cohort.cohort_label, COALESCE(LEAST(_cohort.end_date, (now() AT TIME ZONE 'Africa/Lagos')::date), (now() AT TIME ZONE 'Africa/Lagos')::date),
          auth.uid(), _issuer, p_request_id, CASE WHEN _owed > 0 THEN trim(p_fee_override) END)
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'certificate_issued', 'enrollment', p_enrollment_id,
          jsonb_strip_nulls(jsonb_build_object('certificate_id', _id, 'code', _code, 'request_id', p_request_id,
            'outstanding', NULLIF(_owed, 0), 'fee_override_reason', CASE WHEN _owed > 0 THEN trim(p_fee_override) END)));

  PERFORM public.notify_users(ARRAY[_e.user_id], 'certificate_issued',
    'Your certificate is ready',
    'Congratulations! Your certificate for ' || _e.program_name || ' has been issued. View, download or share it any time.',
    '/certificate/' || _code, _e.hub_id, _id);
  RETURN _id;
END;
$$;

-- A direct issue, for the CEO or a training manager.
DROP FUNCTION IF EXISTS public.issue_certificate(uuid, text);
CREATE OR REPLACE FUNCTION public.issue_certificate(p_enrollment_id uuid, p_student_name text DEFAULT NULL, p_fee_override text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_approve_certificate(p_enrollment_id) THEN
    RAISE EXCEPTION 'Only the CEO or a training manager can issue a certificate. Request one instead.';
  END IF;
  RETURN public._issue_certificate(p_enrollment_id, p_student_name, p_fee_override, NULL);
END;
$$;

-- Returns the request id, or the certificate id when the requester can approve (issued at once).
CREATE OR REPLACE FUNCTION public.request_certificate(p_enrollment_id uuid, p_student_name text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub   uuid := public._enrollment_hub(p_enrollment_id);
  _owed  numeric := public._enrollment_outstanding(p_enrollment_id);
  _id    uuid;
  _who   text;
  _what  text;
BEGIN
  IF NOT public.can_request_certificate(p_enrollment_id) THEN
    RAISE EXCEPTION 'Only the class tutor, a training manager or a hub admin can request a certificate';
  END IF;
  IF public.can_approve_certificate(p_enrollment_id) THEN
    RETURN jsonb_build_object('certificate_id', public._issue_certificate(p_enrollment_id, p_student_name, NULL, NULL));
  END IF;
  IF _owed > 0 THEN
    RAISE EXCEPTION '%', 'This student still owes ₦' || to_char(_owed, 'FM999,999,999')
      || '. Certificates are issued once all fees are cleared; only the CEO can make an exception.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.certificates WHERE enrollment_id = p_enrollment_id AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'This student already has a certificate for this programme';
  END IF;
  IF EXISTS (SELECT 1 FROM public.certificate_requests WHERE enrollment_id = p_enrollment_id AND status = 'pending') THEN
    RAISE EXCEPTION 'A certificate has already been requested for this student and is waiting for approval';
  END IF;

  INSERT INTO public.certificate_requests (hub_id, enrollment_id, student_name, note, requested_by)
  VALUES (_hub, p_enrollment_id, regexp_replace(trim(p_student_name), '\s+', ' ', 'g'), NULLIF(trim(p_note), ''), auth.uid())
  RETURNING id INTO _id;

  SELECT COALESCE(NULLIF(trim(full_name), ''), email) INTO _who FROM public.profiles WHERE user_id = auth.uid();
  SELECT p.program_name INTO _what FROM public.enrollments e JOIN public.programs p ON p.id = e.program_id WHERE e.id = p_enrollment_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'certificate_requested', 'enrollment', p_enrollment_id, jsonb_build_object('request_id', _id));

  PERFORM public.notify_users(
    ARRAY(
      SELECT u.id FROM auth.users u WHERE public.is_superadmin(u.id)
      UNION
      SELECT hm.user_id FROM public.hub_members hm WHERE hm.hub_id = _hub AND hm.hub_role = 'manager'
    ),
    'certificate_requested',
    'Certificate approval needed',
    COALESCE(_who, 'A staff member') || ' requested a ' || COALESCE(_what, '') || ' certificate for ' || trim(p_student_name) || '.',
    '/admin/certificates', _hub, _id);
  RETURN jsonb_build_object('request_id', _id);
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_certificate_request(
  p_request_id     uuid,
  p_approve        boolean,
  p_note           text DEFAULT NULL,
  p_student_name   text DEFAULT NULL,
  p_fee_override   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r     public.certificate_requests;
  _cert  uuid;
BEGIN
  SELECT * INTO _r FROM public.certificate_requests WHERE id = p_request_id FOR UPDATE;
  IF _r.id IS NULL OR NOT public.can_approve_certificate(_r.enrollment_id) THEN
    RAISE EXCEPTION 'Only the CEO or a training manager can approve certificates';
  END IF;
  IF _r.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been %', _r.status;
  END IF;

  IF p_approve THEN
    _cert := public._issue_certificate(_r.enrollment_id, COALESCE(NULLIF(trim(p_student_name), ''), _r.student_name), p_fee_override, _r.id);
  ELSIF COALESCE(trim(p_note), '') = '' THEN
    RAISE EXCEPTION 'Say why the request is declined';
  END IF;

  UPDATE public.certificate_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END,
         decided_by = auth.uid(), decided_at = now(), decision_note = NULLIF(trim(p_note), ''), certificate_id = _cert
   WHERE id = _r.id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), CASE WHEN p_approve THEN 'certificate_request_approved' ELSE 'certificate_request_declined' END,
          'enrollment', _r.enrollment_id, jsonb_strip_nulls(jsonb_build_object('request_id', _r.id, 'note', p_note)));

  PERFORM public.notify_users(ARRAY[_r.requested_by],
    CASE WHEN p_approve THEN 'certificate_request_approved' ELSE 'certificate_request_declined' END,
    CASE WHEN p_approve THEN 'Certificate approved' ELSE 'Certificate request declined' END,
    'Your request for ' || _r.student_name || '''s certificate was ' || CASE WHEN p_approve THEN 'approved and issued.' ELSE 'declined: ' || trim(p_note) END,
    '/admin/certificates', _r.hub_id, _r.id);
  RETURN _cert;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_certificate_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.certificate_requests SET status = 'cancelled', decided_by = auth.uid(), decided_at = now()
   WHERE id = p_request_id AND status = 'pending'
     AND (requested_by = auth.uid() OR public.can_approve_certificate(enrollment_id));
  IF NOT FOUND THEN RAISE EXCEPTION 'Not allowed'; END IF;
END;
$$;

-- Revoking is now for approvers only.
CREATE OR REPLACE FUNCTION public.revoke_certificate(p_certificate_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _c public.certificates;
BEGIN
  SELECT * INTO _c FROM public.certificates WHERE id = p_certificate_id;
  IF _c.id IS NULL OR NOT public.can_approve_certificate(_c.enrollment_id) THEN
    RAISE EXCEPTION 'Only the CEO or a training manager can revoke certificates';
  END IF;
  IF COALESCE(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Give a reason for revoking'; END IF;
  UPDATE public.certificates SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = trim(p_reason)
   WHERE id = p_certificate_id AND revoked_at IS NULL;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'certificate_revoked', 'enrollment', _c.enrollment_id,
          jsonb_build_object('certificate_id', _c.id, 'code', _c.code, 'reason', trim(p_reason)));
END;
$$;

-- Per enrollment: the live certificate, any pending request, the balance, and what
-- the caller may do.
DROP FUNCTION IF EXISTS public.get_certificates_for(uuid[]);
CREATE OR REPLACE FUNCTION public.get_certificates_for(p_enrollment_ids uuid[])
RETURNS TABLE (
  enrollment_id     uuid,
  certificate_id    uuid,
  code              text,
  issued_at         timestamptz,
  issued_by_name    text,
  emailed_at        timestamptz,
  request_id        uuid,
  requested_at      timestamptz,
  requested_by_name text,
  outstanding       numeric,
  can_request       boolean,
  can_approve       boolean,
  is_ceo            boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, c.id, c.code, c.issued_at, c.issued_by_name, c.emailed_at,
         r.id, r.requested_at, COALESCE(NULLIF(trim(rp.full_name), ''), rp.email),
         public._enrollment_outstanding(e.id),
         public.can_request_certificate(e.id), public.can_approve_certificate(e.id), public.is_superadmin()
  FROM unnest(p_enrollment_ids) AS ids(id)
  JOIN public.enrollments e ON e.id = ids.id
  LEFT JOIN public.certificates c ON c.enrollment_id = e.id AND c.revoked_at IS NULL
  LEFT JOIN public.certificate_requests r ON r.enrollment_id = e.id AND r.status = 'pending'
  LEFT JOIN public.profiles rp ON rp.user_id = r.requested_by
  WHERE public.is_superadmin()
     OR (public.has_role(auth.uid(), 'admin'::app_role) AND public._enrollment_hub(e.id) = public.get_my_hub_id())
     OR public.can_issue_certificate(e.id);
$$;

-- The approvals page: requests in the caller's hub (all hubs for the CEO).
CREATE OR REPLACE FUNCTION public.list_certificate_requests(p_status text DEFAULT 'pending')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)
          OR EXISTS (SELECT 1 FROM public.hub_members WHERE user_id = auth.uid() AND hub_role = 'manager')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x.requested_at DESC) FROM (
      SELECT r.id, r.enrollment_id, r.student_name, r.note, r.status, r.requested_at, r.decided_at, r.decision_note,
             COALESCE(NULLIF(trim(rp.full_name), ''), rp.email) AS requested_by_name,
             COALESCE(NULLIF(trim(dp.full_name), ''), dp.email) AS decided_by_name,
             p.program_name, co.cohort_label, e.email,
             public._enrollment_outstanding(r.enrollment_id) AS outstanding,
             public.can_approve_certificate(r.enrollment_id) AS can_approve,
             r.requested_by = auth.uid() AS mine,
             c.code
      FROM public.certificate_requests r
      JOIN public.enrollments e ON e.id = r.enrollment_id
      JOIN public.programs p ON p.id = e.program_id
      LEFT JOIN public.cohorts co ON co.id = public._enrollment_cohort(r.enrollment_id)
      LEFT JOIN public.profiles rp ON rp.user_id = r.requested_by
      LEFT JOIN public.profiles dp ON dp.user_id = r.decided_by
      LEFT JOIN public.certificates c ON c.id = r.certificate_id
      WHERE (p_status = 'all' OR r.status = p_status)
        AND (public.is_superadmin() OR r.hub_id = public.get_my_hub_id()
             OR r.requested_by = auth.uid())
      LIMIT 300
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public._enrollment_hub(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._enrollment_outstanding(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._issue_certificate(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_approve_certificate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_request_certificate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_certificate(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_certificate(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_certificate_request(uuid, boolean, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_certificate_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_certificates_for(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_certificate_requests(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_approve_certificate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_request_certificate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_certificate(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_certificate(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_certificate_request(uuid, boolean, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_certificate_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_certificates_for(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_certificate_requests(text) TO authenticated;
