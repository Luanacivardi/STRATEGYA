-- Redesign do sistema de permissões (fase 1/schema):
-- 1) Novo papel 'gestor', entre 'admin' e 'usuario'.
-- 2) permissoes_edicao ganha granularidade por módulo/submódulo (antes valia pra empresa inteira).
--    Linhas existentes recebem modulo='*' automaticamente (coringa "vale pra tudo"), preservando
--    100% do comportamento atual sem precisar de UPDATE manual.
-- 3) Dois valores novos de nível: 'aprovacao' (elegibilidade de aprovador, ver módulo Documentos) e
--    'sem_acesso' (oculta módulo/submódulo por completo — é o mecanismo que faz o papel 'usuario'
--    não ver o Planejamento Estratégico por padrão).
-- Não renomeamos 'leitura'/'proprio'/'total': nenhuma política RLS hoje compara literalmente contra
-- 'leitura' (é sempre o "else" implícito), então o risco de manter é baixo e evita inflar o diff das
-- próximas migrações de RLS à toa. A nomenclatura nova (Visualização/Edição sob Responsabilidade/
-- Edição Total/Aprovação) fica só no dicionário de labels da UI.

alter table usuarios_empresas drop constraint usuarios_empresas_papel_check;
alter table usuarios_empresas add constraint usuarios_empresas_papel_check
  check (papel in ('orbeex', 'admin', 'gestor', 'usuario'));

alter table permissoes_edicao add column modulo text not null default '*';
alter table permissoes_edicao add column submodulo text null;

-- No banco real, uq_permissoes_edicao_dep/uq_permissoes_edicao_user viraram CONSTRAINTS unique
-- (não índices soltos como no arquivo original 0031) — precisa dropar como constraint.
alter table permissoes_edicao drop constraint uq_permissoes_edicao_dep;
alter table permissoes_edicao drop constraint uq_permissoes_edicao_user;

create unique index uq_permissoes_edicao_dep
  on permissoes_edicao(departamento_id, modulo, coalesce(submodulo, ''))
  where departamento_id is not null;

create unique index uq_permissoes_edicao_user
  on permissoes_edicao(usuario_id, empresa_id, modulo, coalesce(submodulo, ''))
  where usuario_id is not null;

alter table permissoes_edicao drop constraint permissoes_edicao_nivel_check;
alter table permissoes_edicao add constraint permissoes_edicao_nivel_check
  check (nivel in ('leitura', 'proprio', 'total', 'aprovacao', 'sem_acesso'));
