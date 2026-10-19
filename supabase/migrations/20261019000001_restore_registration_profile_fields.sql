-- Fresh installations had the custom-field table but no enrollment questions.
-- Insert the existing v2 core fields without overwriting administrator definitions.
INSERT INTO public.custom_fields(key,label,field_type,options,required,visible_to_student,active,sort_order,hub_id)
VALUES
 ('surname','Surname','text',NULL,false,true,true,1,'00000000-0000-0000-0000-000000000001'),
 ('first_name','First name','text',NULL,false,true,true,2,'00000000-0000-0000-0000-000000000001'),
 ('date_of_birth','Date of birth','date',NULL,false,true,true,4,'00000000-0000-0000-0000-000000000001'),
 ('sex','Gender','select','["Female","Male","Prefer not to say"]',false,true,true,5,'00000000-0000-0000-0000-000000000001'),
 ('pwd_status','Do you have special needs?','select','["Yes","No","Prefer not to say"]',false,true,true,6,'00000000-0000-0000-0000-000000000001'),
 ('highest_educational_qualification','Highest educational qualification','text',NULL,false,true,true,7,'00000000-0000-0000-0000-000000000001'),
 ('state_of_residence','State of residence','text',NULL,false,true,true,17,'00000000-0000-0000-0000-000000000001'),
 ('residential_address','Residential address','textarea',NULL,false,true,true,18,'00000000-0000-0000-0000-000000000001')
ON CONFLICT(key) DO NOTHING;

-- Core fields are required by profile version, rather than globally forcing them
-- on grandfathered version-1 profiles through custom_fields.required.
CREATE OR REPLACE FUNCTION public.submit_enrollment_fields(p_enrollment_id uuid,p_fields jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE enr enrollments; missing text; dob text;
  core_keys text[]:=ARRAY['surname','first_name','date_of_birth','sex','pwd_status','state_of_residence','residential_address','highest_educational_qualification'];
BEGIN
  SELECT * INTO enr FROM enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'You may only update your own enrollment'; END IF;
  IF NOT registration_profile_available(enr.id) THEN RAISE EXCEPTION 'Submit payment before completing registration'; END IF;
  IF enr.registration_flow_version=2 AND enr.profile_requirements_version>=2 AND EXISTS(
    SELECT 1 FROM unnest(core_keys) AS required_key(key)
    WHERE NOT EXISTS(SELECT 1 FROM custom_fields cf JOIN programs p ON p.id=enr.program_id
      WHERE cf.key=required_key.key AND cf.active AND cf.visible_to_student AND (cf.hub_id IS NULL OR cf.hub_id=p.hub_id))
  ) THEN RAISE EXCEPTION 'Registration profile fields are not configured. Please contact admissions.'; END IF;
  PERFORM save_enrollment_fields(enr.id,p_fields);
  SELECT string_agg(cf.label,', ') INTO missing FROM custom_fields cf
  JOIN programs p ON p.id=enr.program_id
  LEFT JOIN field_values fv ON fv.field_id=cf.id AND fv.enrollment_id=enr.id
  WHERE cf.active AND cf.visible_to_student AND (cf.hub_id IS NULL OR cf.hub_id=p.hub_id)
    AND (cf.required OR (enr.profile_requirements_version>=2 AND cf.key=ANY(core_keys)))
    AND NOT (cf.key='current_academic_level' AND coalesce(p_fields->>'highest_education','')<>'SIWES/IT (Internship)')
    AND coalesce(btrim(fv.value),'')='';
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Required fields: %',missing; END IF;
  SELECT fv.value INTO dob FROM field_values fv JOIN custom_fields cf ON cf.id=fv.field_id
    WHERE fv.enrollment_id=enr.id AND cf.key='date_of_birth' AND cf.active AND cf.visible_to_student LIMIT 1;
  IF nullif(btrim(dob),'') IS NOT NULL AND dob::date>current_date-interval '8 years' THEN RAISE EXCEPTION 'Applicant must be at least 8 years old'; END IF;
  UPDATE enrollments SET profile_completed_at=now() WHERE id=enr.id;
  PERFORM activate_registration(enr.id);
END $$;

-- Reopen only new-flow profiles erroneously completed without the core data.
-- Financial records and all legacy enrollments are preserved. Membership is
-- restored by activate_registration after a valid profile is submitted.
WITH reopened AS (
 UPDATE public.enrollments e SET profile_completed_at=NULL
 WHERE e.registration_flow_version=2 AND e.profile_requirements_version>=2 AND e.profile_completed_at IS NOT NULL
 AND EXISTS(
   SELECT 1 FROM unnest(ARRAY['surname','first_name','date_of_birth','sex','pwd_status','state_of_residence','residential_address','highest_educational_qualification']) AS required_key(key)
   JOIN public.programs p ON p.id=e.program_id
   LEFT JOIN public.custom_fields cf ON cf.key=required_key.key AND cf.active AND cf.visible_to_student AND (cf.hub_id IS NULL OR cf.hub_id=p.hub_id)
   LEFT JOIN public.field_values fv ON fv.field_id=cf.id AND fv.enrollment_id=e.id
   WHERE coalesce(btrim(fv.value),'')=''
 ) RETURNING e.id
), removed_cohort_memberships AS (
 DELETE FROM public.cohort_students WHERE enrollment_id IN (SELECT id FROM reopened)
)
DELETE FROM public.classroom_students WHERE enrollment_id IN (SELECT id FROM reopened);
