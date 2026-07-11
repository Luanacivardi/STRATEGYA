-- Reforça no banco (não só na UI) o nível de edição definido em permissoes_edicao para o papel
-- 'usuario': 'leitura' (nenhuma escrita extra — mantém o bloqueio total que já existia),
-- 'proprio' (só grava/edita registros onde ele é o responsável, nas telas que têm esse campo) ou
-- 'total' (mesma liberdade de escrita que orbeex/admin, mas sem elevar o papel em si).
-- orbeex/admin continuam com edição total sempre, via a política *_write já existente (sem mudança).
create or replace function nivel_edicao_usuario(p_empresa_id uuid)
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

  select nivel into v_nivel from permissoes_edicao where empresa_id = p_empresa_id and usuario_id = auth.uid();
  if v_nivel is not null then
    return v_nivel;
  end if;

  if v_departamento_id is not null then
    select nivel into v_nivel from permissoes_edicao where departamento_id = v_departamento_id;
    if v_nivel is not null then
      return v_nivel;
    end if;
  end if;

  return 'leitura';
end;
$$;

-- Tabelas com campo responsavel_id: 'proprio' libera escrita só no que é do próprio usuário.
create policy objetivos_write_nivel on objetivos_estrategicos for all using (
  nivel_edicao_usuario(empresa_id) = 'total' or (nivel_edicao_usuario(empresa_id) = 'proprio' and responsavel_id = auth.uid())
) with check (
  nivel_edicao_usuario(empresa_id) = 'total' or (nivel_edicao_usuario(empresa_id) = 'proprio' and responsavel_id = auth.uid())
);

create policy indicadores_write_nivel on indicadores for all using (
  nivel_edicao_usuario(empresa_id) = 'total' or (nivel_edicao_usuario(empresa_id) = 'proprio' and responsavel_id = auth.uid())
) with check (
  nivel_edicao_usuario(empresa_id) = 'total' or (nivel_edicao_usuario(empresa_id) = 'proprio' and responsavel_id = auth.uid())
);

create policy planos_write_nivel on planos_acao for all using (
  nivel_edicao_usuario(empresa_id) = 'total' or (nivel_edicao_usuario(empresa_id) = 'proprio' and responsavel_id = auth.uid())
) with check (
  nivel_edicao_usuario(empresa_id) = 'total' or (nivel_edicao_usuario(empresa_id) = 'proprio' and responsavel_id = auth.uid())
);

create policy todo_itens_write_nivel on todo_itens for all using (
  nivel_edicao_usuario(empresa_id) = 'total' or (nivel_edicao_usuario(empresa_id) = 'proprio' and responsavel_id = auth.uid())
) with check (
  nivel_edicao_usuario(empresa_id) = 'total' or (nivel_edicao_usuario(empresa_id) = 'proprio' and responsavel_id = auth.uid())
);

create policy planos_itens_write_nivel on planos_acao_itens for all using (
  exists (
    select 1 from planos_acao p where p.id = planos_acao_itens.plano_acao_id
    and (nivel_edicao_usuario(p.empresa_id) = 'total'
         or (nivel_edicao_usuario(p.empresa_id) = 'proprio' and planos_acao_itens.responsavel_id = auth.uid()))
  )
) with check (
  exists (
    select 1 from planos_acao p where p.id = planos_acao_itens.plano_acao_id
    and (nivel_edicao_usuario(p.empresa_id) = 'total'
         or (nivel_edicao_usuario(p.empresa_id) = 'proprio' and planos_acao_itens.responsavel_id = auth.uid()))
  )
);

-- Tabelas sem campo responsável: 'proprio' equivale a 'leitura' (só 'total' libera escrita).
create policy contexto_write_nivel on contexto_organizacional for all using (
  nivel_edicao_usuario(empresa_id) = 'total'
) with check (
  nivel_edicao_usuario(empresa_id) = 'total'
);

create policy partes_write_nivel on partes_interessadas for all using (
  nivel_edicao_usuario(empresa_id) = 'total'
) with check (
  nivel_edicao_usuario(empresa_id) = 'total'
);

create policy macrofluxo_write_nivel on macrofluxo_processos for all using (
  nivel_edicao_usuario(empresa_id) = 'total'
) with check (
  nivel_edicao_usuario(empresa_id) = 'total'
);

create policy riscos_write_nivel on riscos_oportunidades for all using (
  nivel_edicao_usuario(empresa_id) = 'total'
) with check (
  nivel_edicao_usuario(empresa_id) = 'total'
);

create policy rac_write_nivel on reunioes_analise_critica for all using (
  nivel_edicao_usuario(empresa_id) = 'total'
) with check (
  nivel_edicao_usuario(empresa_id) = 'total'
);
