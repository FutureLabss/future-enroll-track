-- audit_logs has no hub_id column, so convert_crm_lead (20260928000001) failed on its final
-- INSERT and rolled back every conversion. The hub goes into details instead.
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
  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,details) VALUES(auth.uid(),'lead_converted','crm_lead',p_lead_id,jsonb_build_object('enrollment_id',v_enrollment,'hub_id',v_lead.hub_id));
  RETURN v_enrollment;
END $$;

GRANT EXECUTE ON FUNCTION public.convert_crm_lead(uuid,uuid,numeric) TO authenticated;
