-- Schedule superadmin-daily-brief daily at 06:00 UTC (07:00 WAT), ahead of the
-- 07:00/07:30 UTC due/recurring reminder jobs so the superadmin sees yesterday's
-- money + pending-approval snapshot first thing. Same net.http_post pattern as
-- daily-due-reminders/daily-recurring-reminders (see 20260515000001, 20260629000005),
-- reusing the same anon-key JWT already committed there.
SELECT cron.schedule(
  'superadmin-daily-brief',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://ozjxktxbzhkujavmzjrf.supabase.co/functions/v1/superadmin-daily-brief',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96anhrdHhiemhrdWphdm16anJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODMxNjIsImV4cCI6MjA5NDE1OTE2Mn0.RWHwniqPDcJ_F4DUuendWvvLCHoJDWYvUUi0jvcaqO4'
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
