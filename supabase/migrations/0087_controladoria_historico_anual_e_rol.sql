-- Controladoria — dados pra reproduzir os 3 gráficos da planilha de referência da Tedesco por
-- conta (Histórico Anual, Mensal do ano corrente, % sobre a ROL):
--   1) histórico anual da própria conta (anos fechados, só orçado/realizado por ano — não vale a
--      pena uma tabela nova pra 2-3 linhas por conta que quase nunca mudam, então vai como jsonb
--      na própria contas_gerenciais, reaproveitando a RLS que já existe pra essa tabela);
--   2) ROL (Receita Operacional Líquida) da empresa, que é um dado único por empresa (não por
--      conta) usado como denominador do "% sobre a ROL" de todas as contas — precisa de tabela
--      própria porque é lançada mês a mês (2026 em diante) e tem RLS diferente (só quem tem
--      nível 'total' em controladoria pode editar, já que não pertence a uma conta/responsável
--      específico).

alter table contas_gerenciais add column historico_anual jsonb not null default '{}'::jsonb;
-- Formato: {"2023": {"orcado": 1000, "realizado": 900}, "2024": {...}, ...}

create table empresa_rol_mensal (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  competencia date not null,
  valor_orcado numeric(16,2),
  valor_realizado numeric(16,2),
  usuario_id uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (empresa_id, competencia)
);
create index idx_empresa_rol_mensal_empresa on empresa_rol_mensal(empresa_id);

create table empresa_rol_historico_anual (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  ano integer not null,
  valor_orcado numeric(16,2),
  valor_realizado numeric(16,2),
  usuario_id uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (empresa_id, ano)
);
create index idx_empresa_rol_anual_empresa on empresa_rol_historico_anual(empresa_id);

alter table empresa_rol_mensal enable row level security;
alter table empresa_rol_historico_anual enable row level security;

create policy empresa_rol_mensal_select on empresa_rol_mensal for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = empresa_rol_mensal.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
  and nivel_edicao_usuario(empresa_id, 'controladoria') <> 'sem_acesso'
);
create policy empresa_rol_mensal_write on empresa_rol_mensal for all using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
) with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
);

create policy empresa_rol_historico_anual_select on empresa_rol_historico_anual for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = empresa_rol_historico_anual.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
  and nivel_edicao_usuario(empresa_id, 'controladoria') <> 'sem_acesso'
);
create policy empresa_rol_historico_anual_write on empresa_rol_historico_anual for all using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
) with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
);

create trigger trg_log_alteracao after insert or update or delete on empresa_rol_mensal for each row execute function fn_log_alteracao();
create trigger trg_log_alteracao after insert or update or delete on empresa_rol_historico_anual for each row execute function fn_log_alteracao();
