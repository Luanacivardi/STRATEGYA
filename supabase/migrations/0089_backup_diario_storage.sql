-- Backup diário automático: o plano free do Supabase não inclui backups
-- automáticos, então criamos um pipeline próprio (pg_cron + Edge Function)
-- que gera um dump JSON de todas as tabelas do schema public e guarda num
-- bucket privado de Storage, com retenção de 30 dias.

create extension if not exists pg_cron;
create extension if not exists pg_net;

insert into storage.buckets (id, name, public, file_size_limit)
values ('backups', 'backups', false, 26214400)
on conflict (id) do nothing;

create or replace function public.gerar_dump_backup()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  tabela text;
  dados jsonb;
  resultado jsonb := '{}'::jsonb;
begin
  for tabela in
    select tablename from pg_tables where schemaname = 'public' order by tablename
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', tabela) into dados;
    resultado := jsonb_set(resultado, array[tabela], dados);
  end loop;
  return resultado;
end;
$fn$;

revoke all on function public.gerar_dump_backup() from public;
revoke all on function public.gerar_dump_backup() from anon;
revoke all on function public.gerar_dump_backup() from authenticated;
grant execute on function public.gerar_dump_backup() to service_role;

select cron.schedule(
  'backup-diario-strategya',
  '0 6 * * *', -- 06:00 UTC = 03:00 horário de Brasília
  $cron$
  select net.http_post(
    url := 'https://qfmzgsoindjtqzewgecp.supabase.co/functions/v1/backup-diario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmbXpnc29pbmRqdHF6ZXdnZWNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5OTUwOTAsImV4cCI6MjA5ODU3MTA5MH0.w-l0FIHrZm5Sxk9lv88XIFe1gvTPEHZjgovLNB2Np8s'
    ),
    timeout_milliseconds := 30000,
    body := '{}'::jsonb
  ) as request_id;
  $cron$
);
