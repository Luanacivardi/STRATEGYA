-- "Ações" deixou de ser aba do Planejamento Estratégico e virou módulo próprio ('acoes').
-- Toda empresa que já tinha 'planejamento-estrategico' habilitado precisa ganhar 'acoes'
-- automaticamente, senão perde acesso à tela no dia do deploy.

update empresas
set modulos_habilitados = array_append(modulos_habilitados, 'acoes')
where 'planejamento-estrategico' = any(modulos_habilitados)
  and not ('acoes' = any(modulos_habilitados));

-- Novas empresas passam a nascer com 'acoes' no default também.
alter table empresas alter column modulos_habilitados
  set default array['planejamento-estrategico', 'acoes', 'riscos-oportunidades'];
