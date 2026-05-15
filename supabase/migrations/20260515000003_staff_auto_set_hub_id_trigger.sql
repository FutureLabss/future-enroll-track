-- Auto-set hub_id on staff INSERT so admins don't have to send it explicitly.
CREATE OR REPLACE FUNCTION public.staff_set_hub_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.hub_id IS NULL THEN
    NEW.hub_id := public.get_my_hub_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_set_hub_id ON public.staff;
CREATE TRIGGER trg_staff_set_hub_id
  BEFORE INSERT ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.staff_set_hub_id();
