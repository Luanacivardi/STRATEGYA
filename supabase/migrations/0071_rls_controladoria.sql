-- contas_gerenciais/contas_analises/contas_anexos não tinham a cláusula redundante de orbeex/admin
-- (nivel_edicao_usuario já resolve 'total' pra eles) — mantido assim. Sem submódulo (modulo=
-- 'controladoria', submodulo=null).

drop policy contas_gerenciais_select on contas_gerenciais;
create policy contas_gerenciais_select on contas_gerenciais for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = contas_gerenciais.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
  and nivel_edicao_usuario(empresa_id, 'controladoria') <> 'sem_acesso'
);
drop policy contas_gerenciais_insert on contas_gerenciais;
create policy contas_gerenciais_insert on contas_gerenciais for insert with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and responsavel_analise_id = auth.uid())
);
drop policy contas_gerenciais_update on contas_gerenciais;
create policy contas_gerenciais_update on contas_gerenciais for update using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and responsavel_analise_id = auth.uid())
) with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and responsavel_analise_id = auth.uid())
);
drop policy contas_gerenciais_delete on contas_gerenciais;
create policy contas_gerenciais_delete on contas_gerenciais for delete using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and responsavel_analise_id = auth.uid())
);

drop policy contas_analises_select on contas_analises;
create policy contas_analises_select on contas_analises for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = contas_analises.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
  and nivel_edicao_usuario(empresa_id, 'controladoria') <> 'sem_acesso'
);
drop policy contas_analises_insert on contas_analises;
create policy contas_analises_insert on contas_analises for insert with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_analises.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
);
drop policy contas_analises_update on contas_analises;
create policy contas_analises_update on contas_analises for update using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_analises.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
) with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_analises.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
);
drop policy contas_analises_delete on contas_analises;
create policy contas_analises_delete on contas_analises for delete using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_analises.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
);

drop policy contas_anexos_select on contas_anexos;
create policy contas_anexos_select on contas_anexos for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = contas_anexos.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
  and nivel_edicao_usuario(empresa_id, 'controladoria') <> 'sem_acesso'
);
drop policy contas_anexos_insert on contas_anexos;
create policy contas_anexos_insert on contas_anexos for insert with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_anexos.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
);
drop policy contas_anexos_update on contas_anexos;
create policy contas_anexos_update on contas_anexos for update using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_anexos.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
) with check (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_anexos.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
);
drop policy contas_anexos_delete on contas_anexos;
create policy contas_anexos_delete on contas_anexos for delete using (
  nivel_edicao_usuario(empresa_id, 'controladoria') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'controladoria') = 'proprio' and exists (
    select 1 from contas_gerenciais cg where cg.id = contas_anexos.conta_id and cg.responsavel_analise_id = auth.uid()
  ))
);

-- Storage: bucket contas-anexos
drop policy contas_anexos_storage_select on storage.objects;
create policy contas_anexos_storage_select on storage.objects for select to authenticated using (
  bucket_id = 'contas-anexos'
  and exists (select 1 from usuarios_empresas ue where ue.empresa_id = (split_part(name, '/', 1))::uuid and ue.usuario_id = auth.uid() and ue.ativo)
  and nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'controladoria') <> 'sem_acesso'
);
drop policy contas_anexos_storage_insert on storage.objects;
create policy contas_anexos_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'contas-anexos'
  and (
    nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'controladoria') = 'total'
    or (
      nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'controladoria') = 'proprio'
      and exists (select 1 from contas_gerenciais cg where cg.id = (split_part(name, '/', 2))::uuid and cg.responsavel_analise_id = auth.uid())
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
      and exists (select 1 from contas_gerenciais cg where cg.id = (split_part(name, '/', 2))::uuid and cg.responsavel_analise_id = auth.uid())
    )
  )
);
