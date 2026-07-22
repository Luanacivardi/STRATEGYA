-- nivel_edicao_usuario ganha um overload por módulo/submódulo (Postgres permite duas funções com o
-- mesmo nome e assinaturas diferentes coexistindo). A versão de 1 argumento continua existindo até
-- todas as políticas RLS serem migradas tabela por tabela (fase seguinte) — só então ela é dropada.
--
-- Cascata de resolução: usuário específico (módulo+submódulo > módulo inteiro > coringa '*') >
-- mesma cascata pelo departamento > default por papel (gestor: 'proprio', exceto PE = 'leitura';
-- usuario: 'leitura', exceto PE = 'sem_acesso' — é isso que faz o Usuário não ver o Planejamento
-- Estratégico por padrão).

create or replace function nivel_configurado_usuario(
  p_usuario_id uuid, p_empresa_id uuid, p_modulo text, p_submodulo text
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_nivel text;
begin
  if p_submodulo is not null then
    select nivel into v_nivel from permissoes_edicao
      where usuario_id = p_usuario_id and empresa_id = p_empresa_id
        and modulo = p_modulo and submodulo = p_submodulo;
    if v_nivel is not null then return v_nivel; end if;
  end if;

  select nivel into v_nivel from permissoes_edicao
    where usuario_id = p_usuario_id and empresa_id = p_empresa_id
      and modulo = p_modulo and submodulo is null;
  if v_nivel is not null then return v_nivel; end if;

  select nivel into v_nivel from permissoes_edicao
    where usuario_id = p_usuario_id and empresa_id = p_empresa_id and modulo = '*';
  return v_nivel;
end;
$$;

create or replace function nivel_configurado_departamento(
  p_departamento_id uuid, p_modulo text, p_submodulo text
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_nivel text;
begin
  if p_submodulo is not null then
    select nivel into v_nivel from permissoes_edicao
      where departamento_id = p_departamento_id and modulo = p_modulo and submodulo = p_submodulo;
    if v_nivel is not null then return v_nivel; end if;
  end if;

  select nivel into v_nivel from permissoes_edicao
    where departamento_id = p_departamento_id and modulo = p_modulo and submodulo is null;
  if v_nivel is not null then return v_nivel; end if;

  select nivel into v_nivel from permissoes_edicao
    where departamento_id = p_departamento_id and modulo = '*';
  return v_nivel;
end;
$$;

create or replace function nivel_edicao_usuario(p_empresa_id uuid, p_modulo text, p_submodulo text default null)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
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

  if v_papel = 'gestor' then
    return (case when p_modulo = 'planejamento-estrategico' then 'leitura' else 'proprio' end);
  end if;

  -- v_papel = 'usuario'
  return (case when p_modulo = 'planejamento-estrategico' then 'sem_acesso' else 'leitura' end);
end;
$$;

revoke execute on function nivel_configurado_usuario(uuid, uuid, text, text) from public, anon;
grant execute on function nivel_configurado_usuario(uuid, uuid, text, text) to authenticated;

revoke execute on function nivel_configurado_departamento(uuid, text, text) from public, anon;
grant execute on function nivel_configurado_departamento(uuid, text, text) to authenticated;

revoke execute on function nivel_edicao_usuario(uuid, text, text) from public, anon;
grant execute on function nivel_edicao_usuario(uuid, text, text) to authenticated;
