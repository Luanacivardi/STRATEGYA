-- Módulo Documentos (ISO 9001, cláusula 7.5) — MVP funcional completo.
-- Reaproveita macrofluxo_processos (tipo='principal') como "Processo". Procedimento e IT não são
-- entidades próprias: são o próprio Documento filtrado por tipo (auto-relacionamento).

create table tipos_documento (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique check (chave in ('procedimento','it','registro','manual','politica')),
  nome text not null,
  prefixo_numeracao text not null,
  exige_processo boolean not null default false,
  exige_procedimento boolean not null default false,
  secoes jsonb not null default '[]',
  exige_aprovacao_alta_direcao boolean not null default false
);

insert into tipos_documento (chave, nome, prefixo_numeracao, exige_processo, exige_procedimento, secoes, exige_aprovacao_alta_direcao) values
  ('procedimento', 'Procedimento', 'P', false, false,
    '["Objetivo","Responsabilidade","Diretrizes","Diretriz Ambiental e de Segurança","Sanções","Exceções"]', false),
  ('it', 'Instrução de Trabalho', 'IT', false, false,
    '["Objetivo","Responsabilidades","Descrição","Diretrizes Ambientais e de Segurança","Sanções","Exceções"]', false),
  ('registro', 'Registro', 'RG', true, true,
    '["Campos do Registro"]', false),
  ('manual', 'Manual', 'M', false, false,
    '["Objetivo e Abrangência","Referências Normativas","Termos e Definições","Contexto da Organização","Estrutura e Responsabilidades","Descrição dos Processos/Capítulos","Diretriz Ambiental e de Segurança","Sanções","Exceções"]', false),
  ('politica', 'Política', 'POL', false, false,
    '["Objetivo","Abrangência","Diretrizes da Política","Responsabilidades","Revisão e Comunicação","Sanções"]', true);

alter table tipos_documento enable row level security;
create policy "tipos_documento_select" on tipos_documento for select using (true);

-- =========================================================
-- DOCUMENTOS
-- =========================================================
create table documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo_documento_id uuid not null references tipos_documento(id),
  numero text,
  nome text not null,
  processo_id uuid references macrofluxo_processos(id) on delete set null,
  procedimento_id uuid references documentos(id) on delete set null,
  it_id uuid references documentos(id) on delete set null,
  classificacao text not null default 'confidencial' check (classificacao in ('publico','confidencial','restrito')),
  restrito_para jsonb not null default '[]',
  status text not null default 'elaboracao' check (status in ('elaboracao','revisao','aprovacao','publicado','obsoleto')),
  revisao_atual int not null default 0,
  conteudo jsonb not null default '{}',
  aprovador_solicitado_id uuid references auth.users(id),
  elaborado_por uuid references auth.users(id),
  aprovado_por uuid references auth.users(id),
  assinatura_elaborador jsonb,
  assinatura_aprovador jsonb,
  data_publicacao timestamptz,
  exige_treinamento boolean not null default false,
  created_at timestamptz not null default now(),
  unique (empresa_id, numero)
);

create index idx_documentos_empresa on documentos(empresa_id);
create index idx_documentos_procedimento on documentos(procedimento_id);
create index idx_documentos_it on documentos(it_id);
create index idx_documentos_aprovador on documentos(aprovador_solicitado_id);

-- Regra 1: RG (Registro) exige processo_id e procedimento_id.
create or replace function validar_documento()
returns trigger
language plpgsql
as $$
declare
  v_exige_processo boolean;
  v_exige_procedimento boolean;
begin
  select exige_processo, exige_procedimento into v_exige_processo, v_exige_procedimento
    from tipos_documento where id = new.tipo_documento_id;

  if v_exige_processo and new.processo_id is null then
    raise exception 'Este tipo de documento exige um Processo vinculado.';
  end if;
  if v_exige_procedimento and new.procedimento_id is null then
    raise exception 'Este tipo de documento exige um Procedimento vinculado.';
  end if;
  return new;
end;
$$;

create trigger trg_validar_documento
before insert or update on documentos
for each row execute function validar_documento();

-- Numeração automática {PREFIXO}-{sequencial 3 dígitos}, por empresa + tipo. Nunca editável no client.
create or replace function gerar_numero_documento()
returns trigger
language plpgsql
as $$
declare
  v_prefixo text;
  v_proximo int;
begin
  if new.numero is null then
    select prefixo_numeracao into v_prefixo from tipos_documento where id = new.tipo_documento_id;
    select coalesce(max((split_part(numero, '-', 2))::int), 0) + 1
      into v_proximo
      from documentos
      where empresa_id = new.empresa_id
        and tipo_documento_id = new.tipo_documento_id;
    new.numero := v_prefixo || '-' || lpad(v_proximo::text, 3, '0');
  end if;
  return new;
end;
$$;

create trigger trg_gerar_numero_documento
before insert on documentos
for each row execute function gerar_numero_documento();

-- =========================================================
-- DOCUMENTOS_REVISOES (histórico — gerado, não editável pelo client)
-- =========================================================
create table documentos_revisoes (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documentos(id) on delete cascade,
  numero_revisao int not null,
  data timestamptz not null default now(),
  descricao_alteracao text not null,
  conteudo_snapshot jsonb not null,
  elaborado_por uuid references auth.users(id),
  aprovado_por uuid references auth.users(id),
  status_final text not null check (status_final in ('publicado','obsoleto')),
  exige_treinamento boolean not null default false,
  aprovacao_com_alerta_segregacao boolean not null default false
);

create index idx_documentos_revisoes_doc on documentos_revisoes(documento_id);

alter table documentos enable row level security;
alter table documentos_revisoes enable row level security;

create policy "documentos_select" on documentos for select using (usuario_tem_acesso_empresa(empresa_id));
create policy "documentos_write" on documentos for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));
create policy "documentos_write_nivel" on documentos for all using (
  nivel_edicao_usuario(empresa_id) = 'total'
) with check (
  nivel_edicao_usuario(empresa_id) = 'total'
);

create policy "documentos_revisoes_select" on documentos_revisoes for select
  using (exists (select 1 from documentos d where d.id = documento_id and usuario_tem_acesso_empresa(d.empresa_id)));
create policy "documentos_revisoes_write" on documentos_revisoes for all
  using (exists (select 1 from documentos d where d.id = documento_id and usuario_tem_acesso_empresa(d.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from documentos d where d.id = documento_id and usuario_tem_acesso_empresa(d.empresa_id, array['orbeex', 'admin'])));
create policy "documentos_revisoes_write_nivel" on documentos_revisoes for all using (
  exists (select 1 from documentos d where d.id = documento_id and nivel_edicao_usuario(d.empresa_id) = 'total')
) with check (
  exists (select 1 from documentos d where d.id = documento_id and nivel_edicao_usuario(d.empresa_id) = 'total')
);

create trigger trg_log_alteracao after insert or update or delete on documentos for each row execute function fn_log_alteracao();
