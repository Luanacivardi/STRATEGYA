-- Módulo "Gestão de Treinamentos" (ISO 9001 cláusula 7.2 — competência e eficácia do treinamento):
-- solicitação (com N participantes) → aprovação → agendamento → execução → fechamento (presença +
-- conclusão) → análise de eficácia → atualização automática da Matriz de Versatilidade.
--
-- Segue o mesmo padrão de Gestão de Auditorias (0048/0079): módulo configurável desde o início,
-- dois submódulos ('solicitacoes' cobre o ciclo de vida inteiro do registro — não há necessidade
-- hoje de separar por fase como Auditorias fez depois com 'relatorios'; 'versatilidade' cobre o
-- catálogo de competências + a matriz), nível 'proprio' em 'solicitacoes' via solicitante_id (mesmo
-- padrão de objetivos_estrategicos/indicadores).

-- ---------- CATÁLOGO DE COMPETÊNCIAS (colunas da Matriz de Versatilidade) ----------
create table treinamentos_competencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  processo_id uuid references macrofluxo_processos(id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index uq_treinamentos_competencias_nome on treinamentos_competencias(empresa_id, lower(nome));
create index idx_treinamentos_competencias_empresa on treinamentos_competencias(empresa_id);
create index idx_treinamentos_competencias_processo on treinamentos_competencias(processo_id);

-- ---------- TREINAMENTOS (registro principal) ----------
create table treinamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  numero text not null,

  titulo text not null,
  descricao text,
  tipo text not null check (tipo in (
    'integracao', 'tecnico', 'comportamental', 'seguranca', 'qualidade', 'legal', 'lideranca', 'outro'
  )),
  modalidade text not null default 'presencial' check (modalidade in ('presencial', 'online', 'ead', 'in_company')),
  instrutor_tipo text check (instrutor_tipo in ('interno', 'externo')),
  instrutor_nome text,

  competencia_id uuid references treinamentos_competencias(id) on delete set null,
  processo_id uuid references macrofluxo_processos(id) on delete set null,
  departamento_id uuid references departamentos(id) on delete set null,
  justificativa text,
  solicitante_id uuid references auth.users(id) on delete set null,

  carga_horaria numeric(6, 2) not null default 0 check (carga_horaria >= 0),
  data_prevista date,
  data_inicio date,
  data_fim date,
  local text,
  custo numeric(10, 2),

  status text not null default 'solicitado' check (status in (
    'solicitado', 'aprovado', 'reprovado', 'agendado', 'em_execucao', 'concluido', 'fechado', 'cancelado'
  )),
  motivo_reprovacao text,
  aprovado_por uuid references auth.users(id),
  aprovado_em timestamptz,

  conclusao_texto text,
  fechado_por uuid references auth.users(id),
  fechado_em timestamptz,

  eficacia_metodo text,
  eficacia_prazo_dias int,
  eficacia_resultado text check (eficacia_resultado in ('eficaz', 'parcialmente_eficaz', 'ineficaz')),
  eficacia_avaliado_por uuid references auth.users(id),
  eficacia_avaliado_em timestamptz,
  eficacia_observacoes text,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_treinamentos_numero on treinamentos(empresa_id, numero);
create index idx_treinamentos_empresa on treinamentos(empresa_id);
create index idx_treinamentos_competencia on treinamentos(competencia_id);
create index idx_treinamentos_processo on treinamentos(processo_id);
create index idx_treinamentos_departamento on treinamentos(departamento_id);
create index idx_treinamentos_solicitante on treinamentos(solicitante_id);
create index idx_treinamentos_status on treinamentos(empresa_id, status);

create or replace function treinamentos_atualizar_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_treinamentos_updated_at
before update on treinamentos
for each row execute function treinamentos_atualizar_updated_at();

-- Mesmo padrão de gerar_numero_auditoria() (migração 0048): TR-AAAA-NNN, sequência por empresa/ano.
create or replace function gerar_numero_treinamento()
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
      from treinamentos
      where empresa_id = new.empresa_id
        and split_part(numero, '-', 2) = v_ano::text;
    new.numero := 'TR-' || v_ano::text || '-' || lpad(v_proximo::text, 3, '0');
  end if;
  return new;
end;
$$;
create trigger trg_gerar_numero_treinamento
before insert on treinamentos
for each row execute function gerar_numero_treinamento();

-- ---------- PARTICIPANTES (N por treinamento) ----------
create table treinamentos_participantes (
  id uuid primary key default gen_random_uuid(),
  treinamento_id uuid not null references treinamentos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  presente boolean,
  nota numeric(4, 1),
  observacao text,
  unique (treinamento_id, usuario_id)
);
create index idx_treinamentos_participantes_treinamento on treinamentos_participantes(treinamento_id);
create index idx_treinamentos_participantes_usuario on treinamentos_participantes(usuario_id);

-- ---------- MATRIZ DE VERSATILIDADE (colaborador x competência -> nível 0-4) ----------
-- 0 Não treinado / 1 Em treinamento / 2 Treinado / 3 Treinado com autonomia / 4 Multiplicador.
create table treinamentos_versatilidade (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  competencia_id uuid not null references treinamentos_competencias(id) on delete cascade,
  nivel int not null default 0 check (nivel between 0 and 4),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id),
  unique (usuario_id, competencia_id)
);
create index idx_treinamentos_versatilidade_empresa on treinamentos_versatilidade(empresa_id);
create index idx_treinamentos_versatilidade_competencia on treinamentos_versatilidade(competencia_id);

