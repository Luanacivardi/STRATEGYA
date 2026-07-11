-- Indicadores: classificação (com meta / monitoramento / complementar) e descrição separada da fórmula.
-- Indicadores de monitoramento/complementar não necessariamente têm meta/polaridade, então esses campos deixam de ser obrigatórios.
alter table indicadores add column classificacao text not null default 'com_meta' check (classificacao in ('com_meta', 'monitoramento', 'complementar'));
alter table indicadores add column descricao text;
alter table indicadores alter column meta drop not null;
alter table indicadores alter column polaridade drop not null;
