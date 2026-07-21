-- Ajustes apontados pelos advisors do Supabase:
-- 1) search_path fixo na função de numeração de documentos (lint function_search_path_mutable).
-- 2) anon não deve executar usuario_no_comite_apuracao (security definer exposto sem login).
-- 3) Índices de cobertura para FKs sem índice (lint unindexed_foreign_keys) — módulos
--    Auditorias, Apurações e Planos de Ação, criados depois da última rodada de índices.

alter function public.gerar_numero_documento() set search_path = 'public';

revoke execute on function public.usuario_no_comite_apuracao(uuid) from anon;
revoke execute on function public.usuario_no_comite_apuracao(uuid) from public;

create index if not exists idx_apuracoes_created_by on apuracoes(created_by);
create index if not exists idx_apuracoes_relator on apuracoes(relator_id);
create index if not exists idx_apuracoes_comite_membros_usuario on apuracoes_comite_membros(usuario_id);
create index if not exists idx_apuracoes_historico_usuario on apuracoes_historico(usuario_id);
create index if not exists idx_apuracoes_participantes_usuario on apuracoes_participantes(usuario_id);
create index if not exists idx_auditores_usuario on auditores(usuario_id);
create index if not exists idx_auditorias_created_by on auditorias(created_by);
create index if not exists idx_auditorias_achados_processo on auditorias_achados(processo_id);
create index if not exists idx_auditorias_achados_registrado_por on auditorias_achados(registrado_por);
create index if not exists idx_auditorias_agenda_auditor_sugerido_2 on auditorias_agenda(auditor_sugerido_2_id);
create index if not exists idx_auditorias_agenda_auditor_sugerido on auditorias_agenda(auditor_sugerido_id);
create index if not exists idx_auditorias_agenda_processo on auditorias_agenda(processo_id);
create index if not exists idx_auditorias_agenda_turno on auditorias_agenda(turno_id);
create index if not exists idx_auditorias_aprovacoes_aprovador on auditorias_aprovacoes(aprovador_id);
create index if not exists idx_auditorias_distribuicao_turno_processo on auditorias_distribuicao_turno(processo_id);
create index if not exists idx_auditorias_distribuicao_turno_turno on auditorias_distribuicao_turno(turno_id);
create index if not exists idx_auditorias_documentos_enviado_por on auditorias_documentos(enviado_por);
create index if not exists idx_auditorias_equipe_auditor on auditorias_equipe(auditor_id);
create index if not exists idx_auditorias_processos_responsavel on auditorias_processos(responsavel_id);
create index if not exists idx_auditorias_processos_selecionados_processo on auditorias_processos_selecionados(processo_id);
create index if not exists idx_auditorias_processos_turnos_turno on auditorias_processos_turnos(turno_id);
create index if not exists idx_auditorias_relatorio_itens_processo on auditorias_relatorio_itens(processo_id);
create index if not exists idx_planos_acao_processo_emissor on planos_acao(processo_emissor_id);
create index if not exists idx_planos_acao_processo_responsavel on planos_acao(processo_responsavel_id);