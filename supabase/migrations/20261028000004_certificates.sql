-- Certificates of completion, issued one student at a time by someone who can
-- vouch for them: the CEO (superadmin), a training manager (hub_members.hub_role
-- = 'manager') of the student's hub, or a tutor of the student's cohort (its
-- primary tutor, or teaching staff of its classroom). Hub admins can see
-- certificates but not issue them. Never automatic.
--   * Names are snapshotted at issue so the certificate reads the same forever;
--     the issuer may correct the spelling of the student's name when issuing.
--   * Every certificate has a public code; /certificate/<code> shows and verifies
--     it (verify_certificate is callable without signing in). Revoked ones say so.
--   * One live certificate per enrollment; revoke to reissue.

CREATE TABLE IF NOT EXISTS public.certificates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id          uuid REFERENCES public.hubs(id) ON DELETE CASCADE,
  enrollment_id   uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  cohort_id       uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,
  student_id      uuid,
  code            text NOT NULL UNIQUE,
  student_name    text NOT NULL CHECK (length(trim(student_name)) > 0),
  program_name    text NOT NULL,
  cohort_label    text,
  completed_on    date,
  issued_at       timestamptz NOT NULL DEFAULT now(),
  issued_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_by_name  text,
  emailed_at      timestamptz,
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason   text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_certificates_live_enrollment ON public.certificates (enrollment_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_certificates_student ON public.certificates (student_id);

DROP TRIGGER IF EXISTS trg_certificates_set_hub_id ON public.certificates;
CREATE TRIGGER trg_certificates_set_hub_id
  BEFORE INSERT ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

-- The cohort an enrollment studies in: its own cohort_id, else its cohort_students row.
CREATE OR REPLACE FUNCTION public._enrollment_cohort(p_enrollment_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT e.cohort_id FROM public.enrollments e WHERE e.id = p_enrollment_id),
    (SELECT cs.cohort_id FROM public.cohort_students cs WHERE cs.enrollment_id = p_enrollment_id ORDER BY cs.joined_at DESC LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_issue_certificate(p_enrollment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.programs p ON p.id = e.program_id
      JOIN public.hub_members hm ON hm.hub_id = p.hub_id AND hm.user_id = auth.uid() AND hm.hub_role = 'manager'
      WHERE e.id = p_enrollment_id
    )
    OR EXISTS (
      SELECT 1 FROM public.cohorts c
      WHERE c.id = public._enrollment_cohort(p_enrollment_id)
        AND (
          (c.primary_tutor_id IS NOT NULL AND auth.uid() = ANY (public.staff_user_ids(c.primary_tutor_id)))
          OR EXISTS (
            SELECT 1 FROM public.classroom_staff st
            WHERE st.classroom_id = c.classroom_id AND st.user_id = auth.uid()
              AND st.status = 'active' AND st.staff_type = 'teaching'
          )
        )
    );
$$;

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read their certificates" ON public.certificates FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Admins and issuers read certificates" ON public.certificates FOR SELECT
  USING (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
    OR public.can_issue_certificate(enrollment_id)
  );

GRANT SELECT ON public.certificates TO authenticated;
GRANT ALL ON public.certificates TO service_role;

-- Certificate state and whether the caller may issue, for a list of enrollments.
CREATE OR REPLACE FUNCTION public.get_certificates_for(p_enrollment_ids uuid[])
RETURNS TABLE (enrollment_id uuid, certificate_id uuid, code text, issued_at timestamptz, issued_by_name text, emailed_at timestamptz, can_issue boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, c.id, c.code, c.issued_at, c.issued_by_name, c.emailed_at, public.can_issue_certificate(e.id)
  FROM unnest(p_enrollment_ids) AS ids(id)
  JOIN public.enrollments e ON e.id = ids.id
  JOIN public.programs p ON p.id = e.program_id
  LEFT JOIN public.certificates c ON c.enrollment_id = e.id AND c.revoked_at IS NULL
  WHERE public.is_superadmin()
     OR (public.has_role(auth.uid(), 'admin'::app_role) AND p.hub_id = public.get_my_hub_id())
     OR public.can_issue_certificate(e.id);
$$;

CREATE OR REPLACE FUNCTION public.issue_certificate(p_enrollment_id uuid, p_student_name text DEFAULT NULL)
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
BEGIN
  IF NOT public.can_issue_certificate(p_enrollment_id) THEN
    RAISE EXCEPTION 'Only the CEO, a training manager or the class tutor can issue certificates';
  END IF;
  IF EXISTS (SELECT 1 FROM public.certificates WHERE enrollment_id = p_enrollment_id AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'This student already has a certificate for this programme';
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
                                   cohort_label, completed_on, issued_by, issued_by_name)
  VALUES (_e.hub_id, p_enrollment_id, _cohort.id, _e.user_id, _code,
          regexp_replace(trim(COALESCE(NULLIF(trim(p_student_name), ''), _e.display_name)), '\s+', ' ', 'g'), _e.program_name,
          _cohort.cohort_label, COALESCE(LEAST(_cohort.end_date, (now() AT TIME ZONE 'Africa/Lagos')::date), (now() AT TIME ZONE 'Africa/Lagos')::date),
          auth.uid(), _issuer)
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'certificate_issued', 'enrollment', p_enrollment_id, jsonb_build_object('certificate_id', _id, 'code', _code));

  PERFORM public.notify_users(ARRAY[_e.user_id], 'certificate_issued',
    'Your certificate is ready',
    'Congratulations! Your certificate for ' || _e.program_name || ' has been issued. View, download or share it any time.',
    '/certificate/' || _code, _e.hub_id, _id);
  RETURN _id;
END;
$$;

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
  IF _c.id IS NULL OR NOT public.can_issue_certificate(_c.enrollment_id) THEN
    RAISE EXCEPTION 'Only the CEO, a training manager or the class tutor can revoke certificates';
  END IF;
  IF COALESCE(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Give a reason for revoking'; END IF;
  UPDATE public.certificates SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = trim(p_reason)
   WHERE id = p_certificate_id AND revoked_at IS NULL;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'certificate_revoked', 'enrollment', _c.enrollment_id,
          jsonb_build_object('certificate_id', _c.id, 'code', _c.code, 'reason', trim(p_reason)));
END;
$$;

-- Public: anyone with the code (an employer, the student) can view and verify.
CREATE OR REPLACE FUNCTION public.verify_certificate(p_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'code', c.code, 'student_name', c.student_name, 'program_name', c.program_name,
    'cohort_label', c.cohort_label, 'completed_on', c.completed_on, 'issued_at', c.issued_at,
    'issued_by_name', c.issued_by_name, 'hub_name', h.name, 'hub_logo_url', h.logo_url,
    'revoked', c.revoked_at IS NOT NULL, 'revoked_at', c.revoked_at)
  FROM public.certificates c
  LEFT JOIN public.hubs h ON h.id = c.hub_id
  WHERE c.code = upper(trim(p_code));
$$;

REVOKE ALL ON FUNCTION public._enrollment_cohort(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_issue_certificate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_certificates_for(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_certificate(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_certificate(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_issue_certificate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_certificates_for(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_certificate(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_certificate(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO anon, authenticated;
