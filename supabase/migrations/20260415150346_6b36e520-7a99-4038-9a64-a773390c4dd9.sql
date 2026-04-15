
-- Add unique constraint for upsert
ALTER TABLE public.field_values
ADD CONSTRAINT field_values_enrollment_field_unique UNIQUE (enrollment_id, field_id);

-- submit_enrollment_fields RPC
CREATE OR REPLACE FUNCTION public.submit_enrollment_fields(p_enrollment_id UUID, p_fields JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _key TEXT;
  _value TEXT;
  _field_id UUID;
BEGIN
  FOR _key, _value IN SELECT * FROM jsonb_each_text(p_fields)
  LOOP
    SELECT id INTO _field_id FROM public.custom_fields WHERE key = _key AND active = true;
    IF _field_id IS NOT NULL THEN
      INSERT INTO public.field_values (enrollment_id, field_id, value)
      VALUES (p_enrollment_id, _field_id, _value)
      ON CONFLICT (enrollment_id, field_id) DO UPDATE SET value = EXCLUDED.value;
    END IF;
  END LOOP;
END;
$$;

-- link_enrollment_to_user RPC
CREATE OR REPLACE FUNCTION public.link_enrollment_to_user(p_enrollment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.enrollments
  SET user_id = auth.uid()
  WHERE id = p_enrollment_id
    AND user_id IS NULL
    AND LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()));
END;
$$;

-- Update handle_new_user to auto-link enrollments
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student');

  -- Auto-link any existing enrollments
  UPDATE public.enrollments
  SET user_id = NEW.id
  WHERE LOWER(email) = LOWER(NEW.email) AND user_id IS NULL;

  RETURN NEW;
END;
$$;
