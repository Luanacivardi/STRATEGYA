-- Agenda: segundo auditor sugerido (auditoria interna sempre sugere 2 auditores por processo,
-- em rodízio, para reforçar o princípio de dupla verificação em auditoria interna).
-- Os demais campos do bloco (hora_inicio/hora_fim/rotulo) já são colunas simples e passam a ser
-- editáveis diretamente pela interface (update, sem migration necessária para isso).

alter table auditorias_agenda add column auditor_sugerido_2_id uuid references auditores(id) on delete set null;
comment on column auditorias_agenda.auditor_sugerido_2_id is 'Segundo auditor sugerido para o bloco — preenchido apenas quando a auditoria é do tipo interna (regra de 2 auditores por área).';
