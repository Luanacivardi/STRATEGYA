-- Amplia o relatório de auditoria: ata de abertura/encerramento, tipo de auditoria "SMETA",
-- novos campos de instrumentos (data de calibração, nº do certificado) e flag "não aplicável",
-- vínculo opcional de procedimento auditado com um documento do módulo Documentos, e um mecanismo
-- de finalização/trava do relatório (imutável após "Finalizar Relatório", com exceção da criação
-- de planos de ação — que já é 100% automática via trigger auditorias_gerar_acao_por_nc, não
-- depende de nenhuma trava aqui).

alter table auditorias add column ata_abertura text;
alter table auditorias add column ata_fechamento text;
comment on column auditorias.ata_abertura is 'Ata da reunião de abertura da auditoria (participantes, pauta, observações) — texto livre.';
comment on column auditorias.ata_fechamento is 'Ata da reunião de encerramento da auditoria — texto livre.';

alter table auditorias add column instrumentos_nao_aplicavel boolean not null default false;
comment on column auditorias.instrumentos_nao_aplicavel is 'true quando a auditoria não envolve instrumentos de medição — esconde a seção no relatório.';

alter table auditorias add column relatorio_fechado boolean not null default false;
alter table auditorias add column relatorio_fechado_em timestamptz;
alter table auditorias add column relatorio_fechado_por uuid references auth.users(id);
comment on column auditorias.relatorio_fechado is 'Trava o conteúdo do relatório (requisitos, achados, ata, instrumentos, procedimentos, pessoas, conclusão) contra novas edições. Ver botão "Finalizar Relatório" em auditorias.js.';

-- Tipo de auditoria: adiciona "SMETA" (auditoria social, distinta das normas ISO já suportadas).
alter table auditorias drop constraint auditorias_tipo_check;
alter table auditorias add constraint auditorias_tipo_check
  check (tipo in ('interna', 'externa', 'cliente', 'fornecedor', 'certificacao', 'manutencao', 'recertificacao', 'extraordinaria', 'smeta', 'outro'));

-- Instrumentos: calibração passa a registrar data e nº de certificado, não só a conformidade.
alter table auditorias_relatorio_instrumentos add column data_calibracao date;
alter table auditorias_relatorio_instrumentos add column numero_certificado text;

-- Procedimentos: vínculo opcional com um documento publicado do módulo Documentos (quando o
-- cliente tem o módulo habilitado — ver moduloHabilitadoParaEmpresa em app.js). Quando nulo, o
-- campo "procedimento" continua sendo o texto livre digitado manualmente (fallback já existente).
alter table auditorias_relatorio_procedimentos add column documento_id uuid references documentos(id) on delete set null;

-- ===== Trava de imutabilidade pós-fechamento (defesa em profundidade — a UI já esconde os =====
-- ===== formulários; isso impede editar via chamada direta à API mesmo com Edição Total).    =====
-- Recria as políticas de insert/update/delete definidas em 0079_rls_auditorias_configuravel.sql
-- com a condição adicional "and not a.relatorio_fechado". As políticas de select não mudam
-- (conteúdo continua visível/legível após o fechamento).

drop policy auditorias_achados_insert on auditorias_achados;
create policy auditorias_achados_insert on auditorias_achados for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_achados.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total' and not a.relatorio_fechado)
);
drop policy auditorias_achados_update on auditorias_achados;
create policy auditorias_achados_update on auditorias_achados for update using (
  exists (select 1 from auditorias a where a.id = auditorias_achados.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total' and not a.relatorio_fechado)
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_achados.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total' and not a.relatorio_fechado)
);
drop policy auditorias_achados_delete on auditorias_achados;
create policy auditorias_achados_delete on auditorias_achados for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_achados.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total' and not a.relatorio_fechado)
);

drop policy auditorias_relatorio_itens_insert on auditorias_relatorio_itens;
create policy auditorias_relatorio_itens_insert on auditorias_relatorio_itens for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_itens.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
);
drop policy auditorias_relatorio_itens_update on auditorias_relatorio_itens;
create policy auditorias_relatorio_itens_update on auditorias_relatorio_itens for update using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_itens.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_itens.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
);
drop policy auditorias_relatorio_itens_delete on auditorias_relatorio_itens;
create policy auditorias_relatorio_itens_delete on auditorias_relatorio_itens for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_itens.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
);

drop policy auditorias_relatorio_instrumentos_insert on auditorias_relatorio_instrumentos;
create policy auditorias_relatorio_instrumentos_insert on auditorias_relatorio_instrumentos for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_instrumentos.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
);
drop policy auditorias_relatorio_instrumentos_update on auditorias_relatorio_instrumentos;
create policy auditorias_relatorio_instrumentos_update on auditorias_relatorio_instrumentos for update using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_instrumentos.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_instrumentos.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
);
drop policy auditorias_relatorio_instrumentos_delete on auditorias_relatorio_instrumentos;
create policy auditorias_relatorio_instrumentos_delete on auditorias_relatorio_instrumentos for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_instrumentos.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
);

drop policy auditorias_relatorio_procedimentos_insert on auditorias_relatorio_procedimentos;
create policy auditorias_relatorio_procedimentos_insert on auditorias_relatorio_procedimentos for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_procedimentos.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
);
drop policy auditorias_relatorio_procedimentos_update on auditorias_relatorio_procedimentos;
create policy auditorias_relatorio_procedimentos_update on auditorias_relatorio_procedimentos for update using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_procedimentos.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_procedimentos.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
);
drop policy auditorias_relatorio_procedimentos_delete on auditorias_relatorio_procedimentos;
create policy auditorias_relatorio_procedimentos_delete on auditorias_relatorio_procedimentos for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_procedimentos.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
);

drop policy auditorias_relatorio_pessoas_insert on auditorias_relatorio_pessoas;
create policy auditorias_relatorio_pessoas_insert on auditorias_relatorio_pessoas for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_pessoas.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
);
drop policy auditorias_relatorio_pessoas_update on auditorias_relatorio_pessoas;
create policy auditorias_relatorio_pessoas_update on auditorias_relatorio_pessoas for update using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_pessoas.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_pessoas.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
);
drop policy auditorias_relatorio_pessoas_delete on auditorias_relatorio_pessoas;
create policy auditorias_relatorio_pessoas_delete on auditorias_relatorio_pessoas for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_pessoas.auditoria_id
    and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total' and not a.relatorio_fechado)
);
