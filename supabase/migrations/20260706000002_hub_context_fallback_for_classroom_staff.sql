-- Teaching staff could not create cohorts: the hub_id trigger resolves hub
-- context via hub_members, which only contains admins/owners. For staff the
-- trigger left hub_id NULL, so the "Staff with can_edit_cohorts can insert
-- cohorts" policy's hub check (cohorts.hub_id = cl.hub_id) failed and the
-- insert was rejected as an RLS violation. Fall back to the hub of the
-- user's active classroom assignment when there is no hub membership.

CREATE OR REPLACE FUNCTION public.set_hub_id_from_context()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.hub_id IS NULL THEN
    NEW.hub_id := public.get_my_hub_id();
  END IF;
  IF NEW.hub_id IS NULL THEN
    SELECT cl.hub_id INTO NEW.hub_id
    FROM public.classroom_staff cs
    JOIN public.classrooms cl ON cl.id = cs.classroom_id
    WHERE cs.user_id = auth.uid() AND cs.status = 'active'
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
