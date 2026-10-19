-- Keep the original full-name RPC available for older clients. The new form
-- supplies name components explicitly; existing full names are never split.
CREATE FUNCTION public.start_registration_with_names(p_program_id uuid,p_first_name text,p_surname text,p_phone text,
  p_cohort_id uuid DEFAULT NULL,p_option text DEFAULT 'full',p_plan_label text DEFAULT NULL,p_custom_amount numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_enrollment_id uuid; first_name text; surname text; field_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to register'; END IF;
  first_name:=btrim(regexp_replace(coalesce(p_first_name,''),'[[:space:]]+',' ','g'));
  surname:=btrim(regexp_replace(coalesce(p_surname,''),'[[:space:]]+',' ','g'));
  IF first_name='' OR surname='' THEN RAISE EXCEPTION 'First name and surname are required'; END IF;
  v_enrollment_id:=public.start_registration(p_program_id,concat_ws(' ',first_name,surname),p_phone,p_cohort_id,p_option,p_plan_label,p_custom_amount);
  IF EXISTS(SELECT 1 FROM enrollments e WHERE e.id=v_enrollment_id AND e.user_id=auth.uid() AND e.registration_flow_version=2) THEN
    SELECT count(*) INTO field_count FROM custom_fields cf JOIN programs p ON p.id=p_program_id
      WHERE cf.key IN ('first_name','surname') AND cf.active AND cf.visible_to_student AND (cf.hub_id IS NULL OR cf.hub_id=p.hub_id);
    IF field_count<>2 THEN RAISE EXCEPTION 'Registration name fields are not configured. Please contact admissions.'; END IF;
    INSERT INTO field_values(enrollment_id,field_id,value)
      SELECT v_enrollment_id,cf.id,CASE WHEN cf.key='first_name' THEN first_name ELSE surname END
      FROM custom_fields cf JOIN programs p ON p.id=p_program_id
      WHERE cf.key IN ('first_name','surname') AND cf.active AND cf.visible_to_student AND (cf.hub_id IS NULL OR cf.hub_id=p.hub_id)
      ON CONFLICT(enrollment_id,field_id) DO NOTHING;
  END IF;
  RETURN v_enrollment_id;
END $$;
REVOKE ALL ON FUNCTION public.start_registration_with_names(uuid,text,text,text,uuid,text,text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_registration_with_names(uuid,text,text,text,uuid,text,text,numeric) TO authenticated;
