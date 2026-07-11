-- Substitui a restrição de módulos por departamento/usuário (migração 0025/Fase 16) por um nível
-- de permissão de EDIÇÃO: leitura / edição só do que o usuário é responsável / edição total.
-- Vale apenas para o papel 'usuario' (orbeex e admin sempre têm edição total, como já era antes).
--
-- modulos_restritos não tinha nenhuma linha em produção (confirmado antes desta migração), então
-- é seguro remover. departamentos continua existindo — só a tabela de restrição de módulo some.
drop table if exists modulos_restritos;

create table permissoes_edicao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  departamento_id uuid references departamentos(id) on delete cascade,
  usuario_id uuid references auth.users(id) on delete cascade,
  nivel text not null check (nivel in ('leitura', 'proprio', 'total')),
  check (
    (departamento_id is not null and usuario_id is null) or
    (departamento_id is null and usuario_id is not null)
  )
);

create unique index uq_permissoes_edicao_dep on permissoes_edicao(departamento_id) where departamento_id is not null;
create unique index uq_permissoes_edicao_user on permissoes_edicao(usuario_id, empresa_id) where usuario_id is not null;

alter table permissoes_edicao enable row level security;

create policy permissoes_edicao_select on permissoes_edicao for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = permissoes_edicao.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
);
create policy permissoes_edicao_all on permissoes_edicao for all using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = permissoes_edicao.empresa_id and ue.usuario_id = auth.uid() and ue.papel in ('orbeex','admin') and ue.ativo)
) with check (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = permissoes_edicao.empresa_id and ue.usuario_id = auth.uid() and ue.papel in ('orbeex','admin') and ue.ativo)
);

create trigger trg_log_alteracao after insert or update or delete on permissoes_edicao for each row execute function fn_log_alteracao();
