-- objetivos_estrategicos e indicadores têm responsavel_id: 'proprio' libera escrita só no que é do
-- próprio usuário. indicador_analises (histórico de análises do indicador, sem responsavel_id
-- direto) usa 'proprio' via join checando se o usuário é responsável pelo indicador — e não tem a
-- cláusula orbeex/admin redundante (já não tinha antes), pois nivel_edicao_usuario já resolve
-- 'total' pra eles automaticamente.

drop policy objetivos_select on objetivos_estrategicos;
create policy objetivos_select on objetivos_estrategicos for select using (
  usuario_tem_acesso_empresa(empresa_id)
  and nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') <> 'sem_acesso'
);
drop policy objetivos_insert on objetivos_estrategicos;
create policy objetivos_insert on objetivos_estrategicos for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'proprio' and responsavel_id = auth.uid())
);
drop policy objetivos_update on objetivos_estrategicos;
create policy objetivos_update on objetivos_estrategicos for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'proprio' and responsavel_id = auth.uid())
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'proprio' and responsavel_id = auth.uid())
);
drop policy objetivos_delete on objetivos_estrategicos;
create policy objetivos_delete on objetivos_estrategicos for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'proprio' and responsavel_id = auth.uid())
);

drop policy indicadores_select on indicadores;
create policy indicadores_select on indicadores for select using (
  usuario_tem_acesso_empresa(empresa_id)
  and nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') <> 'sem_acesso'
);
drop policy indicadores_insert on indicadores;
create policy indicadores_insert on indicadores for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and responsavel_id = auth.uid())
);
drop policy indicadores_update on indicadores;
create policy indicadores_update on indicadores for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and responsavel_id = auth.uid())
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and responsavel_id = auth.uid())
);
drop policy indicadores_delete on indicadores;
create policy indicadores_delete on indicadores for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and responsavel_id = auth.uid())
);

drop policy indicador_analises_select on indicador_analises;
create policy indicador_analises_select on indicador_analises for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = indicador_analises.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
  and nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') <> 'sem_acesso'
);
drop policy indicador_analises_insert on indicador_analises;
create policy indicador_analises_insert on indicador_analises for insert with check (
  nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and exists (
    select 1 from indicadores i where i.id = indicador_analises.indicador_id and i.responsavel_id = auth.uid()
  ))
);
drop policy indicador_analises_update on indicador_analises;
create policy indicador_analises_update on indicador_analises for update using (
  nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and exists (
    select 1 from indicadores i where i.id = indicador_analises.indicador_id and i.responsavel_id = auth.uid()
  ))
) with check (
  nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and exists (
    select 1 from indicadores i where i.id = indicador_analises.indicador_id and i.responsavel_id = auth.uid()
  ))
);
drop policy indicador_analises_delete on indicador_analises;
create policy indicador_analises_delete on indicador_analises for delete using (
  nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and exists (
    select 1 from indicadores i where i.id = indicador_analises.indicador_id and i.responsavel_id = auth.uid()
  ))
);
