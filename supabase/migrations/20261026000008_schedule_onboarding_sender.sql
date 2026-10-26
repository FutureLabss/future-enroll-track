-- Run send-onboarding-emails every 10 minutes, so the day-0 welcome lands
-- shortly after someone enrolls. Same vault secret and net.http_post pattern
-- as send-weekly-digest.
SELECT cron.unschedule('send-onboarding-emails')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-onboarding-emails');

SELECT cron.schedule(
  'send-onboarding-emails',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ozjxktxbzhkujavmzjrf.supabase.co/functions/v1/send-onboarding-emails',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='crm_cron_secret' LIMIT 1)),
    body := '{}'::jsonb
  );
  $$
);
