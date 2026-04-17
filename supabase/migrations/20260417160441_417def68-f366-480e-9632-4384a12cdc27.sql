
-- Allow the enrollment completion page to load for both anonymous and logged-in users
-- without exposing the enrollments table publicly via RLS.

CREATE OR REPLACE FUNCTION public.get_enrollment_for_completion(p_enrollment_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  user_id uuid,
  program_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.full_name,
    e.email,
    e.user_id,
    p.program_name
  FROM public.enrollments e
  LEFT JOIN public.programs p ON p.id = e.program_id
  WHERE e.id = p_enrollment_id;
END;
$$;

-- Allow both anonymous (for first-time link click) and authenticated users to call it
GRANT EXECUTE ON FUNCTION public.get_enrollment_for_completion(uuid) TO anon, authenticated;

-- Also expose existing custom field values for an enrollment so partially-completed
-- profiles can be resumed even before the user is linked.
CREATE OR REPLACE FUNCTION public.get_enrollment_field_values(p_enrollment_id uuid)
RETURNS TABLE (
  field_key text,
  value text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT cf.key, fv.value
  FROM public.field_values fv
  JOIN public.custom_fields cf ON cf.id = fv.field_id
  WHERE fv.enrollment_id = p_enrollment_id
    AND cf.active = true
    AND cf.visible_to_student = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_enrollment_field_values(uuid) TO anon, authenticated;

-- Allow public users to update field values for enrollments that aren't yet linked to a user
-- (so the submit_enrollment_fields RPC's UPSERT works for anonymous flow)
DROP POLICY IF EXISTS "Public can update field values for unlinked enrollments" ON public.field_values;
CREATE POLICY "Public can update field values for unlinked enrollments"
ON public.field_values
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.id = field_values.enrollment_id AND e.user_id IS NULL
  )
);
