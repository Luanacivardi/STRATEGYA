-- Corrige uma regressão de performance introduzida pelas migrações 0068-0071 (redesign de
-- permissões): as políticas novas chamam auth.uid() bruto em vez de (select auth.uid()), o que
-- impede o Postgres de cachear o valor via initplan e faz a função ser reavaliada linha a linha
-- (mesmo padrão que este projeto já havia corrigido antes em outras tabelas, ver migração remota
-- "fix_remaining_auth_uid_initplan"/"corrige_auth_uid_initplan_nas_novas_policies"). Sem mudança de
-- comportamento — só reescreve as mesmas condições com auth.uid() envolvido em (select ...).

drop policy objetivos_insert on objetivos_estrategicos;
create policy objetivos_insert on objetivos_estrategicos for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'proprio' and responsavel_id = (select auth.uid()))
);
drop policy objetivos_update on objetivos_estrategicos;
create policy objetivos_update on objetivos_estrategicos for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'proprio' and responsavel_id = (select auth.uid()))
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'proprio' and responsavel_id = (select auth.uid()))
);
drop policy objetivos_delete on objetivos_estrategicos;
create policy objetivos_delete on objetivos_estrategicos for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'objetivos') = 'proprio' and responsavel_id = (select auth.uid()))
);

drop policy indicadores_insert on indicadores;
create policy indicadores_insert on indicadores for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and responsavel_id = (select auth.uid()))
);
drop policy indicadores_update on indicadores;
create policy indicadores_update on indicadores for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and responsavel_id = (select auth.uid()))
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and responsavel_id = (select auth.uid()))
);
drop policy indicadores_delete on indicadores;
create policy indicadores_delete on indicadores for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and responsavel_id = (select auth.uid()))
);

drop policy indicador_analises_select on indicador_analises;
create policy indicador_analises_select on indicador_analises for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = indicador_analises.empresa_id and ue.usuario_id = (select auth.uid()) and ue.ativo)
  and nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') <> 'sem_acesso'
);
drop policy indicador_analises_insert on indicador_analises;
create policy indicador_analises_insert on indicador_analises for insert with check (
  nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and exists (
    select 1 from indicadores i where i.id = indicador_analises.indicador_id and i.responsavel_id = (select auth.uid())
  ))
);
drop policy indicador_analises_update on indicador_analises;
create policy indicador_analises_update on indicador_analises for update using (
  nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and exists (
    select 1 from indicadores i where i.id = indicador_analises.indicador_id and i.responsavel_id = (select auth.uid())
  ))
) with check (
  nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and exists (
    select 1 from indicadores i where i.id = indicador_analises.indicador_id and i.responsavel_id = (select auth.uid())
  ))
);
drop policy indicador_analises_delete on indicador_analises;
create policy indicador_analises_delete on indicador_analises for delete using (
  nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'indicadores') = 'proprio' and exists (
    select 1 from indicadores i where i.id = indicador_analises.indicador_id and i.responsavel_id = (select auth.uid())
  ))
);

drop policy rac_acoes_insert on rac_acoes;
create policy rac_acoes_insert on rac_acoes for insert with check (
  exists (select 1 from reunioes_analise_critica r where r.id = rac_acoes.reuniao_id and (
    usuario_tem_acesso_empresa(r.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'total'
    or (nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'proprio' and rac_acoes.responsavel_id = (select auth.uid()))
  ))
);
drop policy rac_acoes_update on rac_acoes;
create policy rac_acoes_update on rac_acoes for update using (
  exists (select 1 from reunioes_analise_critica r where r.id = rac_acoes.reuniao_id and (
    usuario_tem_acesso_empresa(r.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'total'
    or (nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'proprio' and rac_acoes.responsavel_id = (select auth.uid()))
  ))
) with check (
  exists (select 1 from reunioes_analise_critica r where r.id = rac_acoes.reuniao_id and (
    usuario_tem_acesso_empresa(r.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'total'
    or (nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'proprio' and rac_acoes.responsavel_id = (select auth.uid()))
  ))
);
drop policy rac_acoes_delete on rac_acoes;
create policy rac_acoes_delete on rac_acoes for delete using (
  exists (select 1 from reunioes_analise_critica r where r.id = rac_acoes.reuniao_id and (
    usuario_tem_acesso_empresa(r.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'total'
    or (nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'proprio' and rac_acoes.responsavel_id = (select auth.uid()))
  ))
);

drop policy planos_insert on planos_acao;
create policy planos_insert on planos_acao for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'proprio' and responsavel_id = (select auth.uid()))
);
drop policy planos_update on planos_acao;
create policy planos_update on planos_acao for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'proprio' and responsavel_id = (select auth.uid()))
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'proprio' and responsavel_id = (select auth.uid()))
);
drop policy planos_delete on planos_acao;
create policy planos_delete on planos_acao for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'proprio' and responsavel_id = (select auth.uid()))
);

