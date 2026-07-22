-- Fase 3 do redesign de permissões: migra as políticas de contexto_organizacional, partes_interessadas,
-- macrofluxo_processos e riscos_oportunidades para a nova nivel_edicao_usuario(empresa,modulo,submodulo).
-- Mesma lógica de antes (orbeex/admin OR nível 'total' — nenhuma dessas 4 tabelas tem campo
-- responsável, então 'proprio' não libera escrita nelas), só trocando o literal de nível global pelo
-- de módulo/submódulo. SELECT ganha o `<> 'sem_acesso'`, que é o mecanismo que de fato esconde o PE
-- de quem não deve vê-lo (ex: papel 'usuario', por padrão) — sem isso, esconder só no menu não
-- impede leitura direta via API.

drop policy contexto_select on contexto_organizacional;
create policy contexto_select on contexto_organizacional for select using (
  usuario_tem_acesso_empresa(empresa_id)
  and nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-cenario') <> 'sem_acesso'
);
drop policy contexto_insert on contexto_organizacional;
create policy contexto_insert on contexto_organizacional for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-cenario') = 'total'
);
drop policy contexto_update on contexto_organizacional;
create policy contexto_update on contexto_organizacional for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-cenario') = 'total'
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-cenario') = 'total'
);
drop policy contexto_delete on contexto_organizacional;
create policy contexto_delete on contexto_organizacional for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-cenario') = 'total'
);

drop policy partes_select on partes_interessadas;
create policy partes_select on partes_interessadas for select using (
  usuario_tem_acesso_empresa(empresa_id)
  and nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-partes') <> 'sem_acesso'
);
drop policy partes_insert on partes_interessadas;
create policy partes_insert on partes_interessadas for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-partes') = 'total'
);
drop policy partes_update on partes_interessadas;
create policy partes_update on partes_interessadas for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-partes') = 'total'
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-partes') = 'total'
);
drop policy partes_delete on partes_interessadas;
create policy partes_delete on partes_interessadas for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-partes') = 'total'
);

drop policy macrofluxo_select on macrofluxo_processos;
create policy macrofluxo_select on macrofluxo_processos for select using (
  usuario_tem_acesso_empresa(empresa_id)
  and nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-macrofluxo') <> 'sem_acesso'
);
drop policy macrofluxo_insert on macrofluxo_processos;
create policy macrofluxo_insert on macrofluxo_processos for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-macrofluxo') = 'total'
);
drop policy macrofluxo_update on macrofluxo_processos;
create policy macrofluxo_update on macrofluxo_processos for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-macrofluxo') = 'total'
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-macrofluxo') = 'total'
);
drop policy macrofluxo_delete on macrofluxo_processos;
create policy macrofluxo_delete on macrofluxo_processos for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-macrofluxo') = 'total'
);

drop policy riscos_select on riscos_oportunidades;
create policy riscos_select on riscos_oportunidades for select using (
  usuario_tem_acesso_empresa(empresa_id)
  and nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'riscos') <> 'sem_acesso'
);
drop policy riscos_insert on riscos_oportunidades;
create policy riscos_insert on riscos_oportunidades for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'riscos') = 'total'
);
drop policy riscos_update on riscos_oportunidades;
create policy riscos_update on riscos_oportunidades for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'riscos') = 'total'
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'riscos') = 'total'
);
drop policy riscos_delete on riscos_oportunidades;
create policy riscos_delete on riscos_oportunidades for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'riscos') = 'total'
);
