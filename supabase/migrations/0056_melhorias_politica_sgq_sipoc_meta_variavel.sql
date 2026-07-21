-- Melhorias do Planejamento Estratégico:
-- 1) Política do SGI/SGQ nas Informações da Empresa (Contexto).
-- 2) SIPOC por processo do Macrofluxo (nova aba no Contexto).
-- 3) Indicadores com meta fixa ou variável por período (indicador_metas).

-- 1) Política do SGI/SGQ
alter table empresas add column if not exists politica_sgq text;
comment on column empresas.politica_sgq is 'Política do SGI/SGQ da empresa, exibida em Contexto > Informações da Empresa.';

-- 2) SIPOC: uma linha por processo do macrofluxo (fornecedores, entradas, atividades, saídas, clientes)
create table if not exists sipoc (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  processo_id uuid not null references macrofluxo_processos(id) on delete cascade,
  fornecedores text,
  entradas text,
  atividades text,
  saidas text,
  clientes text,
  created_at timestamptz not null default now(),
  unique (processo_id)
);

create index if not exists idx_sipoc_empresa on sipoc(empresa_id);
create index if not exists idx_sipoc_processo on sipoc(processo_id);

alter table sipoc enable row level security;

create policy "sipoc_select" on sipoc for select
  using (usuario_tem_acesso_empresa(empresa_id));
create policy "sipoc_insert" on sipoc for insert
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id) = 'total');
create policy "sipoc_update" on sipoc for update
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id) = 'total')
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id) = 'total');
create policy "sipoc_delete" on sipoc for delete
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id) = 'total');

comment on table sipoc is 'Descrição SIPOC (Suppliers, Inputs, Process, Outputs, Customers) por processo do macrofluxo.';

-- 3) Meta fixa ou variável por período
alter table indicadores add column if not exists tipo_meta text not null default 'fixa';
alter table indicadores drop constraint if exists indicadores_tipo_meta_check;
alter table indicadores add constraint indicadores_tipo_meta_check check (tipo_meta in ('fixa','variavel'));
comment on column indicadores.tipo_meta is 'fixa: usa indicadores.meta para todos os períodos; variavel: usa indicador_metas por período (mês).';

create table if not exists indicador_metas (
  id uuid primary key default gen_random_uuid(),
  indicador_id uuid not null references indicadores(id) on delete cascade,
  periodo date not null, -- normalizado para o dia 1º do mês
  meta numeric not null,
  created_at timestamptz not null default now(),
  unique (indicador_id, periodo)
);

create index if not exists idx_indicador_metas_indicador on indicador_metas(indicador_id);

alter table indicador_metas enable row level security;

-- Mesmo padrão de resultados_indicadores: leitura para quem acessa a empresa; escrita orbeex/admin.
create policy "indicador_metas_select" on indicador_metas for select
  using (exists (select 1 from indicadores i where i.id = indicador_id and usuario_tem_acesso_empresa(i.empresa_id)));
create policy "indicador_metas_insert" on indicador_metas for insert
  with check (exists (select 1 from indicadores i where i.id = indicador_id and usuario_tem_acesso_empresa(i.empresa_id, array['orbeex','admin'])));
create policy "indicador_metas_update" on indicador_metas for update
  using (exists (select 1 from indicadores i where i.id = indicador_id and usuario_tem_acesso_empresa(i.empresa_id, array['orbeex','admin'])))
  with check (exists (select 1 from indicadores i where i.id = indicador_id and usuario_tem_acesso_empresa(i.empresa_id, array['orbeex','admin'])));
create policy "indicador_metas_delete" on indicador_metas for delete
  using (exists (select 1 from indicadores i where i.id = indicador_id and usuario_tem_acesso_empresa(i.empresa_id, array['orbeex','admin'])));

comment on table indicador_metas is 'Metas por período (mês) para indicadores com tipo_meta = variavel.';
