-- ROL da empresa: dado sensível, então o padrão (sem override explícito em permissoes_edicao) passa
-- a ser "ninguém vê" — inclusive Gestor, que em todo o resto do sistema já começa com acesso
-- (proprio/leitura). Só aparece pra quem o Admin liberar explicitamente (usuário ou departamento) na
-- matriz de permissões. Admin/orbeex continuam sempre vendo tudo — não passam por este trecho, já
-- retornaram 'total' mais acima na função.
create or replace function public.nivel_edicao_usuario(p_empresa_id uuid, p_modulo text, p_submodulo text default null::text)
returns text
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_papel text;
  v_departamento_id uuid;
  v_nivel text;
begin
  select papel, departamento_id into v_papel, v_departamento_id
    from usuarios_empresas
    where empresa_id = p_empresa_id and usuario_id = auth.uid() and ativo;

  if v_papel is null then
    return 'leitura';
  end if;

  if p_modulo = 'apuracoes' then
    if v_papel = 'orbeex' then
      return 'total';
    end if;
    if not usuario_no_comite_apuracao(p_empresa_id) then
      return 'sem_acesso';
    end if;
    v_nivel := nivel_configurado_usuario(auth.uid(), p_empresa_id, p_modulo, p_submodulo);
    if v_nivel is not null then
      return v_nivel;
    end if;
    if v_departamento_id is not null then
      v_nivel := nivel_configurado_departamento(v_departamento_id, p_modulo, p_submodulo);
      if v_nivel is not null then
        return v_nivel;
      end if;
    end if;
    return 'total';
  end if;

  if v_papel in ('orbeex', 'admin') then
    return 'total';
  end if;

  v_nivel := nivel_configurado_usuario(auth.uid(), p_empresa_id, p_modulo, p_submodulo);
  if v_nivel is not null then
    return v_nivel;
  end if;

  if v_departamento_id is not null then
    v_nivel := nivel_configurado_departamento(v_departamento_id, p_modulo, p_submodulo);
    if v_nivel is not null then
      return v_nivel;
    end if;
  end if;

  if p_modulo = 'controladoria' and p_submodulo = 'rol' then
    return 'sem_acesso';
  end if;

  if v_papel = 'gestor' then
    return (case when p_modulo = 'planejamento-estrategico' then 'leitura' else 'proprio' end);
  end if;

  -- v_papel = 'usuario'
  return (case when p_modulo = 'planejamento-estrategico' then 'sem_acesso' else 'leitura' end);
end;
$function$;
