ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing';

CREATE OR REPLACE FUNCTION public.can_manage_crm()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_superadmin()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role::text = 'marketing'
    );
$$;

CREATE TABLE public.lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub_id, slug)
);

CREATE TABLE public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  normalized_email text GENERATED ALWAYS AS (lower(trim(email))) STORED,
  phone text,
  source_id uuid REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  source_detail text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  referral_detail text,
  program_interest_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  lifecycle_status text NOT NULL DEFAULT 'new_lead' CHECK (lifecycle_status IN ('new_lead','contacted','interested','follow_up','registered','not_interested')),
  score integer NOT NULL DEFAULT 0,
  qualification text NOT NULL DEFAULT 'cold' CHECK (qualification IN ('cold','warm','hot')),
  qualification_override text CHECK (qualification_override IN ('cold','warm','hot')),
  qualification_override_reason text,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  marketing_consent boolean NOT NULL DEFAULT false,
  consented_at timestamptz,
  consent_source text,
  suppressed_at timestamptz,
  suppression_reason text,
  next_follow_up_at timestamptz,
  converted_at timestamptz,
  enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX crm_leads_hub_email_unique ON public.crm_leads(hub_id, normalized_email) WHERE normalized_email IS NOT NULL;
CREATE INDEX crm_leads_hub_status_idx ON public.crm_leads(hub_id, lifecycle_status, qualification);
CREATE INDEX crm_leads_follow_up_idx ON public.crm_leads(hub_id, next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;

CREATE TABLE public.lead_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT 'slate',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub_id, name)
);
CREATE TABLE public.lead_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, tag_id)
);
CREATE TABLE public.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  title text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_activities_timeline_idx ON public.lead_activities(lead_id, occurred_at DESC);

CREATE TABLE public.lead_scoring_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL UNIQUE REFERENCES public.hubs(id) ON DELETE CASCADE,
  warm_threshold integer NOT NULL DEFAULT 30 CHECK (warm_threshold >= 0),
  hot_threshold integer NOT NULL DEFAULT 70 CHECK (hot_threshold > warm_threshold),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.lead_scoring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  label text NOT NULL,
  points integer NOT NULL,
  max_occurrences integer CHECK (max_occurrences IS NULL OR max_occurrences > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub_id, event_type)
);
CREATE TABLE public.lead_score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.lead_scoring_rules(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  points integer NOT NULL,
  external_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lead_score_event_external_unique ON public.lead_score_events(lead_id, event_type, external_key) WHERE external_key IS NOT NULL;

CREATE TABLE public.lead_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
  completed_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_follow_ups_due_idx ON public.lead_follow_ups(hub_id, status, due_at);

CREATE TABLE public.marketing_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL,
  html_body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed')),
  entry_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.marketing_campaign_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.marketing_email_templates(id),
  step_order integer NOT NULL CHECK (step_order > 0),
  delay_hours integer NOT NULL DEFAULT 0 CHECK (delay_hours >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, step_order)
);
CREATE TABLE public.marketing_campaign_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','stopped')),
  next_step_order integer NOT NULL DEFAULT 1,
  next_send_at timestamptz NOT NULL DEFAULT now(),
  stop_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);
