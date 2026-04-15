-- Migration to add a secure RPC function and update trigger for claiming an enrollment

CREATE OR REPLACE FUNCTION public.link_enrollment_to_user(p_enrollment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.enrollments
  SET user_id = auth.uid()
  WHERE id = p_enrollment_id
  AND user_id IS NULL
  AND LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()));
END;
$$;

-- Auto-link enrollments upon signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  
  -- Default role is student
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student');

  -- Automatically assign past offline-enrollments to this new authenticated user
  UPDATE public.enrollments
  SET user_id = NEW.id
  WHERE LOWER(email) = LOWER(NEW.email) AND user_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