drop policy planos_itens_insert on planos_acao_itens;
create policy planos_itens_insert on planos_acao_itens for insert with check (
  exists (select 1 from planos_acao p where p.id = planos_acao_itens.plano_acao_id and (
    usuario_tem_acesso_empresa(p.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'total'
    or (nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'proprio' and planos_acao_itens.responsavel_id = (select auth.uid()))
  ))
);
drop policy planos_itens_update on planos_acao_itens;
create policy planos_itens_update on planos_acao_itens for update using (
  exists (select 1 from planos_acao p where p.id = planos_acao_itens.plano_acao_id and (
    usuario_tem_acesso_empresa(p.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'total'
    or (nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'proprio' and planos_acao_itens.responsavel_id = (select auth.uid()))
  ))
) with check (
  exists (select 1 from planos_acao p where p.id = planos_acao_itens.plano_acao_id and (
    usuario_tem_acesso_empresa(p.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'total'
    or (nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'proprio' and planos_acao_itens.responsavel_id = (select auth.uid()))
  ))
);
drop policy planos_itens_delete on planos_acao_itens;
create policy planos_itens_delete on planos_acao_itens for delete using (
  exists (select 1 from planos_acao p where p.id = planos_acao_itens.plano_acao_id and (
    usuario_tem_acesso_empresa(p.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'total'
    or (nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'proprio' and planos_acao_itens.responsavel_id = (select auth.uid()))
  ))
);

drop policy todo_itens_insert on todo_itens;
create policy todo_itens_insert on todo_itens for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'proprio' and responsavel_id = (select auth.uid()))
);
drop policy todo_itens_update on todo_itens;
create policy todo_itens_update on todo_itens for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'proprio' and responsavel_id = (select auth.uid()))
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'proprio' and responsavel_id = (select auth.uid()))
);
drop policy todo_itens_delete on todo_itens;
create policy todo_itens_delete on todo_itens for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'proprio' and responsavel_id = (select auth.uid()))
);

drop policy contas_gerenciais_select on contas_gerenciais;
create policy contas_gerenciais_select on contas_gerenciais for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = contas_gerenciais.empresa_id and ue.usuario_id = (select auth.uid()) and ue.ativo)
  and nivel_edicao_usuario(empresa_id, 'controladoria') <> 'sem_acesso'
);
drop policy contas_gerenciais_insert on contas_gerenciais;
create policy contas_gerenciais_insert on contas_gerenciais for insert with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and responsavel_analise_id = (select auth.uid()))
);
drop policy contas_gerenciais_update on contas_gerenciais;
create policy contas_gerenciais_update on contas_gerenciais for update using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and responsavel_analise_id = (select auth.uid()))
) with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and responsavel_analise_id = (select auth.uid()))
);
drop policy contas_gerenciais_delete on contas_gerenciais;
create policy contas_gerenciais_delete on contas_gerenciais for delete using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and responsavel_analise_id = (select auth.uid()))
);

drop policy contas_analises_select on contas_analises;
create policy contas_analises_select on contas_analises for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = contas_analises.empresa_id and ue.usuario_id = (select auth.uid()) and ue.ativo)
  and nivel_edicao_usuario(empresa_id, 'controladoria') <> 'sem_acesso'
);
drop policy contas_analises_insert on contas_analises;
create policy contas_analises_insert on contas_analises for insert with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_analises.conta_id and cg.responsavel_analise_id = (select auth.uid())
  ))
);
drop policy contas_analises_update on contas_analises;
create policy contas_analises_update on contas_analises for update using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_analises.conta_id and cg.responsavel_analise_id = (select auth.uid())
  ))
) with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_analises.conta_id and cg.responsavel_analise_id = (select auth.uid())
  ))
);
drop policy contas_analises_delete on contas_analises;
create policy contas_analises_delete on contas_analises for delete using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_analises.conta_id and cg.responsavel_analise_id = (select auth.uid())
  ))
);

drop policy contas_anexos_select on contas_anexos;
create policy contas_anexos_select on contas_anexos for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = contas_anexos.empresa_id and ue.usuario_id = (select auth.uid()) and ue.ativo)
  and nivel_edicao_usuario(empresa_id, 'controladoria') <> 'sem_acesso'
);
drop policy contas_anexos_insert on contas_anexos;
create policy contas_anexos_insert on contas_anexos for insert with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_anexos.conta_id and cg.responsavel_analise_id = (select auth.uid())
  ))
);
drop policy contas_anexos_update on contas_anexos;
create policy contas_anexos_update on contas_anexos for update using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_anexos.conta_id and cg.responsavel_analise_id = (select auth.uid())
  ))
) with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_anexos.conta_id and cg.responsavel_analise_id = (select auth.uid())
  ))
);
drop policy contas_anexos_delete on contas_anexos;
create policy contas_anexos_delete on contas_anexos for delete using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_anexos.conta_id and cg.responsavel_analise_id = (select auth.uid())
  ))
);

drop policy contas_anexos_storage_select on storage.objects;
create policy contas_anexos_storage_select on storage.objects for select to authenticated using (
  bucket_id = 'contas-anexos'
  and exists (select 1 from usuarios_empresas ue where ue.empresa_id = (split_part(name, '/', 1))::uuid and ue.usuario_id = (select auth.uid()) and ue.ativo)
  and nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'controladoria') <> 'sem_acesso'
);
drop policy contas_anexos_storage_insert on storage.objects;
create policy contas_anexos_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'contas-anexos'
  and (
    nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'controladoria') = 'total'
    or (
      nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'controladoria') = 'proprio'
      and exists (select 1 from contas_gerenciais cg where cg.id = (split_part(name, '/', 2))::uuid and cg.responsavel_analise_id = (select auth.uid()))
    )
  )
);
drop policy contas_anexos_storage_delete on storage.objects;
create policy contas_anexos_storage_delete on storage.objects for delete to authenticated using (
  bucket_id = 'contas-anexos'
  and (
    nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'controladoria') = 'total'
    or (
      nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'controladoria') = 'proprio'
      and exists (select 1 from contas_gerenciais cg where cg.id = (split_part(name, '/', 2))::uuid and cg.responsavel_analise_id = (select auth.uid()))
    )
  )
);
