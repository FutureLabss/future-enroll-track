-- Add hub_id to notifications, backfill, auto-set via trigger, update RLS.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS hub_id uuid REFERENCES public.hubs(id);

-- Backfill from enrollment → program chain
UPDATE public.notifications n
SET hub_id = p.hub_id
FROM public.enrollments e
JOIN public.programs p ON p.id = e.program_id
WHERE e.id = n.enrollment_id
  AND n.hub_id IS NULL;

-- Remaining (no enrollment_id) → FutureLabs
UPDATE public.notifications
SET hub_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE hub_id IS NULL;

-- Trigger: auto-set hub_id on INSERT from enrollment chain, else caller's hub
CREATE OR REPLACE FUNCTION public.notifications_set_hub_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.hub_id IS NULL THEN
    IF NEW.enrollment_id IS NOT NULL THEN
      SELECT p.hub_id INTO NEW.hub_id
      FROM public.enrollments e
      JOIN public.programs p ON p.id = e.program_id
      WHERE e.id = NEW.enrollment_id;
    END IF;
    IF NEW.hub_id IS NULL THEN
      NEW.hub_id := public.get_my_hub_id();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_set_hub_id ON public.notifications;
CREATE TRIGGER trg_notifications_set_hub_id
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_set_hub_id();

-- Update RLS to filter by hub_id directly
DROP POLICY IF EXISTS "Admins can manage notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins manage notifications"     ON public.notifications;

CREATE POLICY "Admins manage notifications"
  ON public.notifications FOR ALL
  USING (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  )
  WITH CHECK (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  );
