-- Correção: os índices únicos parciais criados na 0063 (com expressão coalesce(submodulo,'')) não
-- podem ser usados como alvo de upsert via Supabase-js/PostgREST — o parâmetro on_conflict só aceita
-- lista simples de colunas, não expressões, e não infere índices parciais/de expressão sem repetir a
-- expressão exata no próprio ON CONFLICT (que o PostgREST não permite compor). Esse projeto já
-- passou por esse exato problema antes (ver migração remota "fix_permissoes_edicao_upsert_on_conflict",
-- que trocou os índices parciais originais de 0031 por constraints verdadeiras).
--
-- Solução: coluna gerada submodulo_norm (coalesce(submodulo,'') "congelado" como coluna real) e
-- constraints verdadeiras (não parciais, não-expressão) sobre ela. Continua funcionando como
-- "uma linha por usuário/departamento por módulo/submódulo" porque, numa constraint UNIQUE comum,
-- linhas com usuario_id NULL (as de departamento) nunca conflitam entre si nem com as de usuário
-- (NULL nunca é igual a NULL) — dispensa o "where usuario_id is not null" do índice parcial.

drop index if exists uq_permissoes_edicao_dep;
drop index if exists uq_permissoes_edicao_user;

alter table permissoes_edicao add column submodulo_norm text generated always as (coalesce(submodulo, '')) stored;

alter table permissoes_edicao add constraint uq_permissoes_edicao_user unique (usuario_id, empresa_id, modulo, submodulo_norm);
alter table permissoes_edicao add constraint uq_permissoes_edicao_dep unique (departamento_id, modulo, submodulo_norm);
