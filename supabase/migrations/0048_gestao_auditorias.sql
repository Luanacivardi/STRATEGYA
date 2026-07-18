-- Módulo "Gestão de Auditorias Corporativas" (ISO 9001/14001/45001): solicitação, priorização
-- por risco (IPA), planejamento inteligente, distribuição automática de horas por processo e
-- turno, agenda automática, designação de auditores, execução, resultados, relatório, fluxo de
-- aprovação e geração automática de plano de ação a partir de não conformidades.
--
-- Observações de design (para não travar depois por engano):
-- * O IPA (Índice de Prioridade de Auditoria) é calculado no cliente (js), não no banco — os
--   pesos e a normalização (cada critério trazido para escala 0-100 antes de aplicar o peso, já
--   que os critérios têm escalas máximas diferentes: criticidade/NC/acidentes/legal vão até 5,
--   mudanças/reclamações vão até 3) ficam documentados em js/modules/auditorias.js.
-- * "Aspectos Ambientais" citado na fórmula do IPA no escopo original não tinha escala própria
--   definida nos critérios — foi mapeado para o critério "Mudanças recentes" (mesmo peso de 15%).
-- * A "Pontuação do Processo" usada para distribuir horas (seção 6 do escopo) reaproveita o IPA
--   do processo — evita duas fórmulas de pontuação divergentes para o mesmo conjunto de critérios.
-- * Regras de impedimento (auditor não pode auditar a própria área / precisa de competência na
--   norma) são validadas na aplicação (js), não em constraint de banco — são regras de negócio
--   passíveis de exceção documentada pelo comitê de qualidade, não uma invariante de dado.

-- ---------- TURNOS ----------
create table auditorias_turnos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  hora_inicio time not null,
  hora_fim time not null,
  created_at timestamptz not null default now(),
  unique (empresa_id, nome)
);
create index idx_auditorias_turnos_empresa on auditorias_turnos(empresa_id);

-- ---------- PROCESSOS AUDITÁVEIS ----------
create table auditorias_processos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  area text,
  responsavel_id uuid references auth.users(id) on delete set null,
  normas text[] not null default '{}'::text[] check (normas <@ array['iso9001', 'iso14001', 'iso45001', 'outra']::text[]),
  criticidade text not null default 'media' check (criticidade in ('baixa', 'media', 'alta')),
  historico_ncs text not null default 'nenhuma' check (historico_ncs in ('nenhuma', 'ate_3', 'mais_3')),
  mudancas_recentes boolean not null default false,
  requisitos_legais boolean not null default false,
  acidentes boolean not null default false,
  reclamacoes boolean not null default false,
  qtd_turnos smallint not null default 1 check (qtd_turnos in (1, 2, 3)),
  created_at timestamptz not null default now()
);
create index idx_auditorias_processos_empresa on auditorias_processos(empresa_id);

create table auditorias_processos_turnos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references auditorias_processos(id) on delete cascade,
  turno_id uuid not null references auditorias_turnos(id) on delete cascade,
  unique (processo_id, turno_id)
);

-- ---------- AUDITORES ----------
create table auditores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  matricula text,
  funcao text,
  unidade text,
  area_atuacao text, -- usado para impedir o auditor de auditar a própria área
  email text,
  usuario_id uuid references auth.users(id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_auditores_empresa on auditores(empresa_id);

create table auditores_competencias (
  id uuid primary key default gen_random_uuid(),
  auditor_id uuid not null references auditores(id) on delete cascade,
  norma text not null check (norma in ('iso9001', 'iso14001', 'iso45001')),
  nivel text not null check (nivel in ('auditor_interno', 'auditor_lider', 'auditor_externo')),
  validade date,
  created_at timestamptz not null default now(),
  unique (auditor_id, norma, nivel)
);
create index idx_auditores_competencias_auditor on auditores_competencias(auditor_id);

-- ---------- AUDITORIAS (solicitação + priorização + planejamento) ----------
create table auditorias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  numero text not null,

  titulo text not null,
  tipo text not null check (tipo in (
    'interna', 'externa', 'cliente', 'fornecedor', 'certificacao', 'manutencao', 'recertificacao', 'extraordinaria'
  )),
  modalidade text not null default 'individual' check (modalidade in ('individual', 'integrada')),
  unidade text,
  objetivo text,
  escopo text,
  normas text[] not null default '{}'::text[] check (normas <@ array['iso9001', 'iso14001', 'iso45001', 'outra']::text[]),
  data_prevista date,
  observacoes text,

  status text not null default 'solicitada' check (status in (
    'solicitada', 'priorizada', 'planejada', 'agendada', 'em_execucao', 'concluida', 'em_aprovacao', 'aprovada', 'reprovada', 'arquivada'
  )),

  -- Priorização (IPA)
  ipa numeric(5, 2),
  prioridade_classificacao text check (prioridade_classificacao in ('baixa', 'media', 'alta', 'critica')),
  frequencia_sugerida text check (frequencia_sugerida in ('anual', 'semestral', 'trimestral', 'mensal')),

  -- Planejamento inteligente
  horas_totais numeric,
  horas_min_processo numeric not null default 0.5,
  horas_max_processo numeric,
  dias int,
  data_inicial date,
  data_final date,
  hora_entrada time,
  hora_saida time,
  almoco_inicio time,
  almoco_fim time,
  intervalos_minutos int not null default 0,
  tempo_deslocamento_min int not null default 0,
  tempo_abertura_min int not null default 30,
  tempo_encerramento_min int not null default 30,
  tempo_consolidacao_min int not null default 30,

  conclusao text check (conclusao in ('aprovado', 'aprovado_ressalvas', 'reprovado')),

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_auditorias_numero on auditorias(empresa_id, numero);
create index idx_auditorias_empresa on auditorias(empresa_id);

create or replace function auditorias_atualizar_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_auditorias_updated_at
before update on auditorias
for each row execute function auditorias_atualizar_updated_at();

create or replace function gerar_numero_auditoria()
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
      from auditorias
      where empresa_id = new.empresa_id
        and split_part(numero, '-', 2) = v_ano::text;
    new.numero := 'AUD-' || v_ano::text || '-' || lpad(v_proximo::text, 3, '0');
  end if;
  return new;
end;
$$;
create trigger trg_gerar_numero_auditoria
before insert on auditorias
for each row execute function gerar_numero_auditoria();

-- ---------- DISTRIBUIÇÃO DE HORAS (processo e turno) ----------
create table auditorias_processos_selecionados (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references auditorias(id) on delete cascade,
  processo_id uuid not null references auditorias_processos(id) on delete cascade,
  pontuacao numeric(5, 2),
  horas_distribuidas numeric,
  created_at timestamptz not null default now(),
  unique (auditoria_id, processo_id)
);
create index idx_auditorias_proc_sel_auditoria on auditorias_processos_selecionados(auditoria_id);

create table auditorias_distribuicao_turno (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references auditorias(id) on delete cascade,
  processo_id uuid not null references auditorias_processos(id) on delete cascade,
  turno_id uuid not null references auditorias_turnos(id) on delete cascade,
  horas numeric not null,
  created_at timestamptz not null default now(),
  unique (auditoria_id, processo_id, turno_id)
);
create index idx_auditorias_dist_turno_auditoria on auditorias_distribuicao_turno(auditoria_id);

-- ---------- AGENDA AUTOMÁTICA ----------
create table auditorias_agenda (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references auditorias(id) on delete cascade,
  dia int not null,
  hora_inicio time not null,
  hora_fim time not null,
  tipo text not null check (tipo in ('abertura', 'processo', 'almoco', 'consolidacao', 'encerramento')),
  processo_id uuid references auditorias_processos(id) on delete set null,
  turno_id uuid references auditorias_turnos(id) on delete set null,
  rotulo text,
  created_at timestamptz not null default now()
);
create index idx_auditorias_agenda_auditoria on auditorias_agenda(auditoria_id);

-- ---------- EQUIPE AUDITORA ----------
create table auditorias_equipe (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references auditorias(id) on delete cascade,
  auditor_id uuid not null references auditores(id) on delete cascade,
  papel text not null default 'auditor' check (papel in ('lider', 'auditor')),
  created_at timestamptz not null default now(),
  unique (auditoria_id, auditor_id)
);
create index idx_auditorias_equipe_auditoria on auditorias_equipe(auditoria_id);

-- ---------- EXECUÇÃO E RESULTADOS (achados) ----------
create table auditorias_achados (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references auditorias(id) on delete cascade,
  processo_id uuid references auditorias_processos(id) on delete set null,
  processo text, -- snapshot do nome (sobrevive à exclusão do cadastro do processo)
  norma text check (norma in ('iso9001', 'iso14001', 'iso45001', 'outra')),
  requisito text,
  evidencia text,
  entrevistado text,
  resultado text not null check (resultado in ('conforme', 'nc_maior', 'nc_menor', 'observacao', 'oportunidade_melhoria')),
  anexo_url text,
  anexo_nome text,
  registrado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index idx_auditorias_achados_auditoria on auditorias_achados(auditoria_id);

-- ---------- FLUXO DE APROVAÇÃO ----------
create table auditorias_aprovacoes (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references auditorias(id) on delete cascade,
  etapa text not null check (etapa in ('auditor', 'auditor_lider', 'gestor_area', 'sgi', 'diretoria')),
  aprovador_id uuid references auth.users(id),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'reprovado')),
  comentario text,
  data timestamptz,
  created_at timestamptz not null default now(),
  unique (auditoria_id, etapa)
);
create index idx_auditorias_aprovacoes_auditoria on auditorias_aprovacoes(auditoria_id);

