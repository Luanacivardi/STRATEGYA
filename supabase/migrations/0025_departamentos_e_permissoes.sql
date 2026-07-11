-- Segurança/Fase 16: cadastro de departamentos por empresa, vínculo opcional do colaborador a um
-- departamento, e liberação de acesso a módulos por usuário individual OU por departamento inteiro
-- (além do controle já existente por empresa em empresas.modulos_habilitados).
create table departamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

alter table departamentos enable row level security;

create policy departamentos_select on departamentos for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = departamentos.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
);
create policy departamentos_all on departamentos for all using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = departamentos.empresa_id and ue.usuario_id = auth.uid() and ue.papel in ('orbeex','admin') and ue.ativo)
) with check (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = departamentos.empresa_id and ue.usuario_id = auth.uid() and ue.papel in ('orbeex','admin') and ue.ativo)
);

alter table usuarios_empresas add column departamento_id uuid references departamentos(id) on delete set null;

-- Presença de QUALQUER linha para um usuário ou departamento ativa o modo "lista de permissão":
-- só os módulos listados ficam visíveis para ele, mesmo que a empresa tenha outros habilitados.
-- Sem nenhuma linha (comportamento padrão, compatível com o que já existia): vê tudo que a
-- empresa habilitou. Restrição por usuário tem prioridade sobre a do departamento.
create table modulos_restritos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  departamento_id uuid references departamentos(id) on delete cascade,
  usuario_id uuid references auth.users(id) on delete cascade,
  modulo_id text not null,
  check (
    (departamento_id is not null and usuario_id is null) or
    (departamento_id is null and usuario_id is not null)
  )
);

create unique index uq_modulos_restritos_dep on modulos_restritos(departamento_id, modulo_id) where departamento_id is not null;
create unique index uq_modulos_restritos_user on modulos_restritos(usuario_id, empresa_id, modulo_id) where usuario_id is not null;

alter table modulos_restritos enable row level security;

create policy modulos_restritos_select on modulos_restritos for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = modulos_restritos.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
);
create policy modulos_restritos_all on modulos_restritos for all using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = modulos_restritos.empresa_id and ue.usuario_id = auth.uid() and ue.papel in ('orbeex','admin') and ue.ativo)
) with check (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = modulos_restritos.empresa_id and ue.usuario_id = auth.uid() and ue.papel in ('orbeex','admin') and ue.ativo)
);

create trigger trg_log_alteracao after insert or update or delete on departamentos for each row execute function fn_log_alteracao();
create trigger trg_log_alteracao after insert or update or delete on modulos_restritos for each row execute function fn_log_alteracao();
