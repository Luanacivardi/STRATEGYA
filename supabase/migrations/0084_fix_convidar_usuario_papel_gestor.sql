-- Bug: convidar_usuario_por_email() rejeitava o papel 'gestor' (whitelist esquecida quando esse
-- papel foi introduzido no redesign de permissões) — cadastro/vínculo de colaborador com papel
-- Gestor sempre falhava com "Papel inválido", mesmo a tabela usuarios_empresas aceitando 'gestor'
-- normalmente (CHECK constraint já inclui). Editar um colaborador já vinculado pra Gestor
-- funcionava (caminho diferente, UPDATE direto sem passar por esta função) — só a criação/vínculo
-- inicial (edge function criar-usuario-empresa) estava quebrada.
CREATE OR REPLACE FUNCTION public.convidar_usuario_por_email(p_empresa_id uuid, p_email text, p_papel text, p_departamento_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_usuario_id uuid;
begin
  if not usuario_tem_acesso_empresa(p_empresa_id, array['orbeex', 'admin']) then
    raise exception 'Sem permissão para gerenciar usuários desta empresa';
  end if;

  if p_papel not in ('orbeex', 'admin', 'gestor', 'usuario') then
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