-- ---------- INTEGRAÇÃO COM GESTÃO DE AÇÕES ----------
-- Toda NC Maior/Menor gera automaticamente um plano de ação (origem = 'auditoria').
alter table planos_acao drop constraint planos_acao_origem_check;
alter table planos_acao add constraint planos_acao_origem_check
  check (origem in ('objetivo', 'indicador', 'risco', 'nc', 'rac', 'conta_gerencial', 'auditoria'));

create or replace function auditorias_gerar_acao_por_nc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auditoria auditorias%rowtype;
  v_titulo text;
  v_categoria text;
begin
  if new.resultado not in ('nc_maior', 'nc_menor') then
    return new;
  end if;

  select * into v_auditoria from auditorias where id = new.auditoria_id;

  v_titulo := 'NC ' || (case when new.resultado = 'nc_maior' then 'Maior' else 'Menor' end)
    || ' — Auditoria ' || v_auditoria.numero || coalesce(' — ' || new.processo, '');
  v_categoria := case when v_auditoria.tipo in ('externa', 'cliente', 'certificacao') then 'auditoria_externa' else 'auditoria_interna' end;

  insert into planos_acao (empresa_id, titulo, origem, origem_id, origem_categoria, tipo, o_que, por_que)
  values (
    v_auditoria.empresa_id, v_titulo, 'auditoria', new.id, v_categoria, 'nao_conformidade',
    new.evidencia, case when new.requisito is not null then 'Requisito: ' || new.requisito else null end
  );

  return new;
end;
$$;

create trigger trg_auditorias_gerar_acao_por_nc
after insert on auditorias_achados
for each row execute function auditorias_gerar_acao_por_nc();

-- Função de gatilho não deve ser chamável diretamente via RPC.
revoke execute on function auditorias_gerar_acao_por_nc() from public, anon, authenticated;

-- ---------- RLS ----------
alter table auditorias_turnos enable row level security;
alter table auditorias_processos enable row level security;
alter table auditorias_processos_turnos enable row level security;
alter table auditores enable row level security;
alter table auditores_competencias enable row level security;
alter table auditorias enable row level security;
alter table auditorias_processos_selecionados enable row level security;
alter table auditorias_distribuicao_turno enable row level security;
alter table auditorias_agenda enable row level security;
alter table auditorias_equipe enable row level security;
alter table auditorias_achados enable row level security;
alter table auditorias_aprovacoes enable row level security;

create policy "auditorias_turnos_select" on auditorias_turnos for select using (usuario_tem_acesso_empresa(empresa_id));
create policy "auditorias_turnos_write" on auditorias_turnos for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

