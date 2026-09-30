-- Preserve the exact personalized email content and recipient used for each delivery.
ALTER TABLE public.marketing_email_deliveries
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS rendered_subject text,
  ADD COLUMN IF NOT EXISTS rendered_html text;