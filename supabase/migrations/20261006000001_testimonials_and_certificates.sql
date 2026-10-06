-- Non-coercive testimonial choice and immutable certificate issuance.

CREATE TYPE public.testimonial_decision AS ENUM ('submitted', 'declined');
CREATE TYPE public.testimonial_moderation_status AS ENUM ('pending', 'approved', 'rejected', 'changes_requested');
CREATE TYPE public.certificate_status AS ENUM ('pending_generation', 'issued', 'generation_failed', 'revoked');

CREATE TABLE public.testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE RESTRICT,
  enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decision public.testimonial_decision NOT NULL,
  testimonial_text text,
  publication_consent boolean NOT NULL DEFAULT false,
  consent_version text NOT NULL DEFAULT '2026-10-06',
  allow_full_name boolean NOT NULL DEFAULT false,
  allow_first_name boolean NOT NULL DEFAULT false,
  allow_profile_photo boolean NOT NULL DEFAULT false,
  allow_program boolean NOT NULL DEFAULT false,
  allow_cohort boolean NOT NULL DEFAULT false,
  allow_organization boolean NOT NULL DEFAULT false,
  moderation_status public.testimonial_moderation_status NOT NULL DEFAULT 'pending',
  moderation_notes text,
  moderated_by uuid REFERENCES auth.users(id),
  moderated_at timestamptz,
  consent_withdrawn_at timestamptz,
  consent_withdrawn_by uuid REFERENCES auth.users(id),
  publication_destinations text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cohort_id, student_id),
  CHECK ((decision='declined' AND testimonial_text IS NULL AND publication_consent=false) OR
         (decision='submitted' AND length(trim(testimonial_text)) BETWEEN 40 AND 2000)),
  CHECK (publication_consent OR NOT (allow_full_name OR allow_first_name OR allow_profile_photo OR allow_program OR allow_cohort OR allow_organization)),
  CHECK (NOT (allow_full_name AND allow_first_name))
);

CREATE TABLE public.feedback_completion_waivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  waived_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cohort_id, student_id)
);

CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE RESTRICT,
  enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  certificate_number text NOT NULL UNIQUE,
  verification_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status public.certificate_status NOT NULL DEFAULT 'pending_generation',
  learner_name text NOT NULL,
  program_name text NOT NULL,
  cohort_label text NOT NULL,
  completion_date date NOT NULL,
  organization_name text,
  pdf_storage_path text,
  content_hash text,
  issued_at timestamptz,
  generation_attempts integer NOT NULL DEFAULT 0,
  generation_error text,
  supersedes_id uuid REFERENCES public.certificates(id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX certificates_current_student_cohort_idx ON public.certificates(cohort_id, student_id) WHERE status <> 'revoked';
CREATE INDEX certificates_generation_queue_idx ON public.certificates(status, generation_attempts, created_at);
CREATE INDEX testimonials_moderation_idx ON public.testimonials(hub_id, moderation_status, created_at);

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_completion_waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own testimonials" ON public.testimonials FOR SELECT USING (student_id=auth.uid());
CREATE POLICY "Admins manage testimonials" ON public.testimonials FOR ALL
  USING ((is_superadmin() OR has_role(auth.uid(),'admin')) AND hub_id=get_my_hub_id())
  WITH CHECK ((is_superadmin() OR has_role(auth.uid(),'admin')) AND hub_id=get_my_hub_id());
CREATE POLICY "Admins manage feedback waivers" ON public.feedback_completion_waivers FOR ALL
  USING ((is_superadmin() OR has_role(auth.uid(),'admin')) AND hub_id=get_my_hub_id())
  WITH CHECK ((is_superadmin() OR has_role(auth.uid(),'admin')) AND hub_id=get_my_hub_id());
CREATE POLICY "Students view own certificates" ON public.certificates FOR SELECT USING (student_id=auth.uid());
CREATE POLICY "Admins view certificates" ON public.certificates FOR SELECT
  USING ((is_superadmin() OR has_role(auth.uid(),'admin')) AND hub_id=get_my_hub_id());

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('certificates','certificates',false,10485760,ARRAY['application/pdf'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE POLICY "Students download own certificates" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='certificates' AND EXISTS (
  SELECT 1 FROM public.certificates c WHERE c.pdf_storage_path=name AND c.student_id=auth.uid() AND c.status='issued'
));
CREATE POLICY "Admins manage certificate files" ON storage.objects FOR ALL TO authenticated
USING (bucket_id='certificates' AND (is_owner(auth.uid()) OR has_role(auth.uid(),'admin')))
WITH CHECK (bucket_id='certificates' AND (is_owner(auth.uid()) OR has_role(auth.uid(),'admin')));

CREATE OR REPLACE FUNCTION public.student_completed_course_feedback(p_cohort_id uuid,p_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(
    SELECT 1 FROM feedback_invitations fi JOIN feedback_campaigns fc ON fc.id=fi.campaign_id
    WHERE fc.cohort_id=p_cohort_id AND fc.campaign_type='course' AND fi.student_id=p_student_id AND fi.completed_at IS NOT NULL
  ) OR EXISTS(SELECT 1 FROM feedback_completion_waivers w WHERE w.cohort_id=p_cohort_id AND w.student_id=p_student_id);
$$;

CREATE OR REPLACE FUNCTION public.maybe_issue_certificate(p_cohort_id uuid,p_student_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_member cohort_students%ROWTYPE; v_cohort cohorts%ROWTYPE; v_hub uuid; v_name text; v_program text; v_org text; v_id uuid; v_uuid uuid:=gen_random_uuid();
BEGIN
  SELECT * INTO v_member FROM cohort_students WHERE cohort_id=p_cohort_id AND student_id=p_student_id;
  IF NOT FOUND OR v_member.final_graduation_status<>'graduated' THEN RETURN NULL; END IF;
  IF NOT student_completed_course_feedback(p_cohort_id,p_student_id) THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM testimonials WHERE cohort_id=p_cohort_id AND student_id=p_student_id) THEN RETURN NULL; END IF;
  SELECT * INTO v_cohort FROM cohorts WHERE id=p_cohort_id;
  SELECT c.hub_id,p.program_name INTO v_hub,v_program FROM classrooms c JOIN programs p ON p.id=v_cohort.program_id WHERE c.id=v_cohort.classroom_id;
  SELECT coalesce(pr.full_name,e.full_name,'Learner'),o.organization_name INTO v_name,v_org FROM enrollments e LEFT JOIN profiles pr ON pr.user_id=p_student_id LEFT JOIN organizations o ON o.id=e.organization_id WHERE e.id=v_member.enrollment_id;
  IF v_name IS NULL THEN SELECT coalesce(full_name,'Learner') INTO v_name FROM profiles WHERE user_id=p_student_id; END IF;
  INSERT INTO certificates(id,hub_id,cohort_id,enrollment_id,student_id,certificate_number,verification_token,learner_name,program_name,cohort_label,completion_date,organization_name)
  VALUES(v_uuid,v_hub,p_cohort_id,v_member.enrollment_id,p_student_id,'CERT-'||extract(year from current_date)::text||'-'||upper(substr(replace(v_uuid::text,'-',''),1,10)),gen_random_uuid(),v_name,v_program,v_cohort.cohort_label,coalesce(v_cohort.end_date,current_date),v_org)
  ON CONFLICT DO NOTHING RETURNING id INTO v_id;
  RETURN coalesce(v_id,(SELECT id FROM certificates WHERE cohort_id=p_cohort_id AND student_id=p_student_id AND status<>'revoked' LIMIT 1));
END $$;

CREATE OR REPLACE FUNCTION public.submit_testimonial_decision(p_cohort_id uuid,p_decision testimonial_decision,p_text text DEFAULT NULL,p_publication_consent boolean DEFAULT false,p_allow_full_name boolean DEFAULT false,p_allow_first_name boolean DEFAULT false,p_allow_profile_photo boolean DEFAULT false,p_allow_program boolean DEFAULT false,p_allow_cohort boolean DEFAULT false,p_allow_organization boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_member cohort_students%ROWTYPE; v_hub uuid; v_id uuid;
BEGIN
  SELECT * INTO v_member FROM cohort_students WHERE cohort_id=p_cohort_id AND student_id=auth.uid();
  IF NOT FOUND OR v_member.final_graduation_status<>'graduated' THEN RAISE EXCEPTION 'Graduation is required'; END IF;
  IF NOT student_completed_course_feedback(p_cohort_id,auth.uid()) THEN RAISE EXCEPTION 'Complete the confidential course feedback first'; END IF;
  SELECT c.hub_id INTO v_hub FROM cohorts co JOIN classrooms c ON c.id=co.classroom_id WHERE co.id=p_cohort_id;
  INSERT INTO testimonials(hub_id,cohort_id,enrollment_id,student_id,decision,testimonial_text,publication_consent,allow_full_name,allow_first_name,allow_profile_photo,allow_program,allow_cohort,allow_organization)
  VALUES(v_hub,p_cohort_id,v_member.enrollment_id,auth.uid(),p_decision,CASE WHEN p_decision='submitted' THEN nullif(trim(p_text),'') END,CASE WHEN p_decision='submitted' THEN p_publication_consent ELSE false END,
    p_publication_consent AND p_allow_full_name,p_publication_consent AND p_allow_first_name,p_publication_consent AND p_allow_profile_photo,p_publication_consent AND p_allow_program,p_publication_consent AND p_allow_cohort,p_publication_consent AND p_allow_organization)
  ON CONFLICT(cohort_id,student_id) DO UPDATE SET decision=EXCLUDED.decision,testimonial_text=EXCLUDED.testimonial_text,publication_consent=EXCLUDED.publication_consent,allow_full_name=EXCLUDED.allow_full_name,allow_first_name=EXCLUDED.allow_first_name,allow_profile_photo=EXCLUDED.allow_profile_photo,allow_program=EXCLUDED.allow_program,allow_cohort=EXCLUDED.allow_cohort,allow_organization=EXCLUDED.allow_organization,updated_at=now()
  RETURNING id INTO v_id;
  PERFORM maybe_issue_certificate(p_cohort_id,auth.uid());
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_completion_journey(p_cohort_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_student uuid:=auth.uid(); v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM cohort_students WHERE cohort_id=p_cohort_id AND student_id=v_student) THEN RAISE EXCEPTION 'Cohort membership required'; END IF;
  SELECT jsonb_build_object('graduation_status',cs.final_graduation_status,'feedback_completed',student_completed_course_feedback(p_cohort_id,v_student),
    'testimonial',CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('id',t.id,'decision',t.decision,'moderation_status',t.moderation_status,'publication_consent',t.publication_consent) END,
    'certificate',CASE WHEN cert.id IS NULL THEN NULL ELSE jsonb_build_object('id',cert.id,'certificate_number',cert.certificate_number,'status',cert.status,'issued_at',cert.issued_at,'verification_token',cert.verification_token,'generation_error',cert.generation_error) END)
  INTO v_result FROM cohort_students cs LEFT JOIN testimonials t ON t.cohort_id=cs.cohort_id AND t.student_id=cs.student_id
  LEFT JOIN LATERAL(SELECT * FROM certificates x WHERE x.cohort_id=cs.cohort_id AND x.student_id=cs.student_id ORDER BY version DESC LIMIT 1) cert ON true
  WHERE cs.cohort_id=p_cohort_id AND cs.student_id=v_student;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.verify_certificate(p_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN c.id IS NULL THEN jsonb_build_object('valid',false) ELSE jsonb_build_object('valid',c.status='issued','status',c.status,'certificate_number',c.certificate_number,'learner_name',c.learner_name,'program_name',c.program_name,'cohort_label',c.cohort_label,'completion_date',c.completion_date,'issued_at',c.issued_at) END
  FROM (SELECT 1) d LEFT JOIN certificates c ON c.verification_token=p_token LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_testimonial_consent(p_testimonial_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE testimonials SET publication_consent=false,allow_full_name=false,allow_first_name=false,allow_profile_photo=false,allow_program=false,allow_cohort=false,allow_organization=false,consent_withdrawn_at=now(),consent_withdrawn_by=auth.uid(),updated_at=now()
  WHERE id=p_testimonial_id AND student_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Testimonial not found'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.waive_course_feedback(p_cohort_id uuid,p_student_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_hub uuid;
BEGIN
  IF NOT(is_superadmin() OR has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT c.hub_id INTO v_hub FROM cohorts co JOIN classrooms c ON c.id=co.classroom_id WHERE co.id=p_cohort_id;
  IF NOT is_superadmin() AND v_hub<>get_my_hub_id() THEN RAISE EXCEPTION 'Cohort outside your hub'; END IF;
  INSERT INTO feedback_completion_waivers(hub_id,cohort_id,student_id,reason,waived_by) VALUES(v_hub,p_cohort_id,p_student_id,trim(p_reason),auth.uid()) ON CONFLICT(cohort_id,student_id) DO UPDATE SET reason=EXCLUDED.reason,waived_by=EXCLUDED.waived_by,created_at=now();
  INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES(auth.uid(),'course_feedback_waived','cohort',p_cohort_id,jsonb_build_object('student_id',p_student_id,'reason',p_reason));
  PERFORM maybe_issue_certificate(p_cohort_id,p_student_id);
END $$;

CREATE OR REPLACE FUNCTION public.moderate_testimonial(p_testimonial_id uuid,p_status testimonial_moderation_status,p_notes text DEFAULT NULL,p_destinations text[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT(is_superadmin() OR has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_status='approved' AND NOT EXISTS(SELECT 1 FROM testimonials WHERE id=p_testimonial_id AND decision='submitted' AND publication_consent AND consent_withdrawn_at IS NULL) THEN
    RAISE EXCEPTION 'Publication approval requires active learner consent';
  END IF;
  UPDATE testimonials SET moderation_status=p_status,moderation_notes=nullif(trim(p_notes),''),publication_destinations=coalesce(p_destinations,'{}'),moderated_by=auth.uid(),moderated_at=now(),updated_at=now()
  WHERE id=p_testimonial_id AND (is_superadmin() OR hub_id=get_my_hub_id());
  IF NOT FOUND THEN RAISE EXCEPTION 'Testimonial not found'; END IF;
  INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES(auth.uid(),'testimonial_moderated','testimonial',p_testimonial_id,jsonb_build_object('status',p_status));
END $$;

CREATE OR REPLACE FUNCTION public.process_completion_journeys()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; n integer:=0;
BEGIN
  FOR r IN SELECT cohort_id,student_id FROM cohort_students cs WHERE final_graduation_status='graduated' AND EXISTS(SELECT 1 FROM testimonials t WHERE t.cohort_id=cs.cohort_id AND t.student_id=cs.student_id) LOOP
    IF maybe_issue_certificate(r.cohort_id,r.student_id) IS NOT NULL THEN n:=n+1; END IF;
  END LOOP; RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_certificate(p_certificate_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT(is_superadmin() OR has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  UPDATE certificates SET status='revoked',revoked_at=now(),revoked_by=auth.uid(),revocation_reason=trim(p_reason)
  WHERE id=p_certificate_id AND status='issued' AND (is_superadmin() OR hub_id=get_my_hub_id());
  IF NOT FOUND THEN RAISE EXCEPTION 'Issued certificate not found'; END IF;
  INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES(auth.uid(),'certificate_revoked','certificate',p_certificate_id,jsonb_build_object('reason',p_reason));
END $$;

CREATE OR REPLACE FUNCTION public.get_completion_admin_queue()
RETURNS TABLE(cohort_student_id uuid,cohort_id uuid,student_id uuid,learner_name text,cohort_label text,program_name text,feedback_completed boolean,testimonial_decision text,certificate_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT(is_superadmin() OR has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  RETURN QUERY SELECT cs.id,cs.cohort_id,cs.student_id,coalesce(p.full_name,e.full_name,'Learner'),co.cohort_label,pr.program_name,
    student_completed_course_feedback(cs.cohort_id,cs.student_id),t.decision::text,cert.status::text
  FROM cohort_students cs JOIN cohorts co ON co.id=cs.cohort_id JOIN classrooms cl ON cl.id=co.classroom_id JOIN programs pr ON pr.id=co.program_id
  LEFT JOIN enrollments e ON e.id=cs.enrollment_id LEFT JOIN profiles p ON p.user_id=cs.student_id
  LEFT JOIN testimonials t ON t.cohort_id=cs.cohort_id AND t.student_id=cs.student_id
  LEFT JOIN LATERAL(SELECT status FROM certificates x WHERE x.cohort_id=cs.cohort_id AND x.student_id=cs.student_id ORDER BY version DESC LIMIT 1) cert ON true
  WHERE cs.final_graduation_status='graduated' AND (is_superadmin() OR cl.hub_id=get_my_hub_id()) ORDER BY co.end_date DESC NULLS LAST,co.cohort_label,coalesce(p.full_name,e.full_name,'Learner');
END $$;

CREATE OR REPLACE FUNCTION public.reissue_certificate(p_certificate_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old certificates%ROWTYPE; v_id uuid:=gen_random_uuid(); v_new uuid;
BEGIN
  IF NOT(is_superadmin() OR has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT * INTO old FROM certificates WHERE id=p_certificate_id AND (is_superadmin() OR hub_id=get_my_hub_id()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificate not found'; END IF;
  IF old.status<>'revoked' THEN UPDATE certificates SET status='revoked',revoked_at=now(),revoked_by=auth.uid(),revocation_reason='Superseded by corrected certificate' WHERE id=old.id; END IF;
  INSERT INTO certificates(id,hub_id,cohort_id,enrollment_id,student_id,certificate_number,verification_token,version,status,learner_name,program_name,cohort_label,completion_date,organization_name,supersedes_id)
  VALUES(v_id,old.hub_id,old.cohort_id,old.enrollment_id,old.student_id,'CERT-'||extract(year from current_date)::text||'-'||upper(substr(replace(v_id::text,'-',''),1,10)),gen_random_uuid(),old.version+1,'pending_generation',old.learner_name,old.program_name,old.cohort_label,old.completion_date,old.organization_name,old.id) RETURNING id INTO v_new;
  INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES(auth.uid(),'certificate_reissued','certificate',v_new,jsonb_build_object('supersedes',old.id));
  RETURN v_new;
END $$;

GRANT SELECT ON public.testimonials,public.feedback_completion_waivers,public.certificates TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_testimonial_decision(uuid,testimonial_decision,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_completion_journey(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_certificate(uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_testimonial_consent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.waive_course_feedback(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_testimonial(uuid,testimonial_moderation_status,text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_certificate(uuid,text),public.reissue_certificate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_completion_admin_queue() TO authenticated;
REVOKE ALL ON FUNCTION public.maybe_issue_certificate(uuid,uuid),public.process_completion_journeys() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.maybe_issue_certificate(uuid,uuid),public.process_completion_journeys() TO service_role;

-- Preserve the existing cron command while extending it with certificate issuance.
ALTER FUNCTION public.process_feedback_campaigns() RENAME TO process_feedback_campaigns_core;
CREATE OR REPLACE FUNCTION public.process_feedback_campaigns()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f jsonb; c integer;
BEGIN f:=process_feedback_campaigns_core(); c:=process_completion_journeys(); RETURN f||jsonb_build_object('certificate_candidates',c); END $$;
REVOKE ALL ON FUNCTION public.process_feedback_campaigns(),public.process_feedback_campaigns_core() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_feedback_campaigns(),public.process_feedback_campaigns_core() TO service_role;
