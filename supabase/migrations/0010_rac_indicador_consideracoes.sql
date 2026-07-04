-- Ata de reunião de análise crítica: permite selecionar um indicador (a UI então
-- traz todo o histórico/objetivo vinculado a ele) e um campo livre de considerações.
alter table reunioes_analise_critica add column indicador_id uuid references indicadores(id) on delete set null;
alter table reunioes_analise_critica add column consideracoes text;
