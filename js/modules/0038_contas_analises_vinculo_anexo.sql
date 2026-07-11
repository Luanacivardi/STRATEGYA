-- Permite registrar uma análise vinculada a um anexo específico (a imagem/gráfico que a originou),
-- além da análise geral por competência que já existia. anexo_id fica opcional: análises antigas
-- (sem anexo) continuam funcionando normalmente.

alter table contas_analises add column anexo_id uuid references contas_anexos(id) on delete set null;
create index idx_contas_analises_anexo on contas_analises(anexo_id);
