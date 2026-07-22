-- reunioes_analise_critica: mesmo padrão orbeex/admin OR 'total' (sem proprio). rac_acoes (via join
-- com a reunião) tem responsavel_id -> libera 'proprio'. rac_indicadores (via join) não tem
-- responsável -> só 'total'. Submódulo único para as 3: 'atas'.

drop policy rac_select on reunioes_analise_critica;
create policy rac_select on reunioes_analise_critica for select using (
  usuario_tem_acesso_empresa(empresa_id)
  and nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'atas') <> 'sem_acesso'
);
drop policy rac_insert on reunioes_analise_critica;
create policy rac_insert on reunioes_analise_critica for insert with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'atas') = 'total'
);
drop policy rac_update on reunioes_analise_critica;
create policy rac_update on reunioes_analise_critica for update using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'atas') = 'total'
) with check (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'atas') = 'total'
);
drop policy rac_delete on reunioes_analise_critica;
create policy rac_delete on reunioes_analise_critica for delete using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
  or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'atas') = 'total'
);

drop policy rac_acoes_select on rac_acoes;
create policy rac_acoes_select on rac_acoes for select using (
  exists (select 1 from reunioes_analise_critica r where r.id = rac_acoes.reuniao_id
    and usuario_tem_acesso_empresa(r.empresa_id)
    and nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') <> 'sem_acesso')
);
drop policy rac_acoes_insert on rac_acoes;
create policy rac_acoes_insert on rac_acoes for insert with check (
  exists (select 1 from reunioes_analise_critica r where r.id = rac_acoes.reuniao_id and (
    usuario_tem_acesso_empresa(r.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'total'
    or (nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'proprio' and rac_acoes.responsavel_id = auth.uid())
  ))
);
drop policy rac_acoes_update on rac_acoes;
create policy rac_acoes_update on rac_acoes for update using (
  exists (select 1 from reunioes_analise_critica r where r.id = rac_acoes.reuniao_id and (
    usuario_tem_acesso_empresa(r.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'total'
    or (nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'proprio' and rac_acoes.responsavel_id = auth.uid())
  ))
) with check (
  exists (select 1 from reunioes_analise_critica r where r.id = rac_acoes.reuniao_id and (
    usuario_tem_acesso_empresa(r.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'total'
    or (nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'proprio' and rac_acoes.responsavel_id = auth.uid())
  ))
);
drop policy rac_acoes_delete on rac_acoes;
create policy rac_acoes_delete on rac_acoes for delete using (
  exists (select 1 from reunioes_analise_critica r where r.id = rac_acoes.reuniao_id and (
    usuario_tem_acesso_empresa(r.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'total'
    or (nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'proprio' and rac_acoes.responsavel_id = auth.uid())
  ))
);

drop policy rac_indicadores_select on rac_indicadores;
create policy rac_indicadores_select on rac_indicadores for select using (
  exists (select 1 from reunioes_analise_critica r where r.id = rac_indicadores.reuniao_id
    and usuario_tem_acesso_empresa(r.empresa_id)
    and nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') <> 'sem_acesso')
);
drop policy rac_indicadores_insert on rac_indicadores;
create policy rac_indicadores_insert on rac_indicadores for insert with check (
  exists (select 1 from reunioes_analise_critica r where r.id = rac_indicadores.reuniao_id and (
    usuario_tem_acesso_empresa(r.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'total'
  ))
);
drop policy rac_indicadores_update on rac_indicadores;
create policy rac_indicadores_update on rac_indicadores for update using (
  exists (select 1 from reunioes_analise_critica r where r.id = rac_indicadores.reuniao_id and (
    usuario_tem_acesso_empresa(r.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'total'
  ))
) with check (
  exists (select 1 from reunioes_analise_critica r where r.id = rac_indicadores.reuniao_id and (
    usuario_tem_acesso_empresa(r.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'total'
  ))
);
drop policy rac_indicadores_delete on rac_indicadores;
create policy rac_indicadores_delete on rac_indicadores for delete using (
  exists (select 1 from reunioes_analise_critica r where r.id = rac_indicadores.reuniao_id and (
    usuario_tem_acesso_empresa(r.empresa_id, array['orbeex','admin'])
    or nivel_edicao_usuario(r.empresa_id, 'planejamento-estrategico', 'atas') = 'total'
  ))
);
