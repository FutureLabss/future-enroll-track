-- Allow staff to set an initial qualification while preserving automatic lead scoring.
DROP FUNCTION IF EXISTS public.upsert_crm_lead(text,text,text,text,boolean,jsonb);

CREATE OR REPLACE FUNCTION public.upsert_crm_lead(
  p_full_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_source_slug text DEFAULT 'manual',
  p_marketing_consent boolean DEFAULT false,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_qualification text DEFAULT NULL
) RETURNS public.crm_leads LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hub uuid := public.get_my_hub_id();
  v_source uuid;
  v_lead public.crm_leads;
BEGIN
  IF NOT public.can_manage_crm() THEN RAISE EXCEPTION 'CRM access required'; END IF;
  IF p_qualification IS NOT NULL AND p_qualification NOT IN ('cold', 'warm', 'hot') THEN
    RAISE EXCEPTION 'Invalid lead qualification';
  END IF;

  SELECT id INTO v_source FROM public.lead_sources WHERE hub_id = v_hub AND slug = lower(trim(p_source_slug));
  INSERT INTO public.crm_leads(
    hub_id, full_name, email, phone, source_id, marketing_consent, consented_at,
    consent_source, utm_source, utm_medium, utm_campaign, referral_detail,
    qualification_override, qualification_override_reason
  )
  VALUES(
    v_hub, trim(p_full_name), nullif(trim(p_email),''), nullif(trim(p_phone),''), v_source, p_marketing_consent,
    CASE WHEN p_marketing_consent THEN now() END, CASE WHEN p_marketing_consent THEN p_source_slug END,
    p_metadata->>'utm_source', p_metadata->>'utm_medium', p_metadata->>'utm_campaign', p_metadata->>'referral_detail',
    p_qualification, CASE WHEN p_qualification IS NOT NULL THEN 'Set during lead creation' END
  )
  ON CONFLICT (hub_id, normalized_email) WHERE normalized_email IS NOT NULL DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = COALESCE(EXCLUDED.phone, crm_leads.phone),
    source_id = COALESCE(EXCLUDED.source_id, crm_leads.source_id),
    marketing_consent = crm_leads.marketing_consent OR EXCLUDED.marketing_consent,
    consented_at = CASE WHEN NOT crm_leads.marketing_consent AND EXCLUDED.marketing_consent THEN now() ELSE crm_leads.consented_at END,
    qualification_override = COALESCE(EXCLUDED.qualification_override, crm_leads.qualification_override),
    qualification_override_reason = COALESCE(EXCLUDED.qualification_override_reason, crm_leads.qualification_override_reason),
    updated_at = now()
  RETURNING * INTO v_lead;

  INSERT INTO public.lead_activities(hub_id, lead_id, activity_type, title, details, created_by)
  VALUES(v_hub, v_lead.id, CASE WHEN p_source_slug = 'manual' THEN 'created' ELSE 'form_submission' END, 'Lead captured', p_metadata, auth.uid());

  IF p_marketing_consent THEN
    INSERT INTO public.marketing_consent_history(hub_id, lead_id, consented, source)
    VALUES(v_hub, v_lead.id, true, p_source_slug);
  END IF;

  PERFORM public.record_lead_score_event(v_lead.id, 'form_submission', NULL);
  v_lead := public.recalculate_lead_score(v_lead.id);
  RETURN v_lead;
END $$;

GRANT EXECUTE ON FUNCTION public.upsert_crm_lead(text,text,text,text,boolean,jsonb,text) TO authenticated;