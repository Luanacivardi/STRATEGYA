-- Aba "Relatórios" (Gestão de Auditorias): registro requisito a requisito da constatação
-- (conforme/não atende/atende parcialmente), lista de pessoas auditadas (documentação de RH),
-- instrumentos auditados (calibração) e procedimentos auditados (controle de ações), além da
-- conclusão da auditoria. O "texto pré-escrito" da situação (ver auditorias.js) é uma frase
-- genérica de apoio (não é o texto oficial da norma ISO, que é material licenciado e não pode
-- ser reproduzido pelo sistema) — o auditor sempre edita/complementa com a evidência real.

create table auditorias_relatorio_itens (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references auditorias(id) on delete cascade,
  processo_id uuid references auditorias_processos(id) on delete set null,
  numero_requisito text not null,
  norma text check (norma in ('iso9001', 'iso14001', 'iso45001', 'outra')),
  situacao text not null check (situacao in ('conforme', 'nao_atende', 'atende_parcial')),
  descricao text,
  created_at timestamptz not null default now()
);
create index idx_auditorias_relatorio_itens_auditoria on auditorias_relatorio_itens(auditoria_id);

create table auditorias_relatorio_pessoas (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references auditorias(id) on delete cascade,
  nome text not null,
  documentacao_rh_conforme boolean not null default true,
  observacao text,
  created_at timestamptz not null default now()
);
create index idx_auditorias_relatorio_pessoas_auditoria on auditorias_relatorio_pessoas(auditoria_id);

create table auditorias_relatorio_instrumentos (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references auditorias(id) on delete cascade,
  instrumento text not null,
  calibracao_conforme boolean not null default true,
  observacao text,
  created_at timestamptz not null default now()
);
create index idx_auditorias_relatorio_instrumentos_auditoria on auditorias_relatorio_instrumentos(auditoria_id);

create table auditorias_relatorio_procedimentos (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references auditorias(id) on delete cascade,
  procedimento text not null,
  controle_acoes_conforme boolean not null default true,
  observacao text,
  created_at timestamptz not null default now()
);
create index idx_auditorias_relatorio_procedimentos_auditoria on auditorias_relatorio_procedimentos(auditoria_id);

alter table auditorias add column conclusao_texto text;
comment on column auditorias.conclusao_texto is 'Texto de conclusão da auditoria, pré-preenchido com um modelo genérico com base nos achados e editável pelo auditor.';

alter table auditorias_relatorio_itens enable row level security;
alter table auditorias_relatorio_pessoas enable row level security;
alter table auditorias_relatorio_instrumentos enable row level security;
alter table auditorias_relatorio_procedimentos enable row level security;

create policy "auditorias_relatorio_itens_select" on auditorias_relatorio_itens for select
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id)));
create policy "auditorias_relatorio_itens_write" on auditorias_relatorio_itens for all
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])));

create policy "auditorias_relatorio_pessoas_select" on auditorias_relatorio_pessoas for select
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id)));
create policy "auditorias_relatorio_pessoas_write" on auditorias_relatorio_pessoas for all
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])));

create policy "auditorias_relatorio_instrumentos_select" on auditorias_relatorio_instrumentos for select
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id)));
create policy "auditorias_relatorio_instrumentos_write" on auditorias_relatorio_instrumentos for all
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])));

create policy "auditorias_relatorio_procedimentos_select" on auditorias_relatorio_procedimentos for select
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id)));
create policy "auditorias_relatorio_procedimentos_write" on auditorias_relatorio_procedimentos for all
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])));

comment on table auditorias_relatorio_itens is 'Constatação por requisito de norma (conforme/não atende/atende parcial), agrupada por número de requisito na impressão.';
