-- A função backup-diario não tinha autorização nenhuma: o cron a chamava com a chave anon (que é
-- pública, está no config.js do app), então qualquer pessoa com essa chave disparava um dump
-- completo do banco quantas vezes quisesse — abuso de custo e sobrescrita do backup do dia.
--
-- Agora a autorização é um token próprio, gerado e guardado pelo banco: o cron manda no header
-- x-backup-token e a função compara com o mesmo valor (que ela lê com a service_role). Ninguém
-- precisa saber o token — nem para instalar, nem para rodar. Para rotacionar:
--   update public.backup_token set token = encode(extensions.gen_random_bytes(32), 'hex'),
--                                  atualizado_em = now();
-- Como a função passa a exigir esse token, o verify_jwt dela é desligado no deploy e a chave anon
-- sai do agendamento — some junto o risco de o backup parar em silêncio se a chave for rotacionada.
create table if not exists public.backup_token (
  id boolean primary key default true check (id),
  token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  atualizado_em timestamptz not null default now()
);

insert into public.backup_token (id) values (true) on conflict (id) do nothing;

-- RLS ligada e sem policy alguma: anon e authenticated não leem nada, em nenhuma hipótese.
-- Só a service_role (que ignora RLS) enxerga o token — ou seja, só a própria Edge Function.
alter table public.backup_token enable row level security;
revoke all on table public.backup_token from anon, authenticated;

select cron.unschedule('backup-diario-strategya');

select cron.schedule(
  'backup-diario-strategya',
  '0 6 * * *', -- 06:00 UTC = 03:00 horário de Brasília
  $cron$
  select net.http_post(
    url := 'https://qfmzgsoindjtqzewgecp.supabase.co/functions/v1/backup-diario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-backup-token', (select token from public.backup_token where id)
    ),
    timeout_milliseconds := 30000,
    body := '{}'::jsonb
  ) as request_id;
  $cron$
);
