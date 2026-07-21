-- Redesenho do SIPOC: em vez de 5 campos de texto livre por processo, cada processo passa a ter
-- vários fornecedores/entradas cadastrados individualmente. Quando o fornecedor é um processo
-- interno (existe no Macrofluxo), essa entrada aparece automaticamente como SAÍDA do processo
-- fornecedor (calculado na consulta, sem duplicar dado) — replicando o modelo do Anexo B (Mapa de
-- Processo) da Maxicorte, onde cada linha de entrada tem seu "Processo de Entrada" e a saída do
-- processo de origem é a mesma informação, só espelhada.

-- 1) sipoc: mantém só a descrição das atividades do processo (texto livre, 1 por processo).
alter table sipoc drop column if exists fornecedores;
alter table sipoc drop column if exists entradas;
alter table sipoc drop column if exists saidas;
alter table sipoc drop column if exists clientes;

-- 2) Entradas: quem recebe (processo_id) + de onde vem (fornecedor interno OU externo) + o quê.
create table sipoc_entradas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  processo_id uuid not null references macrofluxo_processos(id) on delete cascade,
  fornecedor_processo_id uuid references macrofluxo_processos(id) on delete set null,
  fornecedor_externo text,
  descricao text not null,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  check (
    (fornecedor_processo_id is not null and fornecedor_externo is null) or
    (fornecedor_processo_id is null and fornecedor_externo is not null)
  )
);

create index idx_sipoc_entradas_empresa on sipoc_entradas(empresa_id);
create index idx_sipoc_entradas_processo on sipoc_entradas(processo_id);
create index idx_sipoc_entradas_fornecedor on sipoc_entradas(fornecedor_processo_id);

alter table sipoc_entradas enable row level security;

create policy "sipoc_entradas_select" on sipoc_entradas for select
  using (usuario_tem_acesso_empresa(empresa_id));
create policy "sipoc_entradas_insert" on sipoc_entradas for insert
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id) = 'total');
create policy "sipoc_entradas_update" on sipoc_entradas for update
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id) = 'total')
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id) = 'total');
create policy "sipoc_entradas_delete" on sipoc_entradas for delete
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id) = 'total');

comment on table sipoc_entradas is 'Entradas do SIPOC: cada linha é um fornecedor (interno via fornecedor_processo_id, ou externo via fornecedor_externo) dando uma entrada a processo_id. Quando o fornecedor é interno, esta mesma linha aparece automaticamente como saída do processo fornecedor (consulta, não duplicação).';

-- 3) Saídas manuais: só para destinos que não têm entrada correspondente cadastrada (ex: Cliente,
-- Governo, Transportadoras — entidades externas ao Macrofluxo). Saídas para processos internos
-- não se cadastram aqui: bastam a entrada do processo de destino, que já gera a saída automática.
create table sipoc_saidas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  processo_id uuid not null references macrofluxo_processos(id) on delete cascade,
  destino_processo_id uuid references macrofluxo_processos(id) on delete set null,
  destino_externo text,
  descricao text not null,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  check (
    (destino_processo_id is not null and destino_externo is null) or
    (destino_processo_id is null and destino_externo is not null)
  )
);

create index idx_sipoc_saidas_empresa on sipoc_saidas(empresa_id);
create index idx_sipoc_saidas_processo on sipoc_saidas(processo_id);
create index idx_sipoc_saidas_destino on sipoc_saidas(destino_processo_id);

alter table sipoc_saidas enable row level security;

create policy "sipoc_saidas_select" on sipoc_saidas for select
  using (usuario_tem_acesso_empresa(empresa_id));
create policy "sipoc_saidas_insert" on sipoc_saidas for insert
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id) = 'total');
create policy "sipoc_saidas_update" on sipoc_saidas for update
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id) = 'total')
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id) = 'total');
create policy "sipoc_saidas_delete" on sipoc_saidas for delete
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id) = 'total');

comment on table sipoc_saidas is 'Saídas manuais do SIPOC — para destinos externos ao Macrofluxo (Cliente, Governo...) ou casos não cobertos pela sincronização automática via sipoc_entradas.';
