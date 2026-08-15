-- Backup que falha em silêncio é backup que não existe: até aqui, uma falha do cron ou da Edge
-- Function só apareceria no dia em que alguém precisasse restaurar. Esta tabela guarda o resultado
-- de cada execução (sucesso ou erro), e a view abaixo responde "o backup está em dia?" numa linha.
create table if not exists public.backup_execucoes (
  id uuid primary key default gen_random_uuid(),
  executado_em timestamptz not null default now(),
  sucesso boolean not null,
  arquivo text,
  bytes bigint,
  erro text
);

create index if not exists idx_backup_execucoes_data on public.backup_execucoes(executado_em desc);

alter table public.backup_execucoes enable row level security;
revoke all on table public.backup_execucoes from anon, authenticated;

create or replace function public.registrar_execucao_backup(
  p_sucesso boolean,
  p_arquivo text default null,
  p_bytes bigint default null,
  p_erro text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.backup_execucoes (sucesso, arquivo, bytes, erro)
  values (p_sucesso, p_arquivo, p_bytes, p_erro);
$$;

revoke all on function public.registrar_execucao_backup(boolean, text, bigint, text) from public, anon, authenticated;
grant execute on function public.registrar_execucao_backup(boolean, text, bigint, text) to service_role;

-- Consulta rápida de saúde do backup (rodar no SQL Editor quando quiser conferir):
--   select * from public.backup_saude;
create or replace view public.backup_saude as
  select
    max(executado_em) filter (where sucesso) as ultimo_sucesso,
    max(executado_em) filter (where not sucesso) as ultima_falha,
    (now() - max(executado_em) filter (where sucesso)) > interval '36 hours' as atrasado,
    count(*) filter (where not sucesso and executado_em > now() - interval '7 days') as falhas_7_dias
  from public.backup_execucoes;

revoke all on public.backup_saude from anon, authenticated;