create policy "auditorias_processos_select" on auditorias_processos for select using (usuario_tem_acesso_empresa(empresa_id));
create policy "auditorias_processos_write" on auditorias_processos for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

create policy "auditorias_processos_turnos_select" on auditorias_processos_turnos for select
  using (exists (select 1 from auditorias_processos p where p.id = processo_id and usuario_tem_acesso_empresa(p.empresa_id)));
create policy "auditorias_processos_turnos_write" on auditorias_processos_turnos for all
  using (exists (select 1 from auditorias_processos p where p.id = processo_id and usuario_tem_acesso_empresa(p.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from auditorias_processos p where p.id = processo_id and usuario_tem_acesso_empresa(p.empresa_id, array['orbeex', 'admin'])));

create policy "auditores_select" on auditores for select using (usuario_tem_acesso_empresa(empresa_id));
create policy "auditores_write" on auditores for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

create policy "auditores_competencias_select" on auditores_competencias for select
  using (exists (select 1 from auditores a where a.id = auditor_id and usuario_tem_acesso_empresa(a.empresa_id)));
create policy "auditores_competencias_write" on auditores_competencias for all
  using (exists (select 1 from auditores a where a.id = auditor_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from auditores a where a.id = auditor_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])));

create policy "auditorias_select" on auditorias for select using (usuario_tem_acesso_empresa(empresa_id));
create policy "auditorias_write" on auditorias for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

create policy "auditorias_proc_sel_select" on auditorias_processos_selecionados for select
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id)));
create policy "auditorias_proc_sel_write" on auditorias_processos_selecionados for all
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])));

create policy "auditorias_dist_turno_select" on auditorias_distribuicao_turno for select
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id)));
create policy "auditorias_dist_turno_write" on auditorias_distribuicao_turno for all
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])));

create policy "auditorias_agenda_select" on auditorias_agenda for select
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id)));
create policy "auditorias_agenda_write" on auditorias_agenda for all
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])));

create policy "auditorias_equipe_select" on auditorias_equipe for select
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id)));
create policy "auditorias_equipe_write" on auditorias_equipe for all
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])));

create policy "auditorias_achados_select" on auditorias_achados for select
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id)));
create policy "auditorias_achados_write" on auditorias_achados for all
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])));

create policy "auditorias_aprovacoes_select" on auditorias_aprovacoes for select
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id)));
create policy "auditorias_aprovacoes_write" on auditorias_aprovacoes for all
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])));

-- ---------- STORAGE (anexos de evidência da execução) ----------
insert into storage.buckets (id, name, public) values ('evidencias-auditorias', 'evidencias-auditorias', false)
on conflict (id) do nothing;

create policy "evidencias_auditorias_select" on storage.objects for select to authenticated
  using (bucket_id = 'evidencias-auditorias' and usuario_tem_acesso_empresa((split_part(name, '/', 1))::uuid));
create policy "evidencias_auditorias_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias-auditorias' and usuario_tem_acesso_empresa((split_part(name, '/', 1))::uuid, array['orbeex', 'admin']));
create policy "evidencias_auditorias_update" on storage.objects for update to authenticated
  using (bucket_id = 'evidencias-auditorias' and usuario_tem_acesso_empresa((split_part(name, '/', 1))::uuid, array['orbeex', 'admin']));
create policy "evidencias_auditorias_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'evidencias-auditorias' and usuario_tem_acesso_empresa((split_part(name, '/', 1))::uuid, array['orbeex', 'admin']));

comment on table auditorias is 'Gestão de Auditorias Corporativas (ISO 9001/14001/45001): solicitação, priorização por risco (IPA), planejamento, agenda automática e fluxo de aprovação.';
comment on column auditorias.ipa is 'Índice de Prioridade de Auditoria (0-100), calculado no cliente a partir dos critérios de risco dos processos selecionados.';
comment on table auditorias_achados is 'Registros de execução (achados) por processo/norma/requisito. NC Maior/Menor dispara automaticamente um plano de ação (trigger auditorias_gerar_acao_por_nc).';
comment on table auditores is 'Cadastro de auditores (podem ou não ter login na plataforma — usuario_id é opcional, cobre auditores externos).';
