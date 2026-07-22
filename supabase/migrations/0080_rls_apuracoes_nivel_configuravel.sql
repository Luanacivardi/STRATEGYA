-- Apurações continua com o comitê como porta de entrada obrigatória (a função
-- nivel_edicao_usuario já reforça isso para o módulo 'apuracoes' — ver migração 0078), mas o nível
-- dentro do comitê (Visualização ou Edição Total) agora é configurável, em vez de todo membro ativo
-- ganhar edição total automática. Gerenciar o comitê em si (nomear/remover membros) continua restrito
-- a ORBEEX/Administrador — é uma permissão separada de "editar apurações".

drop policy apuracoes_select on apuracoes;
create policy apuracoes_select on apuracoes for select using (
  nivel_edicao_usuario(empresa_id, 'apuracoes') <> 'sem_acesso'
);
drop policy apuracoes_write on apuracoes;
create policy apuracoes_insert on apuracoes for insert with check (
  nivel_edicao_usuario(empresa_id, 'apuracoes') = 'total'
);
create policy apuracoes_update on apuracoes for update using (
  nivel_edicao_usuario(empresa_id, 'apuracoes') = 'total'
) with check (
  nivel_edicao_usuario(empresa_id, 'apuracoes') = 'total'
);
create policy apuracoes_delete on apuracoes for delete using (
  nivel_edicao_usuario(empresa_id, 'apuracoes') = 'total'
);

drop policy apuracoes_comite_select on apuracoes_comite_membros;
create policy apuracoes_comite_select on apuracoes_comite_membros for select using (
  nivel_edicao_usuario(empresa_id, 'apuracoes') <> 'sem_acesso'
);
-- apuracoes_comite_write (gerenciar quem está no comitê) permanece só ORBEEX/Administrador, sem mudança.

drop policy apuracoes_historico_select on apuracoes_historico;
create policy apuracoes_historico_select on apuracoes_historico for select using (
  exists (select 1 from apuracoes a where a.id = apuracoes_historico.apuracao_id and nivel_edicao_usuario(a.empresa_id, 'apuracoes') <> 'sem_acesso')
);
drop policy apuracoes_historico_write on apuracoes_historico;
create policy apuracoes_historico_insert on apuracoes_historico for insert with check (
  exists (select 1 from apuracoes a where a.id = apuracoes_historico.apuracao_id and nivel_edicao_usuario(a.empresa_id, 'apuracoes') = 'total')
);
create policy apuracoes_historico_update on apuracoes_historico for update using (
  exists (select 1 from apuracoes a where a.id = apuracoes_historico.apuracao_id and nivel_edicao_usuario(a.empresa_id, 'apuracoes') = 'total')
) with check (
  exists (select 1 from apuracoes a where a.id = apuracoes_historico.apuracao_id and nivel_edicao_usuario(a.empresa_id, 'apuracoes') = 'total')
);
create policy apuracoes_historico_delete on apuracoes_historico for delete using (
  exists (select 1 from apuracoes a where a.id = apuracoes_historico.apuracao_id and nivel_edicao_usuario(a.empresa_id, 'apuracoes') = 'total')
);

drop policy apuracoes_participantes_select on apuracoes_participantes;
create policy apuracoes_participantes_select on apuracoes_participantes for select using (
  exists (select 1 from apuracoes a where a.id = apuracoes_participantes.apuracao_id and nivel_edicao_usuario(a.empresa_id, 'apuracoes') <> 'sem_acesso')
);
drop policy apuracoes_participantes_write on apuracoes_participantes;
create policy apuracoes_participantes_insert on apuracoes_participantes for insert with check (
  exists (select 1 from apuracoes a where a.id = apuracoes_participantes.apuracao_id and nivel_edicao_usuario(a.empresa_id, 'apuracoes') = 'total')
);
create policy apuracoes_participantes_update on apuracoes_participantes for update using (
  exists (select 1 from apuracoes a where a.id = apuracoes_participantes.apuracao_id and nivel_edicao_usuario(a.empresa_id, 'apuracoes') = 'total')
) with check (
  exists (select 1 from apuracoes a where a.id = apuracoes_participantes.apuracao_id and nivel_edicao_usuario(a.empresa_id, 'apuracoes') = 'total')
);
create policy apuracoes_participantes_delete on apuracoes_participantes for delete using (
  exists (select 1 from apuracoes a where a.id = apuracoes_participantes.apuracao_id and nivel_edicao_usuario(a.empresa_id, 'apuracoes') = 'total')
);
