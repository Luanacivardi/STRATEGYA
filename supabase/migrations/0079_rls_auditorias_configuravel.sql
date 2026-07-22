-- Auditorias passa a respeitar nivel_edicao_usuario(empresa,'auditorias',submodulo) como os demais
-- módulos, em vez de escrita fixa só ORBEEX/Administrador. Nenhuma dessas tabelas tem um campo
-- "responsável" único por linha (o mais próximo é auditorias_equipe, que liga vários auditores a
-- uma auditoria com papéis distintos — não um dono único), então não há nível 'proprio' aqui, só
-- Visualização/Edição Total, no mesmo padrão já usado em Contexto/Riscos/Atas.
--
-- Cada tabela ganha política de select/insert/update/delete separadas (antes era um "for all" só,
-- que sobrepunha a política de select dedicada — a causa do advisor "multiple_permissive_policies"
-- nestas tabelas).

-- ===== submódulo 'auditorias' (registro principal + tabelas filhas por auditoria_id) =====
drop policy auditorias_select on auditorias;
create policy auditorias_select on auditorias for select using (
  usuario_tem_acesso_empresa(empresa_id) and nivel_edicao_usuario(empresa_id, 'auditorias', 'auditorias') <> 'sem_acesso'
);
drop policy auditorias_write on auditorias;
create policy auditorias_insert on auditorias for insert with check (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'auditorias') = 'total'
);
create policy auditorias_update on auditorias for update using (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'auditorias') = 'total'
) with check (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'auditorias') = 'total'
);
create policy auditorias_delete on auditorias for delete using (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'auditorias') = 'total'
);

drop policy auditorias_achados_select on auditorias_achados;
create policy auditorias_achados_select on auditorias_achados for select using (
  exists (select 1 from auditorias a where a.id = auditorias_achados.auditoria_id
    and usuario_tem_acesso_empresa(a.empresa_id) and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') <> 'sem_acesso')
);
drop policy auditorias_achados_write on auditorias_achados;
create policy auditorias_achados_insert on auditorias_achados for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_achados.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);
create policy auditorias_achados_update on auditorias_achados for update using (
  exists (select 1 from auditorias a where a.id = auditorias_achados.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_achados.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);
create policy auditorias_achados_delete on auditorias_achados for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_achados.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);

drop policy auditorias_agenda_select on auditorias_agenda;
create policy auditorias_agenda_select on auditorias_agenda for select using (
  exists (select 1 from auditorias a where a.id = auditorias_agenda.auditoria_id
    and usuario_tem_acesso_empresa(a.empresa_id) and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') <> 'sem_acesso')
);
drop policy auditorias_agenda_write on auditorias_agenda;
create policy auditorias_agenda_insert on auditorias_agenda for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_agenda.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);
create policy auditorias_agenda_update on auditorias_agenda for update using (
  exists (select 1 from auditorias a where a.id = auditorias_agenda.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_agenda.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);
create policy auditorias_agenda_delete on auditorias_agenda for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_agenda.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);

drop policy auditorias_aprovacoes_select on auditorias_aprovacoes;
create policy auditorias_aprovacoes_select on auditorias_aprovacoes for select using (
  exists (select 1 from auditorias a where a.id = auditorias_aprovacoes.auditoria_id
    and usuario_tem_acesso_empresa(a.empresa_id) and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') <> 'sem_acesso')
);
drop policy auditorias_aprovacoes_write on auditorias_aprovacoes;
create policy auditorias_aprovacoes_insert on auditorias_aprovacoes for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_aprovacoes.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);
create policy auditorias_aprovacoes_update on auditorias_aprovacoes for update using (
  exists (select 1 from auditorias a where a.id = auditorias_aprovacoes.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_aprovacoes.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);
create policy auditorias_aprovacoes_delete on auditorias_aprovacoes for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_aprovacoes.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);

