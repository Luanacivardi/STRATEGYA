-- Schema inicial: Planejamento Estratégico ORBEEX (multiempresa, ISO 9001:2015)

create extension if not exists "pgcrypto";

-- =========================================================
-- EMPRESAS
-- =========================================================
create table empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  created_at timestamptz not null default now()
);

-- =========================================================
-- USUARIOS_EMPRESAS (vínculo usuário <-> empresa + papel)
-- =========================================================
create table usuarios_empresas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  papel text not null check (papel in ('admin', 'consultor', 'cliente')),
  created_at timestamptz not null default now(),
  unique (usuario_id, empresa_id)
);

-- Função auxiliar: usuário logado tem acesso à empresa (com papel opcional)
create or replace function usuario_tem_acesso_empresa(p_empresa_id uuid, p_papeis text[] default null)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from usuarios_empresas ue
    where ue.usuario_id = auth.uid()
      and ue.empresa_id = p_empresa_id
      and (p_papeis is null or ue.papel = any(p_papeis))
  );
$$;

-- RPC: cria empresa e já vincula o criador como admin
create or replace function criar_empresa(p_nome text, p_cnpj text default null)
returns empresas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa empresas;
begin
  insert into empresas (nome, cnpj) values (p_nome, p_cnpj) returning * into v_empresa;
  insert into usuarios_empresas (usuario_id, empresa_id, papel)
    values (auth.uid(), v_empresa.id, 'admin');
  return v_empresa;
end;
$$;

-- =========================================================
-- CONTEXTO ORGANIZACIONAL (4.1 - SWOT / PESTEL)
-- =========================================================
create table contexto_organizacional (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo text not null check (tipo in ('swot', 'pestel')),
  categoria text not null,
  descricao text not null,
  data_revisao date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- =========================================================
-- PARTES INTERESSADAS (4.2)
-- =========================================================
create table partes_interessadas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  tipo text not null,
  necessidades text,
  nivel_influencia text not null check (nivel_influencia in ('baixo', 'medio', 'alto')),
  created_at timestamptz not null default now()
);

-- =========================================================
-- OBJETIVOS ESTRATÉGICOS (6.2 - Mapa BSC)
-- =========================================================
create table objetivos_estrategicos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  descricao text,
  perspectiva_bsc text not null check (perspectiva_bsc in ('financeira', 'clientes', 'processos_internos', 'aprendizado_crescimento')),
  responsavel_id uuid references auth.users(id),
  status text not null default 'nao_iniciado' check (status in ('nao_iniciado', 'em_andamento', 'atingido', 'atrasado')),
  created_at timestamptz not null default now()
);

-- Relações de causa-efeito entre objetivos (mapa estratégico)
create table objetivos_relacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  objetivo_origem_id uuid not null references objetivos_estrategicos(id) on delete cascade,
  objetivo_destino_id uuid not null references objetivos_estrategicos(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (objetivo_origem_id <> objetivo_destino_id)
);

-- =========================================================
-- INDICADORES (9.1 - KPIs)
-- =========================================================
create table indicadores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  objetivo_id uuid references objetivos_estrategicos(id) on delete set null,
  nome text not null,
  formula text,
  unidade text,
  periodicidade text not null check (periodicidade in ('mensal', 'trimestral', 'anual')),
  meta numeric not null,
  polaridade text not null check (polaridade in ('maior_melhor', 'menor_melhor')),
  responsavel_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table resultados_indicadores (
  id uuid primary key default gen_random_uuid(),
  indicador_id uuid not null references indicadores(id) on delete cascade,
  periodo date not null,
  valor_realizado numeric not null,
  observacao text,
  created_at timestamptz not null default now(),
  unique (indicador_id, periodo)
);

-- =========================================================
-- RISCOS E OPORTUNIDADES (6.1)
-- =========================================================
create table riscos_oportunidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo text not null check (tipo in ('risco', 'oportunidade')),
  descricao text not null,
  categoria text,
  probabilidade smallint not null check (probabilidade between 1 and 5),
  impacto smallint not null check (impacto between 1 and 5),
  objetivo_id uuid references objetivos_estrategicos(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =========================================================
-- PLANOS DE AÇÃO (5W2H)
-- =========================================================
create table planos_acao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  titulo text not null,
  o_que text,
  por_que text,
  onde text,
  quando date,
  quem text,
  como text,
  quanto_custa numeric,
  status text not null default 'nao_iniciado' check (status in ('nao_iniciado', 'em_andamento', 'concluido', 'atrasado')),
  percentual_conclusao smallint not null default 0 check (percentual_conclusao between 0 and 100),
  origem text check (origem in ('objetivo', 'indicador', 'risco', 'nc')),
  origem_id uuid,
  created_at timestamptz not null default now()
);

-- =========================================================
-- REUNIÕES DE ANÁLISE CRÍTICA (9.3)
-- =========================================================
create table reunioes_analise_critica (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  data date not null,
  participantes text,
  pauta text,
  ata text,
  decisoes text,
  created_at timestamptz not null default now()
);

create table acoes_rac (
  id uuid primary key default gen_random_uuid(),
  reuniao_id uuid not null references reunioes_analise_critica(id) on delete cascade,
  plano_acao_id uuid not null references planos_acao(id) on delete cascade,
  unique (reuniao_id, plano_acao_id)
);

