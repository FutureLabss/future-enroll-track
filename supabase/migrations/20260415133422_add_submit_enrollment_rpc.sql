-- Migration to add a secure RPC function for submitting enrollment fields

CREATE OR REPLACE FUNCTION public.submit_enrollment_fields(
  p_enrollment_id UUID,
  p_fields JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
  v_val TEXT;
  v_field_id UUID;
BEGIN
  -- Ensure enrollment exists
  IF NOT EXISTS (SELECT 1 FROM public.enrollments WHERE id = p_enrollment_id) THEN
    RAISE EXCEPTION 'Enrollment not found';
  END IF;

  -- For each key in the JSON, find the custom_field id and insert/update
  FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_fields)
  LOOP
    SELECT id INTO v_field_id FROM public.custom_fields WHERE key = v_key;
    
    IF v_field_id IS NOT NULL THEN
      INSERT INTO public.field_values (enrollment_id, field_id, value)
      VALUES (p_enrollment_id, v_field_id, v_val)
      ON CONFLICT (enrollment_id, field_id) 
      DO UPDATE SET value = EXCLUDED.value;
    END IF;
  END LOOP;
END;
$$;
