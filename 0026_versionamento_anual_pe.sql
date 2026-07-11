-- Plano de Ação: numeração sequencial automática por empresa/ano (ex: 001/2026)
-- e reestruturação em modelo Macro + Ações Micro (cada ação micro tem responsável/prazo/status/% próprios).

alter table planos_acao add column numero text;

create or replace function gerar_numero_plano_acao()
returns trigger
language plpgsql
as $$
declare
  v_ano int := extract(year from now());
  v_proximo int;
begin
  if new.numero is null then
    select coalesce(max((split_part(numero, '/', 1))::int), 0) + 1
      into v_proximo
      from planos_acao
      where empresa_id = new.empresa_id
        and split_part(numero, '/', 2) = v_ano::text;
    new.numero := lpad(v_proximo::text, 3, '0') || '/' || v_ano::text;
  end if;
  return new;
end;
$$;

create trigger trg_gerar_numero_plano_acao
before insert on planos_acao
for each row execute function gerar_numero_plano_acao();

-- Backfill dos planos já existentes, numerados na ordem de criação dentro do ano.
with numerados as (
  select id, empresa_id,
    row_number() over (partition by empresa_id, extract(year from created_at) order by created_at) as rn,
    extract(year from created_at) as ano
  from planos_acao
)
update planos_acao p
set numero = lpad(n.rn::text, 3, '0') || '/' || n.ano::text
from numerados n
where p.id = n.id;

alter table planos_acao alter column numero set not null;
alter table planos_acao add constraint planos_acao_numero_unique unique (empresa_id, numero);

-- Ações Micro: cada plano macro pode ter várias ações micro, cada uma com responsável/prazo/status/% próprios.
-- O % do macro (planos_acao.percentual_conclusao) passa a ser calculado no cliente como a média das ações micro.
create table planos_acao_itens (
  id uuid primary key default gen_random_uuid(),
  plano_acao_id uuid not null references planos_acao(id) on delete cascade,
  descricao text not null,
  responsavel_id uuid references auth.users(id),
  prazo date,
  status text not null default 'nao_iniciado' check (status in ('nao_iniciado', 'em_andamento', 'concluido', 'atrasado')),
  percentual_conclusao smallint not null default 0 check (percentual_conclusao between 0 and 100),
  created_at timestamptz not null default now()
);
create index idx_planos_acao_itens_plano on planos_acao_itens(plano_acao_id);

alter table planos_acao_itens enable row level security;

create policy "planos_itens_select" on planos_acao_itens for select
  using (exists (select 1 from planos_acao p where p.id = plano_acao_id and usuario_tem_acesso_empresa(p.empresa_id)));

create policy "planos_itens_write" on planos_acao_itens for all
  using (exists (select 1 from planos_acao p where p.id = plano_acao_id and usuario_tem_acesso_empresa(p.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from planos_acao p where p.id = plano_acao_id and usuario_tem_acesso_empresa(p.empresa_id, array['orbeex', 'admin'])));
