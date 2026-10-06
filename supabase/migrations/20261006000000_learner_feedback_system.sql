-- Confidential learner feedback: templates, campaigns, responses, reporting and follow-up.

CREATE TYPE public.feedback_question_type AS ENUM ('rating', 'nps', 'boolean', 'choice', 'text');
CREATE TYPE public.feedback_campaign_type AS ENUM ('session', 'course');
CREATE TYPE public.feedback_campaign_status AS ENUM ('draft', 'open', 'closed', 'cancelled');
CREATE TYPE public.feedback_case_status AS ENUM ('open', 'in_progress', 'resolved');

CREATE TABLE public.feedback_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  campaign_type public.feedback_campaign_type NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub_id, name, version)
);

CREATE TABLE public.feedback_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.feedback_templates(id) ON DELETE CASCADE,
  prompt text NOT NULL CHECK (length(trim(prompt)) > 0),
  description text,
  question_type public.feedback_question_type NOT NULL,
  dimension text NOT NULL CHECK (dimension IN ('instructor', 'curriculum', 'operations', 'platform', 'support', 'outcomes', 'safeguarding')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.feedback_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.feedback_templates(id) ON DELETE SET NULL,
  campaign_type public.feedback_campaign_type NOT NULL,
  status public.feedback_campaign_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE RESTRICT,
  cohort_id uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,
  schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  instructor_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  questions_snapshot jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at),
  CHECK (jsonb_typeof(questions_snapshot) = 'array')
);

CREATE UNIQUE INDEX feedback_campaigns_schedule_unique
  ON public.feedback_campaigns(schedule_id) WHERE campaign_type = 'session' AND schedule_id IS NOT NULL;
CREATE UNIQUE INDEX feedback_campaigns_cohort_unique
  ON public.feedback_campaigns(cohort_id) WHERE campaign_type = 'course' AND cohort_id IS NOT NULL;
CREATE INDEX feedback_campaigns_open_idx ON public.feedback_campaigns(hub_id, status, opens_at, closes_at);
CREATE INDEX feedback_campaigns_targets_idx ON public.feedback_campaigns(classroom_id, cohort_id, schedule_id, instructor_id);

CREATE TABLE public.feedback_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.feedback_campaigns(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_at timestamptz NOT NULL DEFAULT now(),
  reminded_at timestamptz,
  dismissed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, student_id)
);
CREATE INDEX feedback_invitations_student_idx ON public.feedback_invitations(student_id, completed_at, campaign_id);

CREATE TABLE public.feedback_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.feedback_campaigns(id) ON DELETE RESTRICT,
  invitation_id uuid NOT NULL REFERENCES public.feedback_invitations(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  flagged boolean NOT NULL DEFAULT false,
  UNIQUE (campaign_id, student_id),
  UNIQUE (invitation_id)
);
CREATE INDEX feedback_responses_campaign_idx ON public.feedback_responses(campaign_id, submitted_at);

CREATE TABLE public.feedback_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  response_id uuid NOT NULL REFERENCES public.feedback_responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  prompt_snapshot text NOT NULL,
  question_type public.feedback_question_type NOT NULL,
  dimension text NOT NULL,
  numeric_value numeric,
  boolean_value boolean,
  text_value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, question_id),
  CHECK (num_nonnulls(numeric_value, boolean_value, text_value) = 1)
);
CREATE INDEX feedback_answers_reporting_idx ON public.feedback_answers(hub_id, dimension, question_type);