drop policy auditorias_dist_turno_select on auditorias_distribuicao_turno;
create policy auditorias_dist_turno_select on auditorias_distribuicao_turno for select using (
  exists (select 1 from auditorias a where a.id = auditorias_distribuicao_turno.auditoria_id
    and usuario_tem_acesso_empresa(a.empresa_id) and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') <> 'sem_acesso')
);
drop policy auditorias_dist_turno_write on auditorias_distribuicao_turno;
create policy auditorias_dist_turno_insert on auditorias_distribuicao_turno for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_distribuicao_turno.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);
create policy auditorias_dist_turno_update on auditorias_distribuicao_turno for update using (
  exists (select 1 from auditorias a where a.id = auditorias_distribuicao_turno.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_distribuicao_turno.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);
create policy auditorias_dist_turno_delete on auditorias_distribuicao_turno for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_distribuicao_turno.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);

drop policy auditorias_documentos_select on auditorias_documentos;
create policy auditorias_documentos_select on auditorias_documentos for select using (
  exists (select 1 from auditorias a where a.id = auditorias_documentos.auditoria_id
    and usuario_tem_acesso_empresa(a.empresa_id) and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') <> 'sem_acesso')
);
drop policy auditorias_documentos_write on auditorias_documentos;
create policy auditorias_documentos_insert on auditorias_documentos for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_documentos.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);
create policy auditorias_documentos_update on auditorias_documentos for update using (
  exists (select 1 from auditorias a where a.id = auditorias_documentos.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_documentos.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);
create policy auditorias_documentos_delete on auditorias_documentos for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_documentos.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);

drop policy auditorias_equipe_select on auditorias_equipe;
create policy auditorias_equipe_select on auditorias_equipe for select using (
  exists (select 1 from auditorias a where a.id = auditorias_equipe.auditoria_id
    and usuario_tem_acesso_empresa(a.empresa_id) and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') <> 'sem_acesso')
);
drop policy auditorias_equipe_write on auditorias_equipe;
create policy auditorias_equipe_insert on auditorias_equipe for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_equipe.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);
create policy auditorias_equipe_update on auditorias_equipe for update using (
  exists (select 1 from auditorias a where a.id = auditorias_equipe.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_equipe.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);
create policy auditorias_equipe_delete on auditorias_equipe for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_equipe.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);

drop policy auditorias_proc_sel_select on auditorias_processos_selecionados;
create policy auditorias_proc_sel_select on auditorias_processos_selecionados for select using (
  exists (select 1 from auditorias a where a.id = auditorias_processos_selecionados.auditoria_id
    and usuario_tem_acesso_empresa(a.empresa_id) and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') <> 'sem_acesso')
);
drop policy auditorias_proc_sel_write on auditorias_processos_selecionados;
create policy auditorias_proc_sel_insert on auditorias_processos_selecionados for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_processos_selecionados.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);
create policy auditorias_proc_sel_update on auditorias_processos_selecionados for update using (
  exists (select 1 from auditorias a where a.id = auditorias_processos_selecionados.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_processos_selecionados.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);
create policy auditorias_proc_sel_delete on auditorias_processos_selecionados for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_processos_selecionados.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditorias') = 'total')
);

-- ===== submódulo 'processos' =====
drop policy auditorias_processos_select on auditorias_processos;
create policy auditorias_processos_select on auditorias_processos for select using (
  usuario_tem_acesso_empresa(empresa_id) and nivel_edicao_usuario(empresa_id, 'auditorias', 'processos') <> 'sem_acesso'
);
drop policy auditorias_processos_write on auditorias_processos;
create policy auditorias_processos_insert on auditorias_processos for insert with check (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'processos') = 'total'
);
create policy auditorias_processos_update on auditorias_processos for update using (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'processos') = 'total'
) with check (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'processos') = 'total'
);
create policy auditorias_processos_delete on auditorias_processos for delete using (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'processos') = 'total'
);

