-- =====================================================================
-- Schedule the daily-reminder edge function via pg_cron.
--
-- This was missing — the function existed but nothing was actually
-- invoking it on a schedule. Result: approvers never received delayed-
-- approval reminders even though the system was wired to send them.
--
-- Schedule: 07:00 UTC daily = 10:00 GMT+3 (Kuwait), the start of the
-- working day for most approvers. Adjust the cron expression below if
-- a different time is preferred.
--
-- Mechanism: pg_cron runs `cron.schedule(...)` which queues a SQL job;
-- the job uses pg_net.http_post to invoke the Supabase edge function
-- with the service-role key (so the function can do its work
-- regardless of who's logged in).
--
-- Pre-requisites: pg_cron and pg_net extensions must already be
-- installed in this Supabase project. They were enabled by an earlier
-- migration (20260312073501_*.sql).
-- =====================================================================

-- Make sure pg_net is available (it's separate from pg_cron)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;

-- Idempotent: drop any existing job with this name before re-scheduling
DO $$
DECLARE
  _job_id bigint;
BEGIN
  SELECT jobid INTO _job_id FROM cron.job WHERE jobname = 'daily-overdue-approvals';
  IF _job_id IS NOT NULL THEN
    PERFORM cron.unschedule(_job_id);
  END IF;
END $$;

-- Schedule for 07:00 UTC daily.
SELECT cron.schedule(
  'daily-overdue-approvals',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url', true) || '/functions/v1/reminder-overdue-approvals',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

-- NOTE: `current_setting('app.supabase_url')` and
-- `current_setting('app.supabase_service_role_key')` must be set as
-- database-level GUC parameters by Supabase (they typically are on
-- managed Supabase). If not, the cron job will fail with
-- "unrecognized configuration parameter" — in that case, ask Lovable
-- to set them via:
--   ALTER DATABASE postgres SET app.supabase_url = '<project url>';
--   ALTER DATABASE postgres SET app.supabase_service_role_key = '<key>';
-- and the cron job will pick them up on next run.
