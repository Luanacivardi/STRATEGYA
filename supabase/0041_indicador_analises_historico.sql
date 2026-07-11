-- Apresentação do indicador: cada "Salvar análise" passa a criar um registro histórico com data
-- e autor (em vez de só sobrescrever um único campo), pro usuário ver a evolução das análises
-- ao longo do tempo direto na apresentação.

create table indicador_analises (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  indicador_id uuid not null references indicadores(id) on delete cascade,
  texto text not null,
  usuario_id uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index idx_indicador_analises_indicador on indicador_analises(indicador_id);
create index idx_indicador_analises_empresa on indicador_analises(empresa_id);

alter table indicador_analises enable row level security;

create policy indicador_analises_select on indicador_analises for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = indicador_analises.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
);

-- Mesma regra de edição do próprio indicador: 'total' sempre pode; 'proprio' só quem é o
-- responsável pelo indicador.
create policy indicador_analises_write on indicador_analises for all using (
  nivel_edicao_usuario(empresa_id) = 'total'
  or (nivel_edicao_usuario(empresa_id) = 'proprio' and exists (
    select 1 from indicadores i where i.id = indicador_analises.indicador_id and i.responsavel_id = auth.uid()
  ))
) with check (
  nivel_edicao_usuario(empresa_id) = 'total'
  or (nivel_edicao_usuario(empresa_id) = 'proprio' and exists (
    select 1 from indicadores i where i.id = indicador_analises.indicador_id and i.responsavel_id = auth.uid()
  ))
);

create trigger trg_log_alteracao after insert or update or delete on indicador_analises for each row execute function fn_log_alteracao();
