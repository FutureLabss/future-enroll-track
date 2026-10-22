-- In-app notifications need somewhere to send the user ("open the cohort") and a
-- way to tell which record a reminder was about, so recurring reminders can be
-- de-duplicated per entity instead of re-sent every day.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS entity_id uuid;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type_entity
  ON public.notifications (type, entity_id, created_at DESC)
  WHERE entity_id IS NOT NULL;
