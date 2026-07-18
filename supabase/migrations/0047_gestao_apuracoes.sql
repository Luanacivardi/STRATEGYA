-- Módulo "Gestão de Apurações" — gerencia o FLUXO de apurações/investigações corporativas
-- (canal de denúncia, auditoria, gestão, etc), alinhado a ISO 37301 (compliance), ISO 37002
-- (whistleblowing) e ISO 37001 (antissuborno), sem se tornar um sistema de investigação jurídica:
--
-- * NÃO armazena evidências, documentos, e-mails, áudios, vídeos ou qualquer material probatório
--   (não há bucket de storage nem coluna de anexo neste módulo, por decisão de design).
-- * Guarda apenas o suficiente para controlar o FLUXO: canal de origem, natureza, criticidade,
--   prazos, status, resultado final e um resumo objetivo curto — a documentação em si permanece
--   exclusivamente no Jurídico/Compliance, em sistema próprio (aqui só se guarda o nº de protocolo
--   externo, como referência, nunca o conteúdo).
-- * Não há campo de "score" ou classificação automática de culpa/procedência — toda decisão e
--   classificação de resultado é preenchida manualmente por humano (comitê), nunca calculada
--   pelo sistema (mitiga risco de "julgamento automatizado").
-- * Acesso restrito a um comitê nomeado por empresa (apuracoes_comite_membros) + papel 'orbeex' —
--   deliberadamente NÃO é liberado automaticamente para todo 'admin' da empresa, para reduzir
--   risco de conflito de interesse (nem todo admin deveria enxergar apurações em andamento).
-- * Cada participação de membro do comitê registra se houve conflito de interesse declarado
--   e se o membro foi afastado do caso (apuracoes_comite_participantes).

