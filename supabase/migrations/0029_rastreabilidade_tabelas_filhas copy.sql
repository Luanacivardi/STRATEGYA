-- Campo de evolução/descrição das ações realizadas, editável direto na aba Tarefas
-- para as 3 origens que ela consolida (manual, plano de ação, ata de reunião).
alter table todo_itens add column evolucao text;
alter table planos_acao_itens add column evolucao text;
alter table rac_acoes add column evolucao text;
