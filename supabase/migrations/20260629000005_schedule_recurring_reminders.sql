-- Schedule send-recurring-reminders to run daily at 07:30 UTC (08:30 WAT).
-- This function was previously unscheduled — no reminders were going out.
-- Runs 30 minutes after the existing check-due-reminders job (07:00 UTC).

SELECT cron.schedule(
  'daily-recurring-reminders',
  '30 7 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://ozjxktxbzhkujavmzjrf.supabase.co/functions/v1/send-recurring-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96anhrdHhiemhrdWphdm16anJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODMxNjIsImV4cCI6MjA5NDE1OTE2Mn0.RWHwniqPDcJ_F4DUuendWvvLCHoJDWYvUUi0jvcaqO4'
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
