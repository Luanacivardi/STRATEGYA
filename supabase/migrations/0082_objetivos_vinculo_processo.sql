-- Vincula cada Objetivo Estratégico a um processo do Macrofluxo (cadastro passa a exigir esse
-- vínculo). Usado na impressão do SIPOC para listar, por processo, os objetivos vinculados e os
-- indicadores que medem esses objetivos.
alter table objetivos_estrategicos
  add column processo_id uuid references macrofluxo_processos(id) on delete set null;

create index idx_objetivos_processo on objetivos_estrategicos(processo_id);
