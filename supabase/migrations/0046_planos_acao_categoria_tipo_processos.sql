-- Plano de Ação: campos de classificação para atender qualidade/auditoria —
-- categoria de origem (de onde partiu a demanda), tipo do plano (natureza da ocorrência),
-- processo emissor e processo responsável (referenciam macrofluxo_processos), e nome do
-- cliente/fornecedor quando o tipo envolver uma dessas partes.

alter table planos_acao add column origem_categoria text
  check (origem_categoria in (
    'interna', 'analise_critica', 'auditoria_externa', 'auditoria_interna',
    'cliente', 'fornecedor', 'indicadores', 'planejamento_estrategico'
  ));

alter table planos_acao add column tipo text
  check (tipo in (
    'incidente', 'mitigacao_risco', 'mudanca', 'nao_conformidade', 'oportunidade_melhoria',
    'prevencao', 'reclamacao_cliente', 'reclamacao_nao_procedente', 'devolucao',
    'reclamacao_fornecedor', 'notificacao_cliente'
  ));

alter table planos_acao add column processo_emissor_id uuid references macrofluxo_processos(id) on delete set null;
alter table planos_acao add column processo_responsavel_id uuid references macrofluxo_processos(id) on delete set null;

alter table planos_acao add column nome_cliente text;
alter table planos_acao add column nome_fornecedor text;

comment on column planos_acao.origem_categoria is 'De onde partiu a demanda do plano: interna, analise_critica, auditoria_externa, auditoria_interna, cliente, fornecedor, indicadores, planejamento_estrategico.';
comment on column planos_acao.tipo is 'Natureza da ocorrência que originou o plano (incidente, não conformidade, reclamação, etc.).';
comment on column planos_acao.processo_emissor_id is 'Processo (macrofluxo) que está emitindo o plano.';
comment on column planos_acao.processo_responsavel_id is 'Processo (macrofluxo) responsável pela execução do plano.';
comment on column planos_acao.nome_cliente is 'Nome do cliente, preenchido quando o tipo/categoria envolver reclamação ou notificação de cliente.';
comment on column planos_acao.nome_fornecedor is 'Nome do fornecedor, preenchido quando o tipo/categoria envolver reclamação ou devolução de fornecedor.';
