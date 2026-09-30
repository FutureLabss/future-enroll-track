-- Expand student profile capture and add staff-managed outcome reporting.
-- Existing enrollments remain on requirements version 1; new enrollments use v2.

ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS profile_requirements_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.enrollments
  ALTER COLUMN profile_requirements_version SET DEFAULT 2;

INSERT INTO public.custom_fields
  (label, key, field_type, options, required, visible_to_student, visible_to_organization, active, sort_order, hub_id)
VALUES
  ('Surname', 'surname', 'text', NULL, false, true, false, true, 2, '00000000-0000-0000-0000-000000000001'),
  ('First name', 'first_name', 'text', NULL, false, true, false, true, 3, '00000000-0000-0000-0000-000000000001'),
  ('Middle name', 'middle_name', 'text', NULL, false, true, false, true, 4, '00000000-0000-0000-0000-000000000001'),
  ('Date of birth', 'date_of_birth', 'date', NULL, false, true, false, true, 5, '00000000-0000-0000-0000-000000000001'),
  ('Sex', 'sex', 'select', '["Female", "Male"]'::jsonb, false, true, false, true, 6, '00000000-0000-0000-0000-000000000001'),
  ('Person with disability (PWD)', 'pwd_status', 'select', '["Yes", "No", "Prefer not to say"]'::jsonb, false, true, false, true, 7, '00000000-0000-0000-0000-000000000001'),
  ('State of residence', 'state_of_residence', 'text', NULL, false, true, false, true, 8, '00000000-0000-0000-0000-000000000001'),
  ('Residential address', 'residential_address', 'textarea', NULL, false, true, false, true, 9, '00000000-0000-0000-0000-000000000001'),
  ('Alternative phone number', 'alternative_phone', 'text', NULL, false, true, false, true, 10, '00000000-0000-0000-0000-000000000001'),
  ('Highest educational qualification', 'highest_educational_qualification', 'select', '["Primary", "Secondary", "OND/NCE", "HND", "Bachelor''s degree", "Postgraduate", "Other"]'::jsonb, false, true, false, true, 11, '00000000-0000-0000-0000-000000000001'),
  ('Previous work experience', 'previous_work_experience', 'textarea', NULL, false, true, false, true, 12, '00000000-0000-0000-0000-000000000001'),
  ('Current monthly income', 'current_monthly_income', 'number', NULL, false, true, false, true, 13, '00000000-0000-0000-0000-000000000001'),
  ('Intake status', 'intake_status', 'select', '["Enrolled", "Waiting List"]'::jsonb, false, false, false, true, 101, '00000000-0000-0000-0000-000000000001'),
  ('Reporting quarter', 'reporting_quarter', 'select', '["Q1", "Q2", "Q3", "Q4"]'::jsonb, false, false, false, true, 102, '00000000-0000-0000-0000-000000000001'),
  ('Reporting year', 'reporting_year', 'number', NULL, false, false, false, true, 103, '00000000-0000-0000-0000-000000000001'),
  ('Enrolment category', 'enrolment_category', 'select', '["Full Scholarship", "Partial Scholarship", "Sponsorship", "Total Self-Payment"]'::jsonb, false, false, false, true, 104, '00000000-0000-0000-0000-000000000001'),
  ('Scholarship reason / remarks', 'scholarship_reason', 'textarea', NULL, false, false, false, true, 105, '00000000-0000-0000-0000-000000000001'),
  ('Selection period', 'selection_period', 'date', NULL, false, false, false, true, 106, '00000000-0000-0000-0000-000000000001'),
  ('Training outcome', 'training_outcome', 'select', '["Completed", "Dropped off"]'::jsonb, false, false, false, true, 107, '00000000-0000-0000-0000-000000000001'),
  ('Completion period', 'completion_period', 'date', NULL, false, false, false, true, 108, '00000000-0000-0000-0000-000000000001'),
  ('Drop-off remarks', 'dropoff_remarks', 'textarea', NULL, false, false, false, true, 109, '00000000-0000-0000-0000-000000000001'),
  ('Employment pathway', 'employment_pathway', 'select', '["Work", "Apprentice", "Enterprise"]'::jsonb, false, false, false, true, 110, '00000000-0000-0000-0000-000000000001'),
  ('Employment role', 'employment_role', 'text', NULL, false, false, false, true, 111, '00000000-0000-0000-0000-000000000001'),
  ('Employment organization', 'employment_organization', 'text', NULL, false, false, false, true, 112, '00000000-0000-0000-0000-000000000001'),
  ('Employment address', 'employment_address', 'textarea', NULL, false, false, false, true, 113, '00000000-0000-0000-0000-000000000001'),
  ('Monthly employment income', 'employment_monthly_income', 'number', NULL, false, false, false, true, 114, '00000000-0000-0000-0000-000000000001'),
  ('Success story', 'success_story', 'textarea', NULL, false, false, false, true, 115, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (key) DO NOTHING;

DROP FUNCTION IF EXISTS public.get_enrollment_for_completion(uuid);
CREATE FUNCTION public.get_enrollment_for_completion(p_enrollment_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text,
  user_id uuid,
  program_name text,
  hub_id uuid,
  profile_requirements_version integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.full_name, e.email, e.phone, e.user_id, p.program_name,
         p.hub_id, e.profile_requirements_version
  FROM public.enrollments e
  JOIN public.programs p ON p.id = e.program_id
  WHERE e.id = p_enrollment_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_enrollment_for_completion(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_enrollment_fields(p_enrollment_id uuid, p_fields jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_value text;
  v_field_id uuid;
  v_full_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.id = p_enrollment_id AND e.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You may only update your own enrollment profile';
  END IF;

  FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_fields)
  LOOP
    SELECT cf.id INTO v_field_id
    FROM public.custom_fields cf
    JOIN public.enrollments e ON e.id = p_enrollment_id
    JOIN public.programs p ON p.id = e.program_id
    WHERE cf.key = v_key
      AND cf.active = true
      AND cf.visible_to_student = true
      AND (cf.hub_id IS NULL OR cf.hub_id = p.hub_id);

    IF v_field_id IS NOT NULL THEN
      INSERT INTO public.field_values (enrollment_id, field_id, value)
      VALUES (p_enrollment_id, v_field_id, NULLIF(btrim(v_value), ''))
      ON CONFLICT (enrollment_id, field_id) DO UPDATE SET value = EXCLUDED.value;
    END IF;
  END LOOP;

  IF p_fields ? 'first_name' AND p_fields ? 'surname' THEN
    v_full_name := concat_ws(' ', NULLIF(btrim(p_fields->>'first_name'), ''),
      NULLIF(btrim(p_fields->>'middle_name'), ''), NULLIF(btrim(p_fields->>'surname'), ''));
    UPDATE public.enrollments SET full_name = v_full_name WHERE id = p_enrollment_id;
    UPDATE public.profiles SET full_name = v_full_name WHERE user_id = auth.uid();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_enrollment_fields(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_enrollment_fields(uuid, jsonb) FROM anon;
