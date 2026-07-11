-- Controladoria — Parte 2: gestão de responsáveis (via contas_gerenciais.responsavel_analise_id,
-- já existente), análises periódicas com justificativa de desvio, upload de relatórios/gráficos
-- (bucket privado, mesmo padrão de evidencias-planos), e integração com Plano de Ação e Tarefas.

-- =========================================================
-- ANÁLISES PERIÓDICAS (registro + justificativa de desvio)
-- =========================================================
create table contas_analises (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  conta_id uuid not null references contas_gerenciais(id) on delete cascade,
  competencia date not null,
  texto_analise text not null,
  houve_desvio boolean not null default false,
  justificativa_desvio text,
  usuario_id uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index idx_contas_analises_conta on contas_analises(conta_id);
create index idx_contas_analises_empresa on contas_analises(empresa_id);

alter table contas_analises enable row level security;

create policy contas_analises_select on contas_analises for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = contas_analises.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
);

create policy contas_analises_write on contas_analises for all using (
  nivel_edicao_usuario(empresa_id) = 'total'
  or (nivel_edicao_usuario(empresa_id) = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_analises.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
) with check (
  nivel_edicao_usuario(empresa_id) = 'total'
  or (nivel_edicao_usuario(empresa_id) = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_analises.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
);

create trigger trg_log_alteracao after insert or update or delete on contas_analises for each row execute function fn_log_alteracao();

-- =========================================================
-- UPLOAD DE RELATÓRIOS E GRÁFICOS (histórico obrigatório por conta)
-- =========================================================
create table contas_anexos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  conta_id uuid not null references contas_gerenciais(id) on delete cascade,
  competencia date not null,
  arquivo_url text not null,   -- caminho no bucket 'contas-anexos', não URL pública (bucket privado)
  arquivo_nome text not null,
  arquivo_tipo text not null check (arquivo_tipo in ('pdf', 'excel', 'png', 'jpg', 'powerpoint')),
  usuario_id uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index idx_contas_anexos_conta on contas_anexos(conta_id);
create index idx_contas_anexos_empresa on contas_anexos(empresa_id);

alter table contas_anexos enable row level security;

create policy contas_anexos_select on contas_anexos for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = contas_anexos.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
);

create policy contas_anexos_write on contas_anexos for all using (
  nivel_edicao_usuario(empresa_id) = 'total'
  or (nivel_edicao_usuario(empresa_id) = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_anexos.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
) with check (
  nivel_edicao_usuario(empresa_id) = 'total'
  or (nivel_edicao_usuario(empresa_id) = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_anexos.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
);

create trigger trg_log_alteracao after insert or update or delete on contas_anexos for each row execute function fn_log_alteracao();

-- Bucket privado — caminho dos arquivos: {empresa_id}/{conta_id}/{timestamp}_{nome do arquivo}
insert into storage.buckets (id, name, public) values ('contas-anexos', 'contas-anexos', false)
on conflict (id) do nothing;

create policy "contas_anexos_storage_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'contas-anexos'
    and exists (select 1 from usuarios_empresas ue where ue.empresa_id = (split_part(name, '/', 1))::uuid and ue.usuario_id = auth.uid() and ue.ativo)
  );

create policy "contas_anexos_storage_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'contas-anexos'
    and (
      nivel_edicao_usuario((split_part(name, '/', 1))::uuid) = 'total'
      or (
        nivel_edicao_usuario((split_part(name, '/', 1))::uuid) = 'proprio'
        and exists (select 1 from contas_gerenciais cg where cg.id = (split_part(name, '/', 2))::uuid and cg.responsavel_analise_id = auth.uid())
      )
    )
  );

create policy "contas_anexos_storage_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'contas-anexos'
    and (
      nivel_edicao_usuario((split_part(name, '/', 1))::uuid) = 'total'
      or (
        nivel_edicao_usuario((split_part(name, '/', 1))::uuid) = 'proprio'
        and exists (select 1 from contas_gerenciais cg where cg.id = (split_part(name, '/', 2))::uuid and cg.responsavel_analise_id = auth.uid())
      )
    )
  );

-- =========================================================
-- INTEGRAÇÃO COM PLANO DE AÇÃO ("Criar Plano de Ação" a partir de uma análise)
-- =========================================================
alter table planos_acao add column prioridade text check (prioridade in ('baixa', 'media', 'alta'));
alter table planos_acao add column analise_origem_id uuid references contas_analises(id) on delete set null;
-- "Impacto financeiro" reaproveita a coluna quanto_custa, já existente.
-- origem_id, quando origem = 'conta_gerencial', aponta pra contas_gerenciais.id — mantém o vínculo com a conta;
-- analise_origem_id mantém o vínculo com a análise específica que originou o plano.

alter table planos_acao drop constraint planos_acao_origem_check;
alter table planos_acao add constraint planos_acao_origem_check
  check (origem in ('objetivo', 'indicador', 'risco', 'nc', 'rac', 'conta_gerencial'));

-- =========================================================
-- INTEGRAÇÃO COM TAREFAS (gerar tarefa a partir de uma análise, com vínculo conta/competência/análise)
-- =========================================================
alter table todo_itens add column conta_id uuid references contas_gerenciais(id) on delete set null;
alter table todo_itens add column competencia date;
alter table todo_itens add column analise_id uuid references contas_analises(id) on delete set null;