drop policy auditorias_processos_turnos_select on auditorias_processos_turnos;
create policy auditorias_processos_turnos_select on auditorias_processos_turnos for select using (
  exists (select 1 from auditorias_processos p where p.id = auditorias_processos_turnos.processo_id
    and usuario_tem_acesso_empresa(p.empresa_id) and nivel_edicao_usuario(p.empresa_id, 'auditorias', 'processos') <> 'sem_acesso')
);
drop policy auditorias_processos_turnos_write on auditorias_processos_turnos;
create policy auditorias_processos_turnos_insert on auditorias_processos_turnos for insert with check (
  exists (select 1 from auditorias_processos p where p.id = auditorias_processos_turnos.processo_id and nivel_edicao_usuario(p.empresa_id, 'auditorias', 'processos') = 'total')
);
create policy auditorias_processos_turnos_update on auditorias_processos_turnos for update using (
  exists (select 1 from auditorias_processos p where p.id = auditorias_processos_turnos.processo_id and nivel_edicao_usuario(p.empresa_id, 'auditorias', 'processos') = 'total')
) with check (
  exists (select 1 from auditorias_processos p where p.id = auditorias_processos_turnos.processo_id and nivel_edicao_usuario(p.empresa_id, 'auditorias', 'processos') = 'total')
);
create policy auditorias_processos_turnos_delete on auditorias_processos_turnos for delete using (
  exists (select 1 from auditorias_processos p where p.id = auditorias_processos_turnos.processo_id and nivel_edicao_usuario(p.empresa_id, 'auditorias', 'processos') = 'total')
);

-- ===== submódulo 'turnos' =====
drop policy auditorias_turnos_select on auditorias_turnos;
create policy auditorias_turnos_select on auditorias_turnos for select using (
  usuario_tem_acesso_empresa(empresa_id) and nivel_edicao_usuario(empresa_id, 'auditorias', 'turnos') <> 'sem_acesso'
);
drop policy auditorias_turnos_write on auditorias_turnos;
create policy auditorias_turnos_insert on auditorias_turnos for insert with check (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'turnos') = 'total'
);
create policy auditorias_turnos_update on auditorias_turnos for update using (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'turnos') = 'total'
) with check (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'turnos') = 'total'
);
create policy auditorias_turnos_delete on auditorias_turnos for delete using (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'turnos') = 'total'
);

-- ===== submódulo 'auditores' =====
drop policy auditores_select on auditores;
create policy auditores_select on auditores for select using (
  usuario_tem_acesso_empresa(empresa_id) and nivel_edicao_usuario(empresa_id, 'auditorias', 'auditores') <> 'sem_acesso'
);
drop policy auditores_write on auditores;
create policy auditores_insert on auditores for insert with check (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'auditores') = 'total'
);
create policy auditores_update on auditores for update using (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'auditores') = 'total'
) with check (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'auditores') = 'total'
);
create policy auditores_delete on auditores for delete using (
  nivel_edicao_usuario(empresa_id, 'auditorias', 'auditores') = 'total'
);