CREATE TABLE public.marketing_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  campaign_enrollment_id uuid NOT NULL REFERENCES public.marketing_campaign_enrollments(id) ON DELETE CASCADE,
  campaign_step_id uuid NOT NULL REFERENCES public.marketing_campaign_steps(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  provider_message_id text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_enrollment_id, campaign_step_id),
  UNIQUE (provider_message_id)
);
CREATE TABLE public.marketing_consent_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  consented boolean NOT NULL,
  source text NOT NULL,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['lead_sources','crm_leads','lead_tags','lead_tag_assignments','lead_activities','lead_scoring_settings','lead_scoring_rules','lead_score_events','lead_follow_ups','marketing_email_templates','marketing_campaigns','marketing_campaign_steps','marketing_campaign_enrollments','marketing_email_deliveries','marketing_consent_history'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "CRM team manages %1$s" ON public.%1$I FOR ALL USING (public.can_manage_crm() AND hub_id = public.get_my_hub_id()) WITH CHECK (public.can_manage_crm() AND hub_id = public.get_my_hub_id())', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_set_hub_id BEFORE INSERT ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.recalculate_lead_score(p_lead_id uuid)
RETURNS public.crm_leads LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lead public.crm_leads; v_score integer; v_warm integer; v_hot integer; BEGIN
  SELECT * INTO v_lead FROM public.crm_leads WHERE id = p_lead_id FOR UPDATE;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;
  IF NOT public.can_manage_crm() AND auth.role() <> 'service_role' THEN RAISE EXCEPTION 'CRM access required'; END IF;
  SELECT COALESCE(sum(points), 0) INTO v_score FROM public.lead_score_events WHERE lead_id = p_lead_id;
  SELECT warm_threshold, hot_threshold INTO v_warm, v_hot FROM public.lead_scoring_settings WHERE hub_id = v_lead.hub_id;
  v_warm := COALESCE(v_warm, 30); v_hot := COALESCE(v_hot, 70);
  UPDATE public.crm_leads SET score = v_score,
    qualification = COALESCE(qualification_override, CASE WHEN v_score >= v_hot THEN 'hot' WHEN v_score >= v_warm THEN 'warm' ELSE 'cold' END),
    updated_at = now() WHERE id = p_lead_id RETURNING * INTO v_lead;
  RETURN v_lead;
END $$;

CREATE OR REPLACE FUNCTION public.record_lead_score_event(p_lead_id uuid, p_event_type text, p_external_key text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lead public.crm_leads; v_rule public.lead_scoring_rules; v_count integer; BEGIN
  SELECT * INTO v_lead FROM public.crm_leads WHERE id = p_lead_id;
  SELECT * INTO v_rule FROM public.lead_scoring_rules WHERE hub_id = v_lead.hub_id AND event_type = p_event_type AND active;
  IF v_rule.id IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO v_count FROM public.lead_score_events WHERE lead_id = p_lead_id AND event_type = p_event_type;
  IF v_rule.max_occurrences IS NOT NULL AND v_count >= v_rule.max_occurrences THEN RETURN; END IF;
  INSERT INTO public.lead_score_events(hub_id, lead_id, rule_id, event_type, points, external_key)
  VALUES(v_lead.hub_id, p_lead_id, v_rule.id, p_event_type, v_rule.points, p_external_key) ON CONFLICT DO NOTHING;
  PERFORM public.recalculate_lead_score(p_lead_id);
END $$;

CREATE OR REPLACE FUNCTION public.upsert_crm_lead(
  p_full_name text, p_email text DEFAULT NULL, p_phone text DEFAULT NULL, p_source_slug text DEFAULT 'manual',
  p_marketing_consent boolean DEFAULT false, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS public.crm_leads LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hub uuid := public.get_my_hub_id(); v_source uuid; v_lead public.crm_leads; BEGIN
  IF NOT public.can_manage_crm() THEN RAISE EXCEPTION 'CRM access required'; END IF;
  SELECT id INTO v_source FROM public.lead_sources WHERE hub_id = v_hub AND slug = lower(trim(p_source_slug));
  INSERT INTO public.crm_leads(hub_id, full_name, email, phone, source_id, marketing_consent, consented_at, consent_source, utm_source, utm_medium, utm_campaign, referral_detail)
  VALUES(v_hub, trim(p_full_name), nullif(trim(p_email),''), nullif(trim(p_phone),''), v_source, p_marketing_consent,
    CASE WHEN p_marketing_consent THEN now() END, CASE WHEN p_marketing_consent THEN p_source_slug END,
    p_metadata->>'utm_source', p_metadata->>'utm_medium', p_metadata->>'utm_campaign', p_metadata->>'referral_detail')
  ON CONFLICT (hub_id, normalized_email) WHERE normalized_email IS NOT NULL DO UPDATE SET
    full_name = EXCLUDED.full_name, phone = COALESCE(EXCLUDED.phone, crm_leads.phone), source_id = COALESCE(EXCLUDED.source_id, crm_leads.source_id),
    marketing_consent = crm_leads.marketing_consent OR EXCLUDED.marketing_consent,
    consented_at = CASE WHEN NOT crm_leads.marketing_consent AND EXCLUDED.marketing_consent THEN now() ELSE crm_leads.consented_at END,
    updated_at = now() RETURNING * INTO v_lead;
  INSERT INTO public.lead_activities(hub_id, lead_id, activity_type, title, details, created_by)
  VALUES(v_hub, v_lead.id, CASE WHEN p_source_slug = 'manual' THEN 'created' ELSE 'form_submission' END, 'Lead captured', p_metadata, auth.uid());
  IF p_marketing_consent THEN INSERT INTO public.marketing_consent_history(hub_id, lead_id, consented, source) VALUES(v_hub, v_lead.id, true, p_source_slug); END IF;
  PERFORM public.record_lead_score_event(v_lead.id, 'form_submission', NULL);
  RETURN v_lead;
END $$;

CREATE OR REPLACE FUNCTION public.convert_crm_lead(p_lead_id uuid, p_program_id uuid, p_total_amount numeric DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lead public.crm_leads; v_enrollment uuid; BEGIN
  IF NOT public.can_manage_crm() THEN RAISE EXCEPTION 'CRM access required'; END IF;
  SELECT * INTO v_lead FROM public.crm_leads WHERE id = p_lead_id AND hub_id = public.get_my_hub_id() FOR UPDATE;
  IF v_lead.id IS NULL OR v_lead.email IS NULL THEN RAISE EXCEPTION 'Lead with email not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.programs WHERE id = p_program_id AND hub_id = v_lead.hub_id) THEN RAISE EXCEPTION 'Program not found'; END IF;
  SELECT id INTO v_enrollment FROM public.enrollments WHERE lower(email) = v_lead.normalized_email AND program_id = p_program_id LIMIT 1;
  IF v_enrollment IS NULL THEN
    INSERT INTO public.enrollments(full_name,email,phone,program_id,total_amount,enrollment_status)
    VALUES(v_lead.full_name,v_lead.email,v_lead.phone,p_program_id,p_total_amount,'pending') RETURNING id INTO v_enrollment;
  END IF;
  UPDATE public.crm_leads SET lifecycle_status='registered', enrollment_id=v_enrollment, converted_at=now(), updated_at=now() WHERE id=p_lead_id;
  UPDATE public.marketing_campaign_enrollments SET status='stopped',stop_reason='converted',updated_at=now() WHERE lead_id=p_lead_id AND status IN ('active','paused');
  INSERT INTO public.lead_activities(hub_id,lead_id,activity_type,title,details,created_by) VALUES(v_lead.hub_id,p_lead_id,'conversion','Converted to enrollment',jsonb_build_object('enrollment_id',v_enrollment),auth.uid());
  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,details,hub_id) VALUES(auth.uid(),'lead_converted','crm_lead',p_lead_id,jsonb_build_object('enrollment_id',v_enrollment),v_lead.hub_id);
  RETURN v_enrollment;
END $$;

CREATE OR REPLACE FUNCTION public.get_crm_report(p_from timestamptz, p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hub uuid := public.get_my_hub_id(); v_previous_from timestamptz := p_from - (p_to-p_from); v_result jsonb; BEGIN
  IF NOT public.can_manage_crm() THEN RAISE EXCEPTION 'CRM access required'; END IF;
  SELECT jsonb_build_object(
    'new_leads',count(*) FILTER(WHERE created_at>=p_from AND created_at<p_to),
    'cohort_conversions',count(*) FILTER(WHERE created_at>=p_from AND created_at<p_to AND converted_at IS NOT NULL),
    'conversions_completed',count(*) FILTER(WHERE converted_at>=p_from AND converted_at<p_to),
    'conversion_rate',CASE WHEN count(*) FILTER(WHERE created_at>=p_from AND created_at<p_to)=0 THEN 0 ELSE round(100.0*count(*) FILTER(WHERE created_at>=p_from AND created_at<p_to AND converted_at IS NOT NULL)/count(*) FILTER(WHERE created_at>=p_from AND created_at<p_to),1) END,
    'previous_new_leads',count(*) FILTER(WHERE created_at>=v_previous_from AND created_at<p_from),
    'previous_conversions',count(*) FILTER(WHERE converted_at>=v_previous_from AND converted_at<p_from),
    'cold',count(*) FILTER(WHERE qualification='cold'),'warm',count(*) FILTER(WHERE qualification='warm'),'hot',count(*) FILTER(WHERE qualification='hot'),
    'outstanding_follow_ups',(SELECT count(*) FROM public.lead_follow_ups f WHERE f.hub_id=v_hub AND f.status='pending' AND f.due_at<now()),
    'trend',(SELECT COALESCE(jsonb_agg(jsonb_build_object('date',dates.series_day,'leads',COALESCE(l.total,0),'conversions',COALESCE(c.total,0)) ORDER BY dates.series_day),'[]'::jsonb) FROM generate_series(p_from::date,(p_to-interval '1 day')::date,interval '1 day') AS dates(series_day) LEFT JOIN (SELECT created_at::date AS series_day,count(*) total FROM public.crm_leads WHERE hub_id=v_hub AND created_at>=p_from AND created_at<p_to GROUP BY 1) l ON l.series_day=dates.series_day LEFT JOIN (SELECT converted_at::date AS series_day,count(*) total FROM public.crm_leads WHERE hub_id=v_hub AND converted_at>=p_from AND converted_at<p_to GROUP BY 1) c ON c.series_day=dates.series_day),
    'sources',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',name,'value',total) ORDER BY total DESC),'[]'::jsonb) FROM (SELECT COALESCE(s.name,'Unknown') name,count(*) total FROM public.crm_leads l LEFT JOIN public.lead_sources s ON s.id=l.source_id WHERE l.hub_id=v_hub AND l.created_at>=p_from AND l.created_at<p_to GROUP BY 1) q),
    'funnel',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',replace(initcap(lifecycle_status),'_',' '),'key',lifecycle_status,'value',total) ORDER BY array_position(ARRAY['new_lead','contacted','interested','follow_up','registered','not_interested'],lifecycle_status)),'[]'::jsonb) FROM (SELECT lifecycle_status,count(*) total FROM public.crm_leads WHERE hub_id=v_hub AND created_at>=p_from AND created_at<p_to GROUP BY 1) q),
    'qualification',(SELECT jsonb_agg(jsonb_build_object('name',initcap(qualification),'key',qualification,'value',total)) FROM (SELECT qualification,count(*) total FROM public.crm_leads WHERE hub_id=v_hub GROUP BY 1) q),
    'follow_ups',(SELECT jsonb_build_object('completed',count(*) FILTER(WHERE status='completed'),'cancelled',count(*) FILTER(WHERE status='cancelled'),'overdue',count(*) FILTER(WHERE status='pending' AND due_at<now()),'completion_rate',CASE WHEN count(*) FILTER(WHERE status IN('completed','cancelled'))=0 THEN 0 ELSE round(100.0*count(*) FILTER(WHERE status='completed')/count(*) FILTER(WHERE status IN('completed','cancelled')),1) END,'average_hours',COALESCE(round(avg(extract(epoch FROM(completed_at-created_at))/3600) FILTER(WHERE status='completed'),1),0)) FROM public.lead_follow_ups WHERE hub_id=v_hub AND due_at>=p_from AND due_at<p_to),
    'campaigns',(SELECT jsonb_build_object('sent',count(*) FILTER(WHERE sent_at IS NOT NULL),'delivered',count(*) FILTER(WHERE delivered_at IS NOT NULL),'opened',count(*) FILTER(WHERE opened_at IS NOT NULL),'clicked',count(*) FILTER(WHERE clicked_at IS NOT NULL),'bounced',count(*) FILTER(WHERE bounced_at IS NOT NULL),'open_rate',CASE WHEN count(*) FILTER(WHERE delivered_at IS NOT NULL)=0 THEN 0 ELSE round(100.0*count(*) FILTER(WHERE opened_at IS NOT NULL)/count(*) FILTER(WHERE delivered_at IS NOT NULL),1) END,'click_rate',CASE WHEN count(*) FILTER(WHERE delivered_at IS NOT NULL)=0 THEN 0 ELSE round(100.0*count(*) FILTER(WHERE clicked_at IS NOT NULL)/count(*) FILTER(WHERE delivered_at IS NOT NULL),1) END) FROM public.marketing_email_deliveries WHERE hub_id=v_hub AND created_at>=p_from AND created_at<p_to),
    'owners',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',name,'leads',leads,'conversions',conversions,'rate',CASE WHEN leads=0 THEN 0 ELSE round(100.0*conversions/leads,1) END) ORDER BY leads DESC),'[]'::jsonb) FROM (SELECT COALESCE(p.full_name,p.email,'Unassigned') name,count(*) leads,count(*) FILTER(WHERE l.converted_at IS NOT NULL) conversions FROM public.crm_leads l LEFT JOIN public.profiles p ON p.user_id=l.owner_id WHERE l.hub_id=v_hub AND l.created_at>=p_from AND l.created_at<p_to GROUP BY 1) q),
    'programs',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',name,'leads',leads,'conversions',conversions) ORDER BY leads DESC),'[]'::jsonb) FROM (SELECT COALESCE(p.program_name,'Not specified') name,count(*) leads,count(*) FILTER(WHERE l.converted_at IS NOT NULL) conversions FROM public.crm_leads l LEFT JOIN public.programs p ON p.id=l.program_interest_id WHERE l.hub_id=v_hub AND l.created_at>=p_from AND l.created_at<p_to GROUP BY 1) q)
  ) INTO v_result FROM public.crm_leads WHERE hub_id=v_hub;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.list_crm_owners()
RETURNS TABLE(user_id uuid, full_name text, email text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.user_id, p.full_name, p.email FROM public.hub_members hm JOIN public.profiles p ON p.user_id=hm.user_id
  WHERE public.can_manage_crm() AND hm.hub_id=public.get_my_hub_id()
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=hm.user_id AND ur.role::text IN ('admin','marketing'))
  ORDER BY p.full_name NULLS LAST, p.email;
$$;

CREATE OR REPLACE FUNCTION public.complete_lead_follow_up(p_follow_up_id uuid, p_outcome text DEFAULT NULL, p_next_due_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_task public.lead_follow_ups; v_next uuid; BEGIN
  IF NOT public.can_manage_crm() THEN RAISE EXCEPTION 'CRM access required'; END IF;
  SELECT * INTO v_task FROM public.lead_follow_ups WHERE id=p_follow_up_id AND hub_id=public.get_my_hub_id() FOR UPDATE;
  IF v_task.id IS NULL THEN RAISE EXCEPTION 'Follow-up not found'; END IF;
  IF v_task.status <> 'pending' THEN RAISE EXCEPTION 'Follow-up is already closed'; END IF;
  UPDATE public.lead_follow_ups SET status='completed',completed_at=now(),notes=COALESCE(NULLIF(trim(p_outcome),''),notes),updated_at=now() WHERE id=v_task.id;
  INSERT INTO public.lead_activities(hub_id,lead_id,activity_type,title,details,created_by)
  VALUES(v_task.hub_id,v_task.lead_id,'follow_up_completed','Follow-up completed',jsonb_build_object('follow_up_id',v_task.id,'outcome',p_outcome),auth.uid());
  PERFORM public.record_lead_score_event(v_task.lead_id,'follow_up_completed',v_task.id::text);
  IF p_next_due_at IS NOT NULL THEN
    INSERT INTO public.lead_follow_ups(hub_id,lead_id,owner_id,title,due_at) VALUES(v_task.hub_id,v_task.lead_id,v_task.owner_id,'Lead follow-up',p_next_due_at) RETURNING id INTO v_next;
    INSERT INTO public.lead_activities(hub_id,lead_id,activity_type,title,details,created_by) VALUES(v_task.hub_id,v_task.lead_id,'follow_up_scheduled','Next follow-up scheduled',jsonb_build_object('follow_up_id',v_next,'due_at',p_next_due_at),auth.uid());
  END IF;
  UPDATE public.crm_leads SET next_follow_up_at=(SELECT min(due_at) FROM public.lead_follow_ups WHERE lead_id=v_task.lead_id AND status='pending'),updated_at=now() WHERE id=v_task.lead_id;
END $$;

CREATE OR REPLACE FUNCTION public.seed_crm_defaults()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_hub uuid := public.get_my_hub_id(); BEGIN
  IF NOT public.can_manage_crm() THEN RAISE EXCEPTION 'CRM access required'; END IF;
  INSERT INTO public.lead_scoring_settings(hub_id) VALUES(v_hub) ON CONFLICT DO NOTHING;
  INSERT INTO public.lead_sources(hub_id,name,slug) VALUES (v_hub,'Website','website'),(v_hub,'Facebook','facebook'),(v_hub,'WhatsApp','whatsapp'),(v_hub,'Referral','referral'),(v_hub,'Manual','manual') ON CONFLICT DO NOTHING;
  INSERT INTO public.lead_scoring_rules(hub_id,event_type,label,points,max_occurrences) VALUES
    (v_hub,'form_submission','Form submitted',10,2),(v_hub,'contacted','Contact recorded',10,3),(v_hub,'interested','Marked interested',25,1),
    (v_hub,'email_open','Email opened',2,5),(v_hub,'email_click','Email link clicked',8,5),(v_hub,'follow_up_completed','Follow-up completed',10,3),(v_hub,'conversion_intent','Conversion intent',30,1)
  ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.evaluate_lead_campaigns(p_lead_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_lead public.crm_leads; v_campaign record; v_first record; v_source_slug text; BEGIN
  SELECT * INTO v_lead FROM public.crm_leads WHERE id=p_lead_id;
  IF v_lead.id IS NULL OR NOT v_lead.marketing_consent OR v_lead.suppressed_at IS NOT NULL OR v_lead.lifecycle_status IN ('registered','not_interested') THEN RETURN; END IF;
  SELECT slug INTO v_source_slug FROM public.lead_sources WHERE id=v_lead.source_id;
  FOR v_campaign IN SELECT * FROM public.marketing_campaigns WHERE hub_id=v_lead.hub_id AND status='active' LOOP
    IF (NOT (v_campaign.entry_rules ? 'qualification') OR v_campaign.entry_rules->'qualification' ? v_lead.qualification)
      AND (NOT (v_campaign.entry_rules ? 'status') OR v_campaign.entry_rules->'status' ? v_lead.lifecycle_status)
      AND (NOT (v_campaign.entry_rules ? 'source') OR v_campaign.entry_rules->'source' ? COALESCE(v_source_slug,''))
      AND (NOT (v_campaign.entry_rules ? 'tag_ids') OR EXISTS (SELECT 1 FROM public.lead_tag_assignments a WHERE a.lead_id=v_lead.id AND v_campaign.entry_rules->'tag_ids' ? a.tag_id::text)) THEN
      SELECT step_order,delay_hours INTO v_first FROM public.marketing_campaign_steps WHERE campaign_id=v_campaign.id ORDER BY step_order LIMIT 1;
      IF v_first.step_order IS NOT NULL THEN
        INSERT INTO public.marketing_campaign_enrollments(hub_id,campaign_id,lead_id,next_step_order,next_send_at)
        VALUES(v_lead.hub_id,v_campaign.id,v_lead.id,v_first.step_order,now() + make_interval(hours=>v_first.delay_hours)) ON CONFLICT(campaign_id,lead_id) DO NOTHING;
      END IF;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.activate_marketing_campaign(p_campaign_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_lead record; BEGIN
  IF NOT public.can_manage_crm() THEN RAISE EXCEPTION 'CRM access required'; END IF;
  UPDATE public.marketing_campaigns SET status='active',updated_at=now() WHERE id=p_campaign_id AND hub_id=public.get_my_hub_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;
  FOR v_lead IN SELECT id FROM public.crm_leads WHERE hub_id=public.get_my_hub_id() LOOP PERFORM public.evaluate_lead_campaigns(v_lead.id); END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.trg_crm_lead_campaign_eligibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
  PERFORM public.evaluate_lead_campaigns(NEW.id); RETURN NEW;
END $$;
CREATE TRIGGER trg_crm_lead_campaign_eligibility AFTER INSERT OR UPDATE OF qualification,lifecycle_status,source_id,marketing_consent,suppressed_at ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.trg_crm_lead_campaign_eligibility();

CREATE OR REPLACE FUNCTION public.sync_enrollment_to_crm_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_hub uuid; v_lead uuid; BEGIN
  SELECT hub_id INTO v_hub FROM public.programs WHERE id=NEW.program_id;
  SELECT id INTO v_lead FROM public.crm_leads WHERE hub_id=v_hub AND normalized_email=lower(trim(NEW.email)) LIMIT 1;
  IF v_lead IS NOT NULL THEN
    UPDATE public.crm_leads SET lifecycle_status='registered',enrollment_id=NEW.id,converted_at=COALESCE(converted_at,now()),updated_at=now() WHERE id=v_lead;
    UPDATE public.marketing_campaign_enrollments SET status='stopped',stop_reason='converted',updated_at=now() WHERE lead_id=v_lead AND status IN ('active','paused');
    INSERT INTO public.lead_activities(hub_id,lead_id,activity_type,title,details) VALUES(v_hub,v_lead,'conversion','Enrollment linked',jsonb_build_object('enrollment_id',NEW.id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_enrollment_sync_crm AFTER INSERT OR UPDATE OF email,program_id ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.sync_enrollment_to_crm_lead();

GRANT EXECUTE ON FUNCTION public.can_manage_crm() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_crm_lead(text,text,text,text,boolean,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_crm_lead(uuid,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_lead_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_crm_report(timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_crm_owners() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_lead_follow_up(uuid,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_crm_defaults() TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_marketing_campaign(uuid) TO authenticated;

SELECT cron.schedule('process-marketing-campaigns', '*/5 * * * *', $$
  SELECT net.http_post(
    url := 'https://ozjxktxbzhkujavmzjrf.supabase.co/functions/v1/process-marketing-campaigns',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='crm_cron_secret' LIMIT 1)),
    body := '{}'::jsonb
  );
$$);
SELECT cron.schedule('process-lead-follow-ups', '0 * * * *', $$
  SELECT net.http_post(
    url := 'https://ozjxktxbzhkujavmzjrf.supabase.co/functions/v1/process-lead-follow-ups',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='crm_cron_secret' LIMIT 1)),
    body := '{}'::jsonb
  );
$$);
