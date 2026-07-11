-- listar_usuarios_empresa passa a retornar também o departamento_id do colaborador (Fase 16).
drop function listar_usuarios_empresa(uuid);

create function listar_usuarios_empresa(p_empresa_id uuid)
returns table(usuario_id uuid, email text, nome text, papel text, ativo boolean, departamento_id uuid)
language sql
stable
security definer
set search_path = 'public'
as $function$
  select ue.usuario_id, u.email, u.raw_user_meta_data->>'nome' as nome, ue.papel, ue.ativo, ue.departamento_id
  from usuarios_empresas ue
  join auth.users u on u.id = ue.usuario_id
  where ue.empresa_id = p_empresa_id
    and usuario_tem_acesso_empresa(p_empresa_id);
$function$;
