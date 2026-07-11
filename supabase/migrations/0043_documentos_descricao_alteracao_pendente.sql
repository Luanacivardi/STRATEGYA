-- Coluna de apoio: guarda a descrição da alteração informada ao iniciar uma nova revisão
-- (regra "descricao_alteracao obrigatório para prosseguir"), consumida ao publicar (vira o
-- registro de documentos_revisoes) e limpa em seguida.
alter table documentos add column descricao_alteracao_pendente text;