CREATE TABLE public.feedback_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  response_id uuid NOT NULL REFERENCES public.feedback_responses(id) ON DELETE RESTRICT,
  status public.feedback_case_status NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  title text NOT NULL,
  assigned_to uuid REFERENCES auth.users(id),
  learner_contacted_at timestamptz,
  resolution text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.feedback_case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.feedback_cases(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_case_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage feedback templates" ON public.feedback_templates FOR ALL
  USING ((is_superadmin() OR has_role(auth.uid(), 'admin')) AND hub_id = get_my_hub_id())
  WITH CHECK ((is_superadmin() OR has_role(auth.uid(), 'admin')) AND hub_id = get_my_hub_id());
CREATE POLICY "Admins manage feedback questions" ON public.feedback_questions FOR ALL
  USING ((is_superadmin() OR has_role(auth.uid(), 'admin')) AND hub_id = get_my_hub_id())
  WITH CHECK ((is_superadmin() OR has_role(auth.uid(), 'admin')) AND hub_id = get_my_hub_id());
CREATE POLICY "Admins manage feedback campaigns" ON public.feedback_campaigns FOR ALL
  USING ((is_superadmin() OR has_role(auth.uid(), 'admin')) AND hub_id = get_my_hub_id())
  WITH CHECK ((is_superadmin() OR has_role(auth.uid(), 'admin')) AND hub_id = get_my_hub_id());
CREATE POLICY "Students view invited feedback campaigns" ON public.feedback_campaigns FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.feedback_invitations fi WHERE fi.campaign_id = id AND fi.student_id = auth.uid()));
CREATE POLICY "Staff view closed classroom feedback campaigns" ON public.feedback_campaigns FOR SELECT
  USING (status = 'closed' AND EXISTS (
    SELECT 1 FROM public.classroom_staff cs WHERE cs.classroom_id = feedback_campaigns.classroom_id
      AND cs.user_id = auth.uid() AND cs.status = 'active'
      AND (feedback_campaigns.instructor_id IS NULL OR feedback_campaigns.instructor_id = cs.staff_id)
  ));
CREATE POLICY "Admins view feedback invitations" ON public.feedback_invitations FOR SELECT
  USING ((is_superadmin() OR has_role(auth.uid(), 'admin')) AND hub_id = get_my_hub_id());
CREATE POLICY "Students view own feedback invitations" ON public.feedback_invitations FOR SELECT
  USING (student_id = auth.uid());
CREATE POLICY "Students dismiss own feedback invitations" ON public.feedback_invitations FOR UPDATE
  USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
CREATE POLICY "Admins view feedback responses" ON public.feedback_responses FOR SELECT
  USING ((is_superadmin() OR has_role(auth.uid(), 'admin')) AND hub_id = get_my_hub_id());
CREATE POLICY "Students view own feedback responses" ON public.feedback_responses FOR SELECT
  USING (student_id = auth.uid());
CREATE POLICY "Admins view feedback answers" ON public.feedback_answers FOR SELECT
  USING ((is_superadmin() OR has_role(auth.uid(), 'admin')) AND hub_id = get_my_hub_id());
CREATE POLICY "Admins manage feedback cases" ON public.feedback_cases FOR ALL
  USING ((is_superadmin() OR has_role(auth.uid(), 'admin')) AND hub_id = get_my_hub_id())
  WITH CHECK ((is_superadmin() OR has_role(auth.uid(), 'admin')) AND hub_id = get_my_hub_id());
CREATE POLICY "Admins manage feedback case notes" ON public.feedback_case_notes FOR ALL
  USING ((is_superadmin() OR has_role(auth.uid(), 'admin')) AND hub_id = get_my_hub_id())
  WITH CHECK ((is_superadmin() OR has_role(auth.uid(), 'admin')) AND hub_id = get_my_hub_id());

CREATE OR REPLACE FUNCTION public.feedback_question_snapshot(p_template_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'prompt', q.prompt, 'description', q.description,
    'question_type', q.question_type, 'dimension', q.dimension,
    'options', q.options, 'required', q.required, 'sort_order', q.sort_order
  ) ORDER BY q.sort_order, q.created_at), '[]'::jsonb)
  FROM feedback_questions q WHERE q.template_id = p_template_id AND q.active;
$$;