drop policy auditores_certificacoes_select on auditores_certificacoes;
create policy auditores_certificacoes_select on auditores_certificacoes for select using (
  exists (select 1 from auditores a where a.id = auditores_certificacoes.auditor_id
    and usuario_tem_acesso_empresa(a.empresa_id) and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditores') <> 'sem_acesso')
);
drop policy auditores_certificacoes_write on auditores_certificacoes;
create policy auditores_certificacoes_insert on auditores_certificacoes for insert with check (
  exists (select 1 from auditores a where a.id = auditores_certificacoes.auditor_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditores') = 'total')
);
create policy auditores_certificacoes_update on auditores_certificacoes for update using (
  exists (select 1 from auditores a where a.id = auditores_certificacoes.auditor_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditores') = 'total')
) with check (
  exists (select 1 from auditores a where a.id = auditores_certificacoes.auditor_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditores') = 'total')
);
create policy auditores_certificacoes_delete on auditores_certificacoes for delete using (
  exists (select 1 from auditores a where a.id = auditores_certificacoes.auditor_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditores') = 'total')
);

drop policy auditores_competencias_select on auditores_competencias;
create policy auditores_competencias_select on auditores_competencias for select using (
  exists (select 1 from auditores a where a.id = auditores_competencias.auditor_id
    and usuario_tem_acesso_empresa(a.empresa_id) and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditores') <> 'sem_acesso')
);
drop policy auditores_competencias_write on auditores_competencias;
create policy auditores_competencias_insert on auditores_competencias for insert with check (
  exists (select 1 from auditores a where a.id = auditores_competencias.auditor_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditores') = 'total')
);
create policy auditores_competencias_update on auditores_competencias for update using (
  exists (select 1 from auditores a where a.id = auditores_competencias.auditor_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditores') = 'total')
) with check (
  exists (select 1 from auditores a where a.id = auditores_competencias.auditor_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditores') = 'total')
);
create policy auditores_competencias_delete on auditores_competencias for delete using (
  exists (select 1 from auditores a where a.id = auditores_competencias.auditor_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'auditores') = 'total')
);

-- ===== submódulo 'relatorios' =====
drop policy auditorias_relatorio_instrumentos_select on auditorias_relatorio_instrumentos;
create policy auditorias_relatorio_instrumentos_select on auditorias_relatorio_instrumentos for select using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_instrumentos.auditoria_id
    and usuario_tem_acesso_empresa(a.empresa_id) and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') <> 'sem_acesso')
);
drop policy auditorias_relatorio_instrumentos_write on auditorias_relatorio_instrumentos;
create policy auditorias_relatorio_instrumentos_insert on auditorias_relatorio_instrumentos for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_instrumentos.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
);
create policy auditorias_relatorio_instrumentos_update on auditorias_relatorio_instrumentos for update using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_instrumentos.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_instrumentos.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
);
create policy auditorias_relatorio_instrumentos_delete on auditorias_relatorio_instrumentos for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_instrumentos.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
);

drop policy auditorias_relatorio_itens_select on auditorias_relatorio_itens;
create policy auditorias_relatorio_itens_select on auditorias_relatorio_itens for select using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_itens.auditoria_id
    and usuario_tem_acesso_empresa(a.empresa_id) and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') <> 'sem_acesso')
);
drop policy auditorias_relatorio_itens_write on auditorias_relatorio_itens;
create policy auditorias_relatorio_itens_insert on auditorias_relatorio_itens for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_itens.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
);
create policy auditorias_relatorio_itens_update on auditorias_relatorio_itens for update using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_itens.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_itens.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
);
create policy auditorias_relatorio_itens_delete on auditorias_relatorio_itens for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_itens.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
);

drop policy auditorias_relatorio_pessoas_select on auditorias_relatorio_pessoas;
create policy auditorias_relatorio_pessoas_select on auditorias_relatorio_pessoas for select using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_pessoas.auditoria_id
    and usuario_tem_acesso_empresa(a.empresa_id) and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') <> 'sem_acesso')
);
drop policy auditorias_relatorio_pessoas_write on auditorias_relatorio_pessoas;
create policy auditorias_relatorio_pessoas_insert on auditorias_relatorio_pessoas for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_pessoas.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
);
create policy auditorias_relatorio_pessoas_update on auditorias_relatorio_pessoas for update using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_pessoas.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_pessoas.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
);
create policy auditorias_relatorio_pessoas_delete on auditorias_relatorio_pessoas for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_pessoas.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
);

drop policy auditorias_relatorio_procedimentos_select on auditorias_relatorio_procedimentos;
create policy auditorias_relatorio_procedimentos_select on auditorias_relatorio_procedimentos for select using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_procedimentos.auditoria_id
    and usuario_tem_acesso_empresa(a.empresa_id) and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') <> 'sem_acesso')
);
drop policy auditorias_relatorio_procedimentos_write on auditorias_relatorio_procedimentos;
create policy auditorias_relatorio_procedimentos_insert on auditorias_relatorio_procedimentos for insert with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_procedimentos.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
);
create policy auditorias_relatorio_procedimentos_update on auditorias_relatorio_procedimentos for update using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_procedimentos.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
) with check (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_procedimentos.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
);
create policy auditorias_relatorio_procedimentos_delete on auditorias_relatorio_procedimentos for delete using (
  exists (select 1 from auditorias a where a.id = auditorias_relatorio_procedimentos.auditoria_id and nivel_edicao_usuario(a.empresa_id, 'auditorias', 'relatorios') = 'total')
);