create table apuracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  numero text not null,

  canal_origem text not null check (canal_origem in (
    'canal_denuncia', 'auditoria_interna', 'auditoria_externa', 'gestao', 'rh', 'indicadores', 'outro'
  )),
  natureza text not null check (natureza in (
    'fraude', 'corrupcao_suborno', 'conflito_interesse', 'assedio_discriminacao',
    'violacao_codigo_conduta', 'saude_seguranca', 'protecao_dados', 'financeiro_contabil', 'outro'
  )),
  criticidade text not null default 'media' check (criticidade in ('baixa', 'media', 'alta', 'critica')),

  confidencial boolean not null default true,
  denuncia_anonima boolean not null default false,

  data_recebimento date not null default current_date,
  prazo_dias int not null default 30 check (prazo_dias > 0),

  status text not null default 'recebida' check (status in (
    'recebida', 'triagem', 'em_apuracao', 'aguardando_terceiros', 'concluida', 'arquivada'
  )),
  resultado text check (resultado in ('procedente', 'improcedente', 'parcialmente_procedente', 'inconclusiva')),
  encaminhamento text not null default 'nenhum' check (encaminhamento in (
    'nenhum', 'juridico', 'rh', 'disciplinar', 'conselho_administracao'
  )),

  -- Apenas o protocolo/número do processo no sistema do Jurídico/Compliance — nunca o conteúdo.
  referencia_processo_externo text,

  -- Resumo objetivo e curto do fluxo (ex: "Denúncia de possível conflito de interesse em processo
  -- de compra, encaminhada para apuração"), sem detalhar identidades ou conteúdo probatório.
  resumo_objetivo text check (char_length(resumo_objetivo) <= 500),

  relator_id uuid references auth.users(id) on delete set null,
  data_conclusao date,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_apuracoes_empresa on apuracoes(empresa_id);
create unique index idx_apuracoes_numero on apuracoes(empresa_id, numero);

-- data_conclusao só faz sentido (e só deveria existir) quando o status é concluída/arquivada,
-- e resultado só quando concluída — reforçado na aplicação, não trava aqui para não impedir
-- fluxos de reabertura/correção pelo comitê.

create or replace function apuracoes_atualizar_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_apuracoes_updated_at
before update on apuracoes
for each row execute function apuracoes_atualizar_updated_at();

-- Numeração sequencial por empresa/ano: APUR-2026-001
create or replace function gerar_numero_apuracao()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_ano int := extract(year from now());
  v_proximo int;
begin
  if new.numero is null then
    select coalesce(max((split_part(numero, '-', 3))::int), 0) + 1
      into v_proximo
      from apuracoes
      where empresa_id = new.empresa_id
        and split_part(numero, '-', 2) = v_ano::text;
    new.numero := 'APUR-' || v_ano::text || '-' || lpad(v_proximo::text, 3, '0');
  end if;
  return new;
end;
$$;

create trigger trg_gerar_numero_apuracao
before insert on apuracoes
for each row execute function gerar_numero_apuracao();

-- Comitê de apuração: quem tem permissão de ver/tratar apurações nesta empresa.
-- Definido pelo admin/orbeex (governança), não pelo comitê propriamente.
create table apuracoes_comite_membros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'membro' check (papel in ('presidente', 'membro', 'suplente')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (empresa_id, usuario_id)
);

create index idx_apuracoes_comite_empresa on apuracoes_comite_membros(empresa_id);

-- Participação por apuração: registra quem atuou no caso e se declarou conflito de interesse
-- (autodeclaração humana — o sistema nunca infere ou calcula conflito de interesse sozinho).
create table apuracoes_participantes (
  id uuid primary key default gen_random_uuid(),
  apuracao_id uuid not null references apuracoes(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  conflito_interesse_declarado boolean not null default false,
  afastado boolean not null default false,
  observacao text check (char_length(observacao) <= 300),
  created_at timestamptz not null default now(),
  unique (apuracao_id, usuario_id)
);

create index idx_apuracoes_participantes_apuracao on apuracoes_participantes(apuracao_id);

-- Histórico/timeline de mudanças de status (trilha de auditoria do fluxo, exigida por ISO 37301/COSO).
create table apuracoes_historico (
  id uuid primary key default gen_random_uuid(),
  apuracao_id uuid not null references apuracoes(id) on delete cascade,
  usuario_id uuid references auth.users(id),
  status_anterior text,
  status_novo text not null,
  observacao text check (char_length(observacao) <= 300),
  created_at timestamptz not null default now()
);

create index idx_apuracoes_historico_apuracao on apuracoes_historico(apuracao_id);

-- Helper: usuário é membro ativo do comitê de apuração desta empresa (qualquer papel) OU é 'orbeex'.
create or replace function usuario_no_comite_apuracao(p_empresa_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    usuario_tem_acesso_empresa(p_empresa_id, array['orbeex'])
    or exists (
      select 1 from apuracoes_comite_membros m
      where m.empresa_id = p_empresa_id
        and m.usuario_id = auth.uid()
        and m.ativo = true
    );
$$;

alter table apuracoes enable row level security;
alter table apuracoes_comite_membros enable row level security;
alter table apuracoes_participantes enable row level security;
alter table apuracoes_historico enable row level security;

-- apuracoes: só o comitê (ou orbeex) enxerga e mexe.
create policy "apuracoes_select" on apuracoes for select
  using (usuario_no_comite_apuracao(empresa_id));
create policy "apuracoes_write" on apuracoes for all
  using (usuario_no_comite_apuracao(empresa_id))
  with check (usuario_no_comite_apuracao(empresa_id));

-- apuracoes_comite_membros: comitê e orbeex podem ver quem está no comitê; só admin/orbeex
-- (governança, não o próprio comitê) pode nomear/remover membros.
create policy "apuracoes_comite_select" on apuracoes_comite_membros for select
  using (usuario_no_comite_apuracao(empresa_id));
create policy "apuracoes_comite_write" on apuracoes_comite_membros for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

create policy "apuracoes_participantes_select" on apuracoes_participantes for select
  using (exists (select 1 from apuracoes a where a.id = apuracao_id and usuario_no_comite_apuracao(a.empresa_id)));
create policy "apuracoes_participantes_write" on apuracoes_participantes for all
  using (exists (select 1 from apuracoes a where a.id = apuracao_id and usuario_no_comite_apuracao(a.empresa_id)))
  with check (exists (select 1 from apuracoes a where a.id = apuracao_id and usuario_no_comite_apuracao(a.empresa_id)));

create policy "apuracoes_historico_select" on apuracoes_historico for select
  using (exists (select 1 from apuracoes a where a.id = apuracao_id and usuario_no_comite_apuracao(a.empresa_id)));
create policy "apuracoes_historico_write" on apuracoes_historico for all
  using (exists (select 1 from apuracoes a where a.id = apuracao_id and usuario_no_comite_apuracao(a.empresa_id)))
  with check (exists (select 1 from apuracoes a where a.id = apuracao_id and usuario_no_comite_apuracao(a.empresa_id)));

comment on table apuracoes is 'Fluxo de apurações/investigações corporativas (ISO 37301/37002/37001). NÃO armazena evidências, documentos, e-mails, áudios ou vídeos — apenas controle de fluxo. Documentação probatória permanece sob responsabilidade do Jurídico/Compliance em sistema próprio.';
comment on column apuracoes.referencia_processo_externo is 'Apenas o número/protocolo do processo no sistema do Jurídico/Compliance — nunca o conteúdo ou documentos em si.';
comment on column apuracoes.resultado is 'Preenchido manualmente pelo comitê ao concluir — o sistema não calcula ou sugere resultado automaticamente.';
comment on table apuracoes_comite_membros is 'Comitê de apuração por empresa — define quem tem acesso ao módulo. Gerenciado por admin/orbeex, não pelo próprio comitê.';
comment on table apuracoes_participantes is 'Registro de participação e autodeclaração de conflito de interesse por apuração — declaração sempre humana.';
comment on table apuracoes_historico is 'Trilha de auditoria das mudanças de status do fluxo.';
