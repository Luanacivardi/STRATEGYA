-- Confirmado (grep nas migrações + consulta a pg_policies/pg_proc no banco real) que nenhuma
-- política ou função ainda chama nivel_edicao_usuario(uuid) de 1 argumento — todas as tabelas do
-- Planejamento Estratégico, Ações, Controladoria e Documentos já foram migradas para a versão de
-- módulo/submódulo (migrações 0066-0072). Segura para remover.
drop function nivel_edicao_usuario(uuid);
