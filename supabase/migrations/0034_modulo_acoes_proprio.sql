-- "Ações" deixou de ser aba do Planejamento Estratégico e virou módulo próprio ('acoes').
-- Toda empresa que já tinha 'planejamento-estrategico' habilitado precisa ganhar 'acoes'
-- automaticamente, senão perde acesso à tela no dia do deploy.
-- O UPDATE abaixo roda fora de um contexto de usuário autenticado (auth.uid() nulo, ex: SQL
-- Editor ou migration), então o trigger de proteção (que exige papel ORBEEX) é desativado
-- só durante esse UPDATE e reativado logo em seguida.

alter table empresas disable trigger trg_proteger_modulos_habilitados;

update empresas
set modulos_habilitados = array_append(modulos_habilitados, 'acoes')
where 'planejamento-estrategico' = any(modulos_habilitados)
  and not ('acoes' = any(modulos_habilitados));

alter table empresas enable trigger trg_proteger_modulos_habilitados;

-- Novas empresas passam a nascer com 'acoes' no default também.
alter table empresas alter column modulos_habilitados
  set default array['planejamento-estrategico', 'acoes', 'riscos-oportunidades'];
