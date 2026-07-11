-- Ata de Reunião ganha status ('aberta'/'fechada'). Passa a existir o conceito de "ata do dia":
-- quando alguém salva uma análise na apresentação de um indicador, o sistema encontra (ou cria)
-- a ata aberta de hoje e registra a análise nela — permitindo acumular análises de vários
-- indicadores na mesma ata ao longo do dia, sem precisar abrir uma ata manualmente.

alter table reunioes_analise_critica add column status text not null default 'aberta' check (status in ('aberta', 'fechada'));

-- Atas já existentes são registros de reuniões passadas — ficam marcadas como fechadas por padrão,
-- só as novas (a partir de agora) nascem abertas.
update reunioes_analise_critica set status = 'fechada';

create index idx_rac_empresa_data_status on reunioes_analise_critica(empresa_id, data, status);
