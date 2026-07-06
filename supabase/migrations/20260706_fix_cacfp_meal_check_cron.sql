-- 20260706_fix_cacfp_meal_check_cron.sql
--
-- Fix cron job 3 (cacfp-meal-check, every 5 min). It had FAILED 1511/1511 runs
-- since inception: the Authorization header was built by string-concatenating
-- current_setting('app.service_role_key') — a GUC that is not set on this
-- project — so the header text cast to ::jsonb blew up with
--   ERROR: invalid input syntax for type json … Token ""}" is invalid.
-- and net.http_post was never reached.
--
-- Fix mirrors the working job 1 (process-receipts): build the header with
-- jsonb_build_object (no fragile string concat) and pass the project anon key as
-- the Bearer. cacfp-meal-check performs no in-handler auth check; the anon JWT
-- only has to satisfy the platform verify_jwt gate, which it does. The function
-- uses SUPABASE_SERVICE_ROLE_KEY internally (injected by the runtime).
--
-- NOTE: once this runs, the job resumes its intended behavior — sending
-- "missed meal count" push alerts (deduped per day via notification_log).

select cron.alter_job(
  job_id := 3,
  command := $cmd$
  select net.http_post(
    url := 'https://trrmyqfpxntmgxnqkikp.supabase.co/functions/v1/cacfp-meal-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRycm15cWZweG50bWd4bnFraWtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTczMzMsImV4cCI6MjA5NjE3MzMzM30.b2zlijzzwPPgZqTFNrOvhgNWZpBSxmQQioErMpoX_Ko'
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
