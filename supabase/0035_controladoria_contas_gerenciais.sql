-- Módulo Controladoria: cadastro de contas gerenciais. "Área responsável" reaproveita a tabela
-- departamentos já existente; "Responsável pela análise" é o campo que habilita o nível de edição
-- 'proprio' (mesmo padrão já usado em objetivos/indicadores/planos de ação/tarefas).

create table contas_gerenciais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  codigo text not null,
  nome text not null,
  categoria text not null check (categoria in ('receita', 'custo', 'despesa', 'investimento')),
  departamento_id uuid references departamentos(id) on delete set null,
  responsavel_analise_id uuid references auth.users(id) on delete set null,
  meta_mensal numeric(14,2),
  meta_anual numeric(14,2),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (empresa_id, codigo)
);

create index idx_contas_gerenciais_empresa on contas_gerenciais(empresa_id);

alter table contas_gerenciais enable row level security;

create policy contas_gerenciais_select on contas_gerenciais for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = contas_gerenciais.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
);

-- nivel_edicao_usuario já retorna 'total' pra orbeex/admin automaticamente (função da migração 0032),
-- então essa única política cobre todos os papéis.
create policy contas_gerenciais_write on contas_gerenciais for all using (
  nivel_edicao_usuario(empresa_id) = 'total'
  or (nivel_edicao_usuario(empresa_id) = 'proprio' and responsavel_analise_id = auth.uid())
) with check (
  nivel_edicao_usuario(empresa_id) = 'total'
  or (nivel_edicao_usuario(empresa_id) = 'proprio' and responsavel_analise_id = auth.uid())
);

create trigger trg_log_alteracao after insert or update or delete on contas_gerenciais for each row execute function fn_log_alteracao();
