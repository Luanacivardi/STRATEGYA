-- Copiar permissões entre usuários: substitui todas as linhas granulares de permissoes_edicao do
-- destino pelas da origem, na mesma empresa. Mesma trava de quem pode gerenciar usuários
-- (orbeex/admin) usada em convidar_usuario_por_email. Delete+insert na mesma função (transação
-- implícita) para não deixar o destino sem nenhuma linha se o insert falhar no meio. Já cai
-- automaticamente na auditoria existente (trg_log_alteracao em permissoes_edicao).
create or replace function copiar_permissoes_edicao(p_empresa_id uuid, p_usuario_origem uuid, p_usuario_destino uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not usuario_tem_acesso_empresa(p_empresa_id, array['orbeex', 'admin']) then
    raise exception 'Sem permissão para gerenciar permissões desta empresa';
  end if;

  if not exists (select 1 from usuarios_empresas where empresa_id = p_empresa_id and usuario_id = p_usuario_origem and ativo) then
    raise exception 'Usuário de origem não tem vínculo ativo nesta empresa';
  end if;
  if not exists (select 1 from usuarios_empresas where empresa_id = p_empresa_id and usuario_id = p_usuario_destino and ativo) then
    raise exception 'Usuário de destino não tem vínculo ativo nesta empresa';
  end if;

  delete from permissoes_edicao where empresa_id = p_empresa_id and usuario_id = p_usuario_destino;

  insert into permissoes_edicao (empresa_id, usuario_id, modulo, submodulo, nivel)
    select p_empresa_id, p_usuario_destino, modulo, submodulo, nivel
    from permissoes_edicao
    where empresa_id = p_empresa_id and usuario_id = p_usuario_origem;
end;
$$;

revoke execute on function copiar_permissoes_edicao(uuid, uuid, uuid) from public, anon;
grant execute on function copiar_permissoes_edicao(uuid, uuid, uuid) to authenticated;
