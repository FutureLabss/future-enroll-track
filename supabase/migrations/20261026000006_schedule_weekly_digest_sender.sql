-- Run send-weekly-digest every 10 minutes. It starts any issue whose slot has
-- arrived (Monday 07:00 WAT, or "send now") and works through the delivery queue
-- in batches, so a long list finishes over a few runs. Same vault secret and
-- net.http_post pattern as process-marketing-campaigns.
SELECT cron.unschedule('send-weekly-digest')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-weekly-digest');

SELECT cron.schedule(
  'send-weekly-digest',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ozjxktxbzhkujavmzjrf.supabase.co/functions/v1/send-weekly-digest',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='crm_cron_secret' LIMIT 1)),
    body := '{}'::jsonb
  );
  $$
);
