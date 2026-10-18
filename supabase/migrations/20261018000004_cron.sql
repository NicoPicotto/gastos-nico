-- Jobs diarios (horarios en UTC; Argentina = UTC-3).
-- Requiere el secreto de Vault "project_url" (ver README):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Refresca la cotización MEP: 05:45 y 18:00 ART.
select cron.schedule(
  'fx-refresh',
  '45 8,21 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/fx-refresh',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Genera recurrentes: 06:00 ART.
select cron.schedule('generar-recurrentes', '0 9 * * *', $$ select public.generar_recurrentes(); $$);
