-- nivel_edicao_usuario ganha um caso especial para o módulo 'apuracoes': diferente de todos os
-- outros módulos, aqui ADMIN NÃO é automaticamente 'total' — só ORBEEX é. Administrador, Gestor e
-- Usuário só têm algum acesso se forem membro ativo do comitê de apuração desta empresa (ver
-- usuario_no_comite_apuracao, migração 0047) — é a proteção contra conflito de interesse descrita
-- no manual do sistema, e continua intacta. A novidade é que, sendo membro do comitê, o nível
-- efetivo agora pode ser configurado (Visualização ou Edição Total) em vez de sempre 'total'
-- automático — o padrão sem configuração explícita continua sendo 'total', para não mudar o
-- comportamento de nenhum comitê já em operação.
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

  if v_papel = 'gestor' then
    return (case when p_modulo = 'planejamento-estrategico' then 'leitura' else 'proprio' end);
  end if;

  -- v_papel = 'usuario'
  return (case when p_modulo = 'planejamento-estrategico' then 'sem_acesso' else 'leitura' end);
end;
$$;
