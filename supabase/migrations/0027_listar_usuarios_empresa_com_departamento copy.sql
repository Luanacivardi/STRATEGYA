-- Ata de reunião: permite vincular vários indicadores (cada um com sua própria consideração),
-- separa considerações gerais das considerações por indicador, e adiciona uma lista de ações
-- em formato TO DO, com opção de "promover" uma ação para um Plano de Ação completo.

create table rac_indicadores (
  id uuid primary key default gen_random_uuid(),
  reuniao_id uuid not null references reunioes_analise_critica(id) on delete cascade,
  indicador_id uuid not null references indicadores(id) on delete cascade,
  consideracoes text,
  unique (reuniao_id, indicador_id)
);
create index idx_rac_indicadores_reuniao on rac_indicadores(reuniao_id);
alter table rac_indicadores enable row level security;
create policy "rac_indicadores_select" on rac_indicadores for select
  using (exists (select 1 from reunioes_analise_critica r where r.id = reuniao_id and usuario_tem_acesso_empresa(r.empresa_id)));
create policy "rac_indicadores_write" on rac_indicadores for all
  using (exists (select 1 from reunioes_analise_critica r where r.id = reuniao_id and usuario_tem_acesso_empresa(r.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from reunioes_analise_critica r where r.id = reuniao_id and usuario_tem_acesso_empresa(r.empresa_id, array['orbeex', 'admin'])));

-- Migra o indicador único + consideração existentes para a nova estrutura.
insert into rac_indicadores (reuniao_id, indicador_id, consideracoes)
select id, indicador_id, consideracoes from reunioes_analise_critica where indicador_id is not null;

alter table reunioes_analise_critica drop column indicador_id;
-- "consideracoes" passa a significar "considerações gerais" (não mais ligada a um único indicador);
-- o valor antigo já foi migrado para rac_indicadores, então zera aqui para não duplicar.
update reunioes_analise_critica set consideracoes = null;

-- Ações em formato TO DO.
create table rac_acoes (
  id uuid primary key default gen_random_uuid(),
  reuniao_id uuid not null references reunioes_analise_critica(id) on delete cascade,
  descricao text not null,
  responsavel_id uuid references auth.users(id),
  prazo date,
  concluida boolean not null default false,
  plano_acao_id uuid references planos_acao(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_rac_acoes_reuniao on rac_acoes(reuniao_id);
alter table rac_acoes enable row level security;
create policy "rac_acoes_select" on rac_acoes for select
  using (exists (select 1 from reunioes_analise_critica r where r.id = reuniao_id and usuario_tem_acesso_empresa(r.empresa_id)));
create policy "rac_acoes_write" on rac_acoes for all
  using (exists (select 1 from reunioes_analise_critica r where r.id = reuniao_id and usuario_tem_acesso_empresa(r.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from reunioes_analise_critica r where r.id = reuniao_id and usuario_tem_acesso_empresa(r.empresa_id, array['orbeex', 'admin'])));

-- "Abrir Plano de Ação" a partir de uma ação da ata cria um plano_acao com origem 'rac'.
alter table planos_acao drop constraint planos_acao_origem_check;
alter table planos_acao add constraint planos_acao_origem_check check (origem in ('objetivo', 'indicador', 'risco', 'nc', 'rac'));
