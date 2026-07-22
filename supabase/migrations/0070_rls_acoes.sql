-- planos_acao (submódulo 'planos') e todo_itens (submódulo 'tarefas') têm responsavel_id -> libera
-- 'proprio'. planos_acao_itens (via join com planos_acao) segue o submódulo 'planos' do pai.

drop policy planos_select on planos_acao;
create policy planos_select on planos_acao for select using (
  usuario_tem_acesso_empresa(empresa_id)
  and nivel_edicao_usuario(empresa_id, 'acoes', 'planos') <> 'sem_acesso'
);
drop policy planos_insert on planos_acao;
create policy planos_insert on planos_acao for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'proprio' and responsavel_id = auth.uid())
);
drop policy planos_update on planos_acao;
create policy planos_update on planos_acao for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'proprio' and responsavel_id = auth.uid())
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'proprio' and responsavel_id = auth.uid())
);
drop policy planos_delete on planos_acao;
create policy planos_delete on planos_acao for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'planos') = 'proprio' and responsavel_id = auth.uid())
);

drop policy planos_itens_select on planos_acao_itens;
create policy planos_itens_select on planos_acao_itens for select using (
  exists (select 1 from planos_acao p where p.id = planos_acao_itens.plano_acao_id
    and usuario_tem_acesso_empresa(p.empresa_id)
    and nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') <> 'sem_acesso')
);
drop policy planos_itens_insert on planos_acao_itens;
create policy planos_itens_insert on planos_acao_itens for insert with check (
  exists (select 1 from planos_acao p where p.id = planos_acao_itens.plano_acao_id and (
    usuario_tem_acesso_empresa(p.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'total'
    or (nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'proprio' and planos_acao_itens.responsavel_id = auth.uid())
  ))
);
drop policy planos_itens_update on planos_acao_itens;
create policy planos_itens_update on planos_acao_itens for update using (
  exists (select 1 from planos_acao p where p.id = planos_acao_itens.plano_acao_id and (
    usuario_tem_acesso_empresa(p.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'total'
    or (nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'proprio' and planos_acao_itens.responsavel_id = auth.uid())
  ))
) with check (
  exists (select 1 from planos_acao p where p.id = planos_acao_itens.plano_acao_id and (
    usuario_tem_acesso_empresa(p.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'total'
    or (nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'proprio' and planos_acao_itens.responsavel_id = auth.uid())
  ))
);
drop policy planos_itens_delete on planos_acao_itens;
create policy planos_itens_delete on planos_acao_itens for delete using (
  exists (select 1 from planos_acao p where p.id = planos_acao_itens.plano_acao_id and (
    usuario_tem_acesso_empresa(p.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'total'
    or (nivel_edicao_usuario(p.empresa_id, 'acoes', 'planos') = 'proprio' and planos_acao_itens.responsavel_id = auth.uid())
  ))
);

drop policy todo_itens_select on todo_itens;
create policy todo_itens_select on todo_itens for select using (
  usuario_tem_acesso_empresa(empresa_id)
  and nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') <> 'sem_acesso'
);
drop policy todo_itens_insert on todo_itens;
create policy todo_itens_insert on todo_itens for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'proprio' and responsavel_id = auth.uid())
);
drop policy todo_itens_update on todo_itens;
create policy todo_itens_update on todo_itens for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'proprio' and responsavel_id = auth.uid())
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'proprio' and responsavel_id = auth.uid())
);
drop policy todo_itens_delete on todo_itens;
create policy todo_itens_delete on todo_itens for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'acoes', 'tarefas') = 'proprio' and responsavel_id = auth.uid())
);
