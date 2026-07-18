-- Agenda: adiciona sugestão de auditor por bloco (calculada no cliente a partir da equipe
-- designada, evitando quem tem impedimento de área para o processo do bloco) — sugestão, não
-- designação obrigatória: o comitê/gestor pode trocar manualmente na execução.

alter table auditorias_agenda add column auditor_sugerido_id uuid references auditores(id) on delete set null;
comment on column auditorias_agenda.auditor_sugerido_id is 'Sugestão automática de auditor para o bloco, calculada a partir da equipe designada (round-robin, evitando impedimento de área). Apenas sugestão, não vínculo obrigatório.';
