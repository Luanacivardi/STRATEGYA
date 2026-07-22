-- sipoc/sipoc_entradas/sipoc_saidas: mesmo padrão orbeex/admin OR 'total' das demais tabelas do
-- Contexto, só trocando o literal de nível. Submódulo único para as 3 tabelas: 'contexto-sipoc'.

drop policy sipoc_select on sipoc;
create policy sipoc_select on sipoc for select using (
  usuario_tem_acesso_empresa(empresa_id)
  and nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-sipoc') <> 'sem_acesso'
);
drop policy sipoc_insert on sipoc;
create policy sipoc_insert on sipoc for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-sipoc') = 'total'
);
drop policy sipoc_update on sipoc;
create policy sipoc_update on sipoc for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-sipoc') = 'total'
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-sipoc') = 'total'
);
drop policy sipoc_delete on sipoc;
create policy sipoc_delete on sipoc for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-sipoc') = 'total'
);

drop policy sipoc_entradas_select on sipoc_entradas;
create policy sipoc_entradas_select on sipoc_entradas for select using (
  usuario_tem_acesso_empresa(empresa_id)
  and nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-sipoc') <> 'sem_acesso'
);
drop policy sipoc_entradas_insert on sipoc_entradas;
create policy sipoc_entradas_insert on sipoc_entradas for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-sipoc') = 'total'
);
drop policy sipoc_entradas_update on sipoc_entradas;
create policy sipoc_entradas_update on sipoc_entradas for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-sipoc') = 'total'
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-sipoc') = 'total'
);
drop policy sipoc_entradas_delete on sipoc_entradas;
create policy sipoc_entradas_delete on sipoc_entradas for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-sipoc') = 'total'
);

drop policy sipoc_saidas_select on sipoc_saidas;
create policy sipoc_saidas_select on sipoc_saidas for select using (
  usuario_tem_acesso_empresa(empresa_id)
  and nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-sipoc') <> 'sem_acesso'
);
drop policy sipoc_saidas_insert on sipoc_saidas;
create policy sipoc_saidas_insert on sipoc_saidas for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-sipoc') = 'total'
);
drop policy sipoc_saidas_update on sipoc_saidas;
create policy sipoc_saidas_update on sipoc_saidas for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-sipoc') = 'total'
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-sipoc') = 'total'
);
drop policy sipoc_saidas_delete on sipoc_saidas;
create policy sipoc_saidas_delete on sipoc_saidas for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-sipoc') = 'total'
);
