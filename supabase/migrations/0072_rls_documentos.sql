-- Documentos: modulo='documentos', sem submódulo. ATENÇÃO — diferente dos demais módulos, aqui o
-- nível 'aprovacao' NÃO entra no `= 'total'` da escrita: o módulo já tem um mecanismo real de
-- aprovação (aprovador_solicitado_id + RPCs aprovar_documento/devolver_documento_para_elaboracao,
-- security definer, migrações 0061/0062) que dá ao aprovador designado uma janela específica de
-- ação. Se 'aprovacao' liberasse a RLS genérica de escrita, um "aprovador" ganharia permissão
-- irrestrita de editar/excluir qualquer documento da empresa, não só aprovar os que lhe foram
-- designados — quebraria a segregação de função que a 0061 protege. 'aprovacao' aqui serve só como
-- sinalização de elegibilidade para ser escolhido como aprovador (uso futuro na UI), não como nível
-- de RLS.

drop policy documentos_select on documentos;
create policy documentos_select on documentos for select using (
  usuario_tem_acesso_empresa(empresa_id)
  and nivel_edicao_usuario(empresa_id, 'documentos') <> 'sem_acesso'
);
drop policy documentos_insert on documentos;
create policy documentos_insert on documentos for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'documentos') = 'total'
);
drop policy documentos_update on documentos;
create policy documentos_update on documentos for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'documentos') = 'total'
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'documentos') = 'total'
);
drop policy documentos_delete on documentos;
create policy documentos_delete on documentos for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'documentos') = 'total'
);

drop policy documentos_revisoes_select on documentos_revisoes;
create policy documentos_revisoes_select on documentos_revisoes for select using (
  exists (select 1 from documentos d where d.id = documento_id
    and usuario_tem_acesso_empresa(d.empresa_id)
    and nivel_edicao_usuario(d.empresa_id, 'documentos') <> 'sem_acesso')
);
drop policy documentos_revisoes_insert on documentos_revisoes;
create policy documentos_revisoes_insert on documentos_revisoes for insert with check (
  exists (select 1 from documentos d where d.id = documento_id and (
    usuario_tem_acesso_empresa(d.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(d.empresa_id, 'documentos') = 'total'
  ))
);
drop policy documentos_revisoes_update on documentos_revisoes;
create policy documentos_revisoes_update on documentos_revisoes for update using (
  exists (select 1 from documentos d where d.id = documento_id and (
    usuario_tem_acesso_empresa(d.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(d.empresa_id, 'documentos') = 'total'
  ))
) with check (
  exists (select 1 from documentos d where d.id = documento_id and (
    usuario_tem_acesso_empresa(d.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(d.empresa_id, 'documentos') = 'total'
  ))
);
drop policy documentos_revisoes_delete on documentos_revisoes;
create policy documentos_revisoes_delete on documentos_revisoes for delete using (
  exists (select 1 from documentos d where d.id = documento_id and (
    usuario_tem_acesso_empresa(d.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(d.empresa_id, 'documentos') = 'total'
  ))
);

-- Storage: bucket documentos-arquivos (rascunho de trabalho — só quem edita total vê/mexe)
drop policy documentos_arquivos_select on storage.objects;
create policy documentos_arquivos_select on storage.objects for select using (
  bucket_id = 'documentos-arquivos' and nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'documentos') = 'total'
);
drop policy documentos_arquivos_insert on storage.objects;
create policy documentos_arquivos_insert on storage.objects for insert with check (
  bucket_id = 'documentos-arquivos' and nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'documentos') = 'total'
);
drop policy documentos_arquivos_update on storage.objects;
create policy documentos_arquivos_update on storage.objects for update using (
  bucket_id = 'documentos-arquivos' and nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'documentos') = 'total'
);
drop policy documentos_arquivos_delete on storage.objects;
create policy documentos_arquivos_delete on storage.objects for delete using (
  bucket_id = 'documentos-arquivos' and nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'documentos') = 'total'
);

-- Storage: bucket documentos-publicados (PDF visível a todos da empresa; escrita só total)
drop policy documentos_publicados_select on storage.objects;
create policy documentos_publicados_select on storage.objects for select using (
  bucket_id = 'documentos-publicados'
  and usuario_tem_acesso_empresa((split_part(name, '/', 1))::uuid)
  and nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'documentos') <> 'sem_acesso'
);
drop policy documentos_publicados_insert on storage.objects;
create policy documentos_publicados_insert on storage.objects for insert with check (
  bucket_id = 'documentos-publicados' and nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'documentos') = 'total'
);
drop policy documentos_publicados_update on storage.objects;
create policy documentos_publicados_update on storage.objects for update using (
  bucket_id = 'documentos-publicados' and nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'documentos') = 'total'
);
drop policy documentos_publicados_delete on storage.objects;
create policy documentos_publicados_delete on storage.objects for delete using (
  bucket_id = 'documentos-publicados' and nivel_edicao_usuario((split_part(name, '/', 1))::uuid, 'documentos') = 'total'
);