-- =========================================================
-- ÍNDICES
-- =========================================================
create index idx_usuarios_empresas_usuario on usuarios_empresas(usuario_id);
create index idx_usuarios_empresas_empresa on usuarios_empresas(empresa_id);
create index idx_contexto_empresa on contexto_organizacional(empresa_id);
create index idx_partes_empresa on partes_interessadas(empresa_id);
create index idx_objetivos_empresa on objetivos_estrategicos(empresa_id);
create index idx_indicadores_empresa on indicadores(empresa_id);
create index idx_indicadores_objetivo on indicadores(objetivo_id);
create index idx_resultados_indicador on resultados_indicadores(indicador_id);
create index idx_riscos_empresa on riscos_oportunidades(empresa_id);
create index idx_planos_empresa on planos_acao(empresa_id);
create index idx_rac_empresa on reunioes_analise_critica(empresa_id);

-- =========================================================
-- RLS
-- =========================================================
alter table empresas enable row level security;
alter table usuarios_empresas enable row level security;
alter table contexto_organizacional enable row level security;
alter table partes_interessadas enable row level security;
alter table objetivos_estrategicos enable row level security;
alter table objetivos_relacoes enable row level security;
alter table indicadores enable row level security;
alter table resultados_indicadores enable row level security;
alter table riscos_oportunidades enable row level security;
alter table planos_acao enable row level security;
alter table reunioes_analise_critica enable row level security;
alter table acoes_rac enable row level security;

-- empresas: visível a quem tem vínculo; insert livre (via RPC criar_empresa); update/delete só admin
create policy "empresas_select" on empresas for select
  using (usuario_tem_acesso_empresa(id));
create policy "empresas_update" on empresas for update
  using (usuario_tem_acesso_empresa(id, array['admin']));
create policy "empresas_delete" on empresas for delete
  using (usuario_tem_acesso_empresa(id, array['admin']));

-- usuarios_empresas: usuário vê seus próprios vínculos + admins da empresa veem todos os vínculos dela
create policy "usuarios_empresas_select" on usuarios_empresas for select
  using (usuario_id = auth.uid() or usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']));
create policy "usuarios_empresas_insert" on usuarios_empresas for insert
  with check (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']));
create policy "usuarios_empresas_update" on usuarios_empresas for update
  using (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']));
create policy "usuarios_empresas_delete" on usuarios_empresas for delete
  using (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']));

-- Padrão para tabelas simples com empresa_id: select p/ qualquer vínculo, escrita p/ admin/consultor
create policy "contexto_select" on contexto_organizacional for select using (usuario_tem_acesso_empresa(empresa_id));
create policy "contexto_write" on contexto_organizacional for all
  using (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']));

create policy "partes_select" on partes_interessadas for select using (usuario_tem_acesso_empresa(empresa_id));
create policy "partes_write" on partes_interessadas for all
  using (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']));

create policy "objetivos_select" on objetivos_estrategicos for select using (usuario_tem_acesso_empresa(empresa_id));
create policy "objetivos_write" on objetivos_estrategicos for all
  using (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']));

create policy "objetivos_relacoes_select" on objetivos_relacoes for select using (usuario_tem_acesso_empresa(empresa_id));
create policy "objetivos_relacoes_write" on objetivos_relacoes for all
  using (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']));

create policy "indicadores_select" on indicadores for select using (usuario_tem_acesso_empresa(empresa_id));
create policy "indicadores_write" on indicadores for all
  using (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']));

create policy "riscos_select" on riscos_oportunidades for select using (usuario_tem_acesso_empresa(empresa_id));
create policy "riscos_write" on riscos_oportunidades for all
  using (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']));

create policy "planos_select" on planos_acao for select using (usuario_tem_acesso_empresa(empresa_id));
create policy "planos_write" on planos_acao for all
  using (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']));

create policy "rac_select" on reunioes_analise_critica for select using (usuario_tem_acesso_empresa(empresa_id));
create policy "rac_write" on reunioes_analise_critica for all
  using (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['admin', 'consultor']));

-- resultados_indicadores: empresa via join com indicadores
create policy "resultados_select" on resultados_indicadores for select
  using (exists (select 1 from indicadores i where i.id = indicador_id and usuario_tem_acesso_empresa(i.empresa_id)));
create policy "resultados_write" on resultados_indicadores for all
  using (exists (select 1 from indicadores i where i.id = indicador_id and usuario_tem_acesso_empresa(i.empresa_id, array['admin', 'consultor'])))
  with check (exists (select 1 from indicadores i where i.id = indicador_id and usuario_tem_acesso_empresa(i.empresa_id, array['admin', 'consultor'])));

-- acoes_rac: empresa via join com reunioes_analise_critica
create policy "acoes_rac_select" on acoes_rac for select
  using (exists (select 1 from reunioes_analise_critica r where r.id = reuniao_id and usuario_tem_acesso_empresa(r.empresa_id)));
create policy "acoes_rac_write" on acoes_rac for all
  using (exists (select 1 from reunioes_analise_critica r where r.id = reuniao_id and usuario_tem_acesso_empresa(r.empresa_id, array['admin', 'consultor'])))
  with check (exists (select 1 from reunioes_analise_critica r where r.id = reuniao_id and usuario_tem_acesso_empresa(r.empresa_id, array['admin', 'consultor'])));
