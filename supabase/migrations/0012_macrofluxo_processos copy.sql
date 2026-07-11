-- RPC para admin/consultor de uma empresa vincular outro usuário já cadastrado (por e-mail)

create or replace function convidar_usuario_por_email(p_empresa_id uuid, p_email text, p_papel text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  if not usuario_tem_acesso_empresa(p_empresa_id, array['admin', 'consultor']) then
    raise exception 'Sem permissão para gerenciar usuários desta empresa';
  end if;

  if p_papel not in ('admin', 'consultor', 'cliente') then
    raise exception 'Papel inválido';
  end if;

  select id into v_usuario_id from auth.users where email = p_email limit 1;
  if v_usuario_id is null then
    raise exception 'Nenhum usuário cadastrado com este e-mail';
  end if;

  insert into usuarios_empresas (usuario_id, empresa_id, papel)
    values (v_usuario_id, p_empresa_id, p_papel)
    on conflict (usuario_id, empresa_id) do update set papel = excluded.papel;
end;
$$;

revoke execute on function convidar_usuario_por_email(uuid, text, text) from public, anon;
grant execute on function convidar_usuario_por_email(uuid, text, text) to authenticated;
