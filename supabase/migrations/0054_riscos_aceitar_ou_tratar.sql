-- Riscos e Oportunidades: cada item precisa de uma decisão de tratamento — aceitar (com
-- justificativa) ou tratar (vinculado a um plano de ação em Gestão de Ações, via o mesmo
-- mecanismo origem/origem_id que planos_acao já usa para 'risco').

alter table riscos_oportunidades add column decisao text check (decisao in ('aceitar', 'tratar'));
alter table riscos_oportunidades add column justificativa_aceite text;

comment on column riscos_oportunidades.decisao is 'Decisão de tratamento do risco/oportunidade: aceitar (com justificativa) ou tratar (gera plano de ação vinculado).';
comment on column riscos_oportunidades.justificativa_aceite is 'Preenchido apenas quando decisao = aceitar — justificativa de por que o risco foi aceito sem plano de ação.';
