-- Fase 1 do backlog: colaboradores.
-- 1) Status ativo/inativo por vínculo empresa-usuário (não afeta o acesso da pessoa em outras empresas).
-- 2) listar_usuarios_empresa passa a retornar também "nome" (raw_user_meta_data->>'nome') e "ativo",
--    para a interface mostrar nome de exibição no lugar do e-mail.

alter table usuarios_empresas add column if not exists ativo boolean not null default true;

create or replace function usuario_tem_acesso_empresa(p_empresa_id uuid, p_papeis text[] default null)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from usuarios_empresas ue
    where ue.usuario_id = auth.uid()
      and ue.empresa_id = p_empresa_id
      and ue.ativo = true
      and (p_papeis is null or ue.papel = any(p_papeis))
  );
$$;

drop function if exists listar_usuarios_empresa(uuid);

create function listar_usuarios_empresa(p_empresa_id uuid)
returns table (usuario_id uuid, email text, nome text, papel text, ativo boolean)
language sql
security definer
stable
set search_path = public
as $$
  select ue.usuario_id, u.email, u.raw_user_meta_data->>'nome' as nome, ue.papel, ue.ativo
  from usuarios_empresas ue
  join auth.users u on u.id = ue.usuario_id
  where ue.empresa_id = p_empresa_id
    and usuario_tem_acesso_empresa(p_empresa_id);
$$;

revoke execute on function listar_usuarios_empresa(uuid) from public, anon;
grant execute on function listar_usuarios_empresa(uuid) to authenticated;

create or replace function definir_ativo_usuario_empresa(p_empresa_id uuid, p_usuario_id uuid, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not usuario_tem_acesso_empresa(p_empresa_id, array['orbeex', 'admin']) then
    raise exception 'Sem permissão para gerenciar usuários desta empresa';
  end if;
  update usuarios_empresas set ativo = p_ativo where empresa_id = p_empresa_id and usuario_id = p_usuario_id;
end;
$$;

revoke execute on function definir_ativo_usuario_empresa(uuid, uuid, boolean) from public, anon;
grant execute on function definir_ativo_usuario_empresa(uuid, uuid, boolean) to authenticated;

-- Funções de trigger não devem ser chamáveis diretamente via RPC (só disparam como gatilho)
revoke execute on function proteger_modulos_habilitados() from public, anon, authenticated;
revoke execute on function proteger_papel_orbeex() from public, anon, authenticated;