-- Ao confirmar eficácia de um treinamento vinculado a uma competência, eleva pra nível 2 (Treinado)
-- todo participante presente cujo nível hoje seja menor — nunca rebaixa um nível manual mais alto
-- (ex: alguém já marcado como Multiplicador continua Multiplicador mesmo repetindo o treinamento).
create or replace function treinamentos_atualizar_versatilidade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.eficacia_resultado = 'eficaz' and (old.eficacia_resultado is distinct from new.eficacia_resultado) and new.competencia_id is not null then
    insert into treinamentos_versatilidade (empresa_id, usuario_id, competencia_id, nivel, atualizado_por)
    select new.empresa_id, p.usuario_id, new.competencia_id, 2, new.eficacia_avaliado_por
      from treinamentos_participantes p
      where p.treinamento_id = new.id and p.presente = true
    on conflict (usuario_id, competencia_id) do update
      set nivel = greatest(treinamentos_versatilidade.nivel, excluded.nivel),
          atualizado_em = now(),
          atualizado_por = excluded.atualizado_por;
  end if;
  return new;
end;
$$;
create trigger trg_treinamentos_atualizar_versatilidade
after update of eficacia_resultado on treinamentos
for each row execute function treinamentos_atualizar_versatilidade();

-- ---------- RLS ----------
alter table treinamentos_competencias enable row level security;
alter table treinamentos enable row level security;
alter table treinamentos_participantes enable row level security;
alter table treinamentos_versatilidade enable row level security;

-- ===== submódulo 'solicitacoes' (treinamentos + participantes) =====
create policy treinamentos_select on treinamentos for select using (
  usuario_tem_acesso_empresa(empresa_id) and nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') <> 'sem_acesso'
);
create policy treinamentos_insert on treinamentos for insert with check (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and solicitante_id = auth.uid())
);
create policy treinamentos_update on treinamentos for update using (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and solicitante_id = auth.uid())
) with check (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and solicitante_id = auth.uid())
);
create policy treinamentos_delete on treinamentos for delete using (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and solicitante_id = auth.uid())
);

create policy treinamentos_participantes_select on treinamentos_participantes for select using (
  exists (select 1 from treinamentos t where t.id = treinamentos_participantes.treinamento_id
    and usuario_tem_acesso_empresa(t.empresa_id) and nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') <> 'sem_acesso')
);
create policy treinamentos_participantes_insert on treinamentos_participantes for insert with check (
  exists (select 1 from treinamentos t where t.id = treinamentos_participantes.treinamento_id and (
    nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'total'
    or (nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and t.solicitante_id = auth.uid())
  ))
);
create policy treinamentos_participantes_update on treinamentos_participantes for update using (
  exists (select 1 from treinamentos t where t.id = treinamentos_participantes.treinamento_id and (
    nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'total'
    or (nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and t.solicitante_id = auth.uid())
  ))
) with check (
  exists (select 1 from treinamentos t where t.id = treinamentos_participantes.treinamento_id and (
    nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'total'
    or (nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and t.solicitante_id = auth.uid())
  ))
);
create policy treinamentos_participantes_delete on treinamentos_participantes for delete using (
  exists (select 1 from treinamentos t where t.id = treinamentos_participantes.treinamento_id and (
    nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'total'
    or (nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and t.solicitante_id = auth.uid())
  ))
);

-- ===== submódulo 'versatilidade' (catálogo de competências + matriz) =====
create policy treinamentos_competencias_select on treinamentos_competencias for select using (
  usuario_tem_acesso_empresa(empresa_id) and nivel_edicao_usuario(empresa_id, 'treinamentos', 'versatilidade') <> 'sem_acesso'
);
create policy treinamentos_competencias_insert on treinamentos_competencias for insert with check (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'versatilidade') = 'total'
);
create policy treinamentos_competencias_update on treinamentos_competencias for update using (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'versatilidade') = 'total'
) with check (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'versatilidade') = 'total'
);
create policy treinamentos_competencias_delete on treinamentos_competencias for delete using (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'versatilidade') = 'total'
);

create policy treinamentos_versatilidade_select on treinamentos_versatilidade for select using (
  usuario_tem_acesso_empresa(empresa_id) and nivel_edicao_usuario(empresa_id, 'treinamentos', 'versatilidade') <> 'sem_acesso'
);
create policy treinamentos_versatilidade_insert on treinamentos_versatilidade for insert with check (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'versatilidade') = 'total'
);
create policy treinamentos_versatilidade_update on treinamentos_versatilidade for update using (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'versatilidade') = 'total'
) with check (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'versatilidade') = 'total'
);
create policy treinamentos_versatilidade_delete on treinamentos_versatilidade for delete using (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'versatilidade') = 'total'
);
-- Nota: treinamentos_atualizar_versatilidade() acima é security definer e roda com o dono da
-- função (papel usado ao aplicar a migração), que não está sujeito às políticas RLS desta tabela —
-- não precisa de uma policy adicional só pra liberar o efeito da trigger.

-- ---------- CATÁLOGO DE MÓDULOS/SUBMÓDULOS ----------
-- 'treinamentos' (módulo inteiro) já existia como configuravel=false (0064) — vira configurável, e
-- ganha os dois submódulos novos.
update catalogo_modulos_submodulos set configuravel = true where modulo = 'treinamentos' and submodulo is null;
insert into catalogo_modulos_submodulos (modulo, submodulo, configuravel, ordem) values
  ('treinamentos', 'solicitacoes', true, 1),
  ('treinamentos', 'versatilidade', true, 2);
