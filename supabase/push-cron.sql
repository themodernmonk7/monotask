-- Schedules the send-reminders Edge Function to run every minute.
--
-- Run AFTER the function is deployed and after storing two secrets in Vault
-- (Dashboard -> Project Settings -> Vault, or the SQL below):
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'monotask_project_url');
--   select vault.create_secret('<same value as the CRON_SECRET function secret>', 'monotask_cron_secret');
--
-- Safe to re-run: the job is replaced, not duplicated.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monotask-send-reminders') THEN
    PERFORM cron.unschedule('monotask-send-reminders');
  END IF;
END $$;

SELECT cron.schedule(
  'monotask-send-reminders',
  '* * * * *',
  $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monotask_project_url')
             || '/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monotask_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);
