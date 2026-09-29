-- The "Hub managers view classroom staff" policy queried classrooms, which has
-- an existing policy that queries classroom_staff back → infinite recursion.
-- Fix: SECURITY DEFINER helpers bypass RLS on internal lookups.

CREATE OR REPLACE FUNCTION public._get_classroom_hub_id(p_classroom_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT hub_id FROM public.classrooms WHERE id = p_classroom_id;
$$;

CREATE OR REPLACE FUNCTION public._get_hub_id_for_cs(p_cs_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT cl.hub_id
  FROM public.classroom_staff cs
  JOIN public.classrooms cl ON cl.id = cs.classroom_id
  WHERE cs.id = p_cs_id;
$$;

DROP POLICY IF EXISTS "Hub managers view classroom staff" ON public.classroom_staff;
CREATE POLICY "Hub managers view classroom staff"
  ON public.classroom_staff FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.hub_members hm
      WHERE hm.user_id = auth.uid()
        AND hm.hub_role = 'manager'
        AND hm.hub_id = public._get_classroom_hub_id(classroom_staff.classroom_id)
    )
  );

DROP POLICY IF EXISTS "Hub managers view classroom permissions" ON public.classroom_permissions;
CREATE POLICY "Hub managers view classroom permissions"
  ON public.classroom_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.hub_members hm
      WHERE hm.user_id = auth.uid()
        AND hm.hub_role = 'manager'
        AND hm.hub_id = public._get_hub_id_for_cs(classroom_permissions.classroom_staff_id)
    )
  );
