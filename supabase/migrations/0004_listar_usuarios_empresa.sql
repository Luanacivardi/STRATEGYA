-- RPC para listar usuários vinculados a uma empresa (id, e-mail, papel) — usado nos selects de "responsável"
-- e na tela de gestão de usuários da empresa.

create or replace function listar_usuarios_empresa(p_empresa_id uuid)
returns table (usuario_id uuid, email text, papel text)
language sql
security definer
stable
set search_path = public
as $$
  select ue.usuario_id, u.email, ue.papel
  from usuarios_empresas ue
  join auth.users u on u.id = ue.usuario_id
  where ue.empresa_id = p_empresa_id
    and usuario_tem_acesso_empresa(p_empresa_id);
$$;

revoke execute on function listar_usuarios_empresa(uuid) from public, anon;
grant execute on function listar_usuarios_empresa(uuid) to authenticated;