CREATE OR REPLACE FUNCTION public.create_feedback_campaign(
  p_template_id uuid, p_title text, p_classroom_id uuid, p_cohort_id uuid DEFAULT NULL,
  p_schedule_id uuid DEFAULT NULL, p_instructor_id uuid DEFAULT NULL,
  p_opens_at timestamptz DEFAULT now(), p_closes_at timestamptz DEFAULT now() + interval '7 days'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_template feedback_templates%ROWTYPE; v_campaign_id uuid; v_hub_id uuid;
BEGIN
  IF NOT (is_superadmin() OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT * INTO v_template FROM feedback_templates WHERE id = p_template_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Feedback template not found'; END IF;
  SELECT hub_id INTO v_hub_id FROM classrooms WHERE id = p_classroom_id;
  IF v_hub_id IS NULL OR (NOT is_superadmin() AND v_hub_id <> get_my_hub_id()) OR v_template.hub_id <> v_hub_id THEN
    RAISE EXCEPTION 'Classroom or template is outside your hub';
  END IF;
  INSERT INTO feedback_campaigns(hub_id, template_id, campaign_type, status, title, classroom_id, cohort_id,
    schedule_id, instructor_id, opens_at, closes_at, questions_snapshot, created_by)
  VALUES (v_hub_id, v_template.id, v_template.campaign_type, CASE WHEN p_opens_at <= now() THEN 'open' ELSE 'draft' END,
    trim(p_title), p_classroom_id, p_cohort_id, p_schedule_id, p_instructor_id, p_opens_at, p_closes_at,
    feedback_question_snapshot(v_template.id), auth.uid()) RETURNING id INTO v_campaign_id;
  INSERT INTO feedback_invitations(hub_id, campaign_id, student_id)
  SELECT v_hub_id, v_campaign_id, eligible.student_id FROM (
    SELECT cs.student_id FROM cohort_students cs WHERE p_cohort_id IS NOT NULL AND cs.cohort_id = p_cohort_id
    UNION
    SELECT cs.student_id FROM classroom_students cs WHERE p_cohort_id IS NULL AND cs.classroom_id = p_classroom_id
  ) eligible ON CONFLICT DO NOTHING;
  INSERT INTO audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES(auth.uid(), 'feedback_campaign_created', 'feedback_campaign', v_campaign_id, jsonb_build_object('title', p_title));
  RETURN v_campaign_id;
END $$;

CREATE OR REPLACE FUNCTION public.submit_feedback(p_invitation_id uuid, p_answers jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inv feedback_invitations%ROWTYPE; v_campaign feedback_campaigns%ROWTYPE; v_response_id uuid;
  v_question jsonb; v_answer jsonb; v_question_id uuid; v_type feedback_question_type; v_value jsonb;
BEGIN
  SELECT * INTO v_inv FROM feedback_invitations WHERE id = p_invitation_id AND student_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Feedback invitation not found'; END IF;
  SELECT * INTO v_campaign FROM feedback_campaigns WHERE id = v_inv.campaign_id;
  IF v_campaign.status <> 'open' OR now() < v_campaign.opens_at OR now() >= v_campaign.closes_at THEN RAISE EXCEPTION 'This feedback form is closed'; END IF;
  IF v_inv.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Feedback has already been submitted'; END IF;
  IF jsonb_typeof(p_answers) <> 'array' THEN RAISE EXCEPTION 'Answers must be an array'; END IF;
  FOR v_question IN SELECT value FROM jsonb_array_elements(v_campaign.questions_snapshot) LOOP
    IF coalesce((v_question->>'required')::boolean, false) AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_answers) a WHERE a->>'question_id' = v_question->>'id' AND a ? 'value'
    ) THEN RAISE EXCEPTION 'A required question was not answered'; END IF;
  END LOOP;
  INSERT INTO feedback_responses(hub_id, campaign_id, invitation_id, student_id)
  VALUES(v_campaign.hub_id, v_campaign.id, v_inv.id, auth.uid()) RETURNING id INTO v_response_id;
  FOR v_answer IN SELECT value FROM jsonb_array_elements(p_answers) LOOP
    v_question_id := (v_answer->>'question_id')::uuid; v_value := v_answer->'value';
    SELECT value INTO v_question FROM jsonb_array_elements(v_campaign.questions_snapshot) q(value) WHERE value->>'id' = v_question_id::text;
    IF v_question IS NULL THEN RAISE EXCEPTION 'Unknown feedback question'; END IF;
    v_type := (v_question->>'question_type')::feedback_question_type;
    INSERT INTO feedback_answers(hub_id, response_id, question_id, prompt_snapshot, question_type, dimension,
      numeric_value, boolean_value, text_value)
    VALUES(v_campaign.hub_id, v_response_id, v_question_id, v_question->>'prompt', v_type, v_question->>'dimension',
      CASE WHEN v_type IN ('rating','nps') THEN (v_value#>>'{}')::numeric END,
      CASE WHEN v_type = 'boolean' THEN (v_value#>>'{}')::boolean END,
      CASE WHEN v_type IN ('choice','text') THEN nullif(trim(v_value#>>'{}'), '') END);
  END LOOP;
  UPDATE feedback_invitations SET completed_at = now(), dismissed_at = NULL WHERE id = v_inv.id;
  IF EXISTS (SELECT 1 FROM feedback_answers WHERE response_id=v_response_id AND dimension='safeguarding' AND nullif(trim(text_value),'') IS NOT NULL) THEN
    UPDATE feedback_responses SET flagged=true WHERE id=v_response_id;
    INSERT INTO feedback_cases(hub_id,response_id,status,priority,title,created_by)
    VALUES(v_campaign.hub_id,v_response_id,'open','urgent','Learner safety or welfare concern',auth.uid());
  END IF;
  RETURN v_response_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_feedback_summary(p_campaign_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_campaign feedback_campaigns%ROWTYPE; v_allowed boolean; v_result jsonb;
BEGIN
  SELECT * INTO v_campaign FROM feedback_campaigns WHERE id = p_campaign_id;
  v_allowed := (is_superadmin() OR (has_role(auth.uid(), 'admin') AND v_campaign.hub_id = get_my_hub_id()));
  IF NOT v_allowed THEN
    v_allowed := v_campaign.status = 'closed' AND EXISTS (
      SELECT 1 FROM classroom_staff cs WHERE cs.classroom_id = v_campaign.classroom_id
      AND cs.user_id = auth.uid() AND cs.status = 'active'
      AND (v_campaign.instructor_id IS NULL OR cs.staff_id = v_campaign.instructor_id)
    );
  END IF;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Feedback results are unavailable'; END IF;
  SELECT jsonb_build_object(
    'campaign_id', v_campaign.id, 'title', v_campaign.title, 'status', v_campaign.status,
    'invited_count', (SELECT count(*) FROM feedback_invitations WHERE campaign_id = v_campaign.id),
    'response_count', (SELECT count(*) FROM feedback_responses WHERE campaign_id = v_campaign.id),
    'questions', coalesce((SELECT jsonb_agg(x.value ORDER BY (x.value->>'sort_order')::integer) FROM (
      SELECT jsonb_build_object('question_id', q->>'id', 'prompt', q->>'prompt', 'question_type', q->>'question_type',
        'dimension', q->>'dimension', 'sort_order', q->>'sort_order',
        'average', (SELECT round(avg(a.numeric_value), 2) FROM feedback_answers a JOIN feedback_responses r ON r.id=a.response_id WHERE r.campaign_id=v_campaign.id AND a.question_id=(q->>'id')::uuid),
        'answers', (SELECT coalesce(jsonb_agg(coalesce(to_jsonb(a.numeric_value), to_jsonb(a.boolean_value), to_jsonb(a.text_value)) ORDER BY a.created_at), '[]'::jsonb) FROM feedback_answers a JOIN feedback_responses r ON r.id=a.response_id WHERE r.campaign_id=v_campaign.id AND a.question_id=(q->>'id')::uuid)
      ) AS value FROM jsonb_array_elements(v_campaign.questions_snapshot) q
    ) x), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.get_feedback_response_identities(p_campaign_id uuid)
RETURNS TABLE(response_id uuid, student_id uuid, full_name text, email text, submitted_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_superadmin() OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM feedback_campaigns WHERE id=p_campaign_id AND hub_id=get_my_hub_id()) AND NOT is_superadmin() THEN RAISE EXCEPTION 'Campaign outside your hub'; END IF;
  INSERT INTO audit_logs(user_id, action, entity_type, entity_id, details) VALUES(auth.uid(), 'feedback_identities_viewed', 'feedback_campaign', p_campaign_id, '{}'::jsonb);
  RETURN QUERY SELECT r.id, r.student_id, p.full_name, p.email, r.submitted_at
    FROM feedback_responses r LEFT JOIN profiles p ON p.user_id=r.student_id WHERE r.campaign_id=p_campaign_id ORDER BY r.submitted_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.process_feedback_campaigns()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_created integer := 0; v_reminded integer := 0; v_closed integer := 0; rec record; v_template_id uuid; v_campaign_id uuid;
BEGIN
  -- Session surveys after the scheduled end time.
  FOR rec IN SELECT s.*, c.hub_id, coalesce(s.title, l.title, 'Class session') session_title
    FROM schedules s JOIN classrooms c ON c.id=s.classroom_id LEFT JOIN lessons l ON l.id=s.lesson_id
    WHERE s.status <> 'cancelled' AND ((s.scheduled_date + s.end_time) AT TIME ZONE 'Africa/Lagos') <= now()
      AND ((s.scheduled_date + s.end_time) AT TIME ZONE 'Africa/Lagos') > now() - interval '7 days'
      AND NOT EXISTS (SELECT 1 FROM feedback_campaigns fc WHERE fc.schedule_id=s.id AND fc.campaign_type='session')
  LOOP
    SELECT id INTO v_template_id FROM feedback_templates WHERE hub_id=rec.hub_id AND campaign_type='session' AND active ORDER BY is_default DESC, version DESC LIMIT 1;
    IF v_template_id IS NOT NULL THEN
      INSERT INTO feedback_campaigns(hub_id,template_id,campaign_type,status,title,classroom_id,cohort_id,schedule_id,instructor_id,opens_at,closes_at,questions_snapshot)
      VALUES(rec.hub_id,v_template_id,'session','open',rec.session_title || ' feedback',rec.classroom_id,rec.cohort_id,rec.id,rec.instructor_id,
        ((rec.scheduled_date+rec.end_time) AT TIME ZONE 'Africa/Lagos'),((rec.scheduled_date+rec.end_time) AT TIME ZONE 'Africa/Lagos')+interval '72 hours',feedback_question_snapshot(v_template_id)) RETURNING id INTO v_campaign_id;
      INSERT INTO feedback_invitations(hub_id,campaign_id,student_id)
      SELECT rec.hub_id,v_campaign_id,x.student_id FROM (SELECT student_id FROM cohort_students WHERE rec.cohort_id IS NOT NULL AND cohort_id=rec.cohort_id UNION SELECT student_id FROM classroom_students WHERE rec.cohort_id IS NULL AND classroom_id=rec.classroom_id) x ON CONFLICT DO NOTHING;
      v_created := v_created + 1;
    END IF;
  END LOOP;
  -- Course surveys seven days before cohort completion.
  FOR rec IN SELECT co.*, c.hub_id, c.name classroom_name FROM cohorts co JOIN classrooms c ON c.id=co.classroom_id
    WHERE co.end_date IS NOT NULL AND co.end_date BETWEEN current_date AND current_date+7
      AND NOT EXISTS (SELECT 1 FROM feedback_campaigns fc WHERE fc.cohort_id=co.id AND fc.campaign_type='course')
  LOOP
    SELECT id INTO v_template_id FROM feedback_templates WHERE hub_id=rec.hub_id AND campaign_type='course' AND active ORDER BY is_default DESC, version DESC LIMIT 1;
    IF v_template_id IS NOT NULL THEN
      INSERT INTO feedback_campaigns(hub_id,template_id,campaign_type,status,title,classroom_id,cohort_id,opens_at,closes_at,questions_snapshot)
      VALUES(rec.hub_id,v_template_id,'course','open',rec.classroom_name || ' · ' || rec.cohort_label || ' course feedback',rec.classroom_id,rec.id,now(),(rec.end_date+7)::timestamptz,feedback_question_snapshot(v_template_id)) RETURNING id INTO v_campaign_id;
      INSERT INTO feedback_invitations(hub_id,campaign_id,student_id) SELECT rec.hub_id,v_campaign_id,student_id FROM cohort_students WHERE cohort_id=rec.id ON CONFLICT DO NOTHING;
      v_created := v_created + 1;
    END IF;
  END LOOP;
  UPDATE feedback_campaigns SET status='open',updated_at=now() WHERE status='draft' AND opens_at<=now();
  UPDATE feedback_campaigns SET status='closed',updated_at=now() WHERE status='open' AND closes_at<=now(); GET DIAGNOSTICS v_closed = ROW_COUNT;
  INSERT INTO notifications(user_id,title,message,type,channel,read)
    SELECT fi.student_id,'Feedback reminder',fc.title || ' closes soon. Your response is confidential.','feedback','in_app',false
    FROM feedback_invitations fi JOIN feedback_campaigns fc ON fc.id=fi.campaign_id
    WHERE fc.status='open' AND fi.completed_at IS NULL AND fi.reminded_at IS NULL AND now()>=fc.opens_at+interval '24 hours' AND now()<fc.closes_at;
  UPDATE feedback_invitations fi SET reminded_at=now() FROM feedback_campaigns fc
    WHERE fc.id=fi.campaign_id AND fc.status='open' AND fi.completed_at IS NULL AND fi.reminded_at IS NULL AND now()>=fc.opens_at+interval '24 hours' AND now()<fc.closes_at;
  GET DIAGNOSTICS v_reminded = ROW_COUNT;
  RETURN jsonb_build_object('created',v_created,'reminded',v_reminded,'closed',v_closed);
END $$;

-- Default templates and questions for every existing hub.
DO $$ DECLARE h record; s uuid; c uuid; BEGIN FOR h IN SELECT id FROM hubs LOOP
  INSERT INTO feedback_templates(hub_id,name,description,campaign_type,is_default) VALUES(h.id,'Session feedback','A confidential one-minute class check-in.','session',true) RETURNING id INTO s;
  INSERT INTO feedback_questions(hub_id,template_id,prompt,question_type,dimension,required,sort_order) VALUES
    (h.id,s,'The class content was clear and relevant.','rating','curriculum',true,10),(h.id,s,'The instructor was prepared and communicated clearly.','rating','instructor',true,20),
    (h.id,s,'The pace and level of engagement worked for me.','rating','instructor',true,30),(h.id,s,'I understand the lesson well enough to apply it.','rating','outcomes',true,40),
    (h.id,s,'The exercises and learning materials were useful.','rating','curriculum',true,50),(h.id,s,'The venue, equipment, or connection supported learning.','rating','operations',true,60),
    (h.id,s,'What worked well?','text','outcomes',false,70),(h.id,s,'What should we improve?','text','operations',false,80),
    (h.id,s,'Is there a safety, conduct, or welfare concern an administrator should follow up?','text','safeguarding',false,90);
  INSERT INTO feedback_templates(hub_id,name,description,campaign_type,is_default) VALUES(h.id,'End-of-course feedback','A confidential review of the complete learning experience.','course',true) RETURNING id INTO c;
  INSERT INTO feedback_questions(hub_id,template_id,prompt,question_type,dimension,required,sort_order) VALUES
    (h.id,c,'The curriculum was well structured and appropriately challenging.','rating','curriculum',true,10),(h.id,c,'The instructors were effective and supportive.','rating','instructor',true,20),
    (h.id,c,'Assignments and assessments supported my learning.','rating','curriculum',true,30),(h.id,c,'Administrative support and communication were effective.','rating','support',true,40),
    (h.id,c,'The learning platform was usable and accessible.','rating','platform',true,50),(h.id,c,'Facilities and scheduling supported my learning.','rating','operations',true,60),
    (h.id,c,'I gained confidence and achieved my learning goals.','rating','outcomes',true,70),(h.id,c,'How likely are you to recommend this program?','nps','outcomes',true,80),
    (h.id,c,'What topics would you like to learn next?','text','curriculum',false,90),(h.id,c,'Any other comments or improvements?','text','operations',false,100),
    (h.id,c,'Is there a safety, conduct, or welfare concern an administrator should follow up?','text','safeguarding',false,110);
END LOOP; END $$;

GRANT SELECT ON public.feedback_templates, public.feedback_questions, public.feedback_campaigns, public.feedback_invitations, public.feedback_responses, public.feedback_answers, public.feedback_cases, public.feedback_case_notes TO authenticated;
GRANT UPDATE(dismissed_at) ON public.feedback_invitations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.feedback_templates, public.feedback_questions, public.feedback_campaigns, public.feedback_cases, public.feedback_case_notes TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_feedback_campaign(uuid,text,uuid,uuid,uuid,uuid,timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_feedback(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_feedback_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_feedback_response_identities(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.process_feedback_campaigns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_feedback_campaigns() TO service_role;
