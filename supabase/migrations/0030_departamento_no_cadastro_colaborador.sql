-- Permite definir o departamento do colaborador já no momento do cadastro/convite, não só depois
-- via edição. Parâmetro novo com default null no final, compatível com as chamadas existentes.
--
-- create or replace com um parâmetro novo no final cria uma SOBRECARGA em vez de substituir a
-- função (a assinatura mudou), então é preciso remover explicitamente a versão de 3 parâmetros
-- para evitar ambiguidade nas chamadas via RPC (PostgREST usa notação nomeada, que não sabe
-- escolher entre "3 argumentos" e "4º argumento com default" quando as duas existem).
drop function if exists convidar_usuario_por_email(uuid, text, text);

create or replace function convidar_usuario_por_email(p_empresa_id uuid, p_email text, p_papel text, p_departamento_id uuid default null)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_usuario_id uuid;
begin
  if not usuario_tem_acesso_empresa(p_empresa_id, array['orbeex', 'admin']) then
    raise exception 'Sem permissão para gerenciar usuários desta empresa';
  end if;

  if p_papel not in ('orbeex', 'admin', 'usuario') then
    raise exception 'Papel inválido';
  end if;

  if p_departamento_id is not null and not exists (
    select 1 from departamentos d where d.id = p_departamento_id and d.empresa_id = p_empresa_id
  ) then
    raise exception 'Departamento inválido para esta empresa';
  end if;

  select id into v_usuario_id from auth.users where email = p_email limit 1;
  if v_usuario_id is null then
    raise exception 'Nenhum usuário cadastrado com este e-mail';
  end if;

  insert into usuarios_empresas (usuario_id, empresa_id, papel, departamento_id)
    values (v_usuario_id, p_empresa_id, p_papel, p_departamento_id)
    on conflict (usuario_id, empresa_id) do update
      set papel = excluded.papel,
          departamento_id = coalesce(excluded.departamento_id, usuarios_empresas.departamento_id);
end;
$function$;
