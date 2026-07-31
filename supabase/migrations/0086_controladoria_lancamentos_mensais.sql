-- Controladoria — lançamento mensal de Orçado x Realizado por conta gerencial (o que a planilha
-- de referência da Tedesco faz manualmente por aba). Substitui meta_mensal/meta_anual como fonte
-- do gráfico da conta: cada competência agora tem um valor orçado e um realizado lançados aqui,
-- e a variação (R$ e %) é calculada em cima disso — não fica mais dependente de upload de arquivo
-- externo pra existir um gráfico.

create table contas_lancamentos_mensais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  conta_id uuid not null references contas_gerenciais(id) on delete cascade,
  competencia date not null,
  valor_orcado numeric(14,2),
  valor_realizado numeric(14,2),
  usuario_id uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (conta_id, competencia)
);

create index idx_contas_lancamentos_conta on contas_lancamentos_mensais(conta_id);
create index idx_contas_lancamentos_empresa on contas_lancamentos_mensais(empresa_id);

alter table contas_lancamentos_mensais enable row level security;

create policy contas_lancamentos_mensais_select on contas_lancamentos_mensais for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = contas_lancamentos_mensais.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
  and nivel_edicao_usuario(empresa_id, 'controladoria') <> 'sem_acesso'
);

create policy contas_lancamentos_mensais_insert on contas_lancamentos_mensais for insert with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_lancamentos_mensais.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
);

create policy contas_lancamentos_mensais_update on contas_lancamentos_mensais for update using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_lancamentos_mensais.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
) with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_lancamentos_mensais.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
);

create policy contas_lancamentos_mensais_delete on contas_lancamentos_mensais for delete using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_lancamentos_mensais.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
);

create trigger trg_log_alteracao after insert or update or delete on contas_lancamentos_mensais for each row execute function fn_log_alteracao();
