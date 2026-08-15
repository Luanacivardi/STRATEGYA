-- Permite restringir quem vê a ROL (Receita) da empresa dentro de Controladoria, independente do
-- nível geral do módulo — hoje qualquer pessoa com acesso a Controladoria via a ROL. Admin/orbeex
-- continuam sempre vendo tudo (nivel_edicao_usuario já garante isso antes de checar overrides),
-- então isto afeta só gestor/usuário e departamentos.

insert into catalogo_modulos_submodulos (modulo, submodulo, configuravel, ordem)
values ('controladoria', 'rol', true, 1)
on conflict do nothing;

drop policy if exists empresa_rol_mensal_select on empresa_rol_mensal;
create policy empresa_rol_mensal_select on empresa_rol_mensal for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = empresa_rol_mensal.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
  and nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') <> 'sem_acesso'
);
drop policy if exists empresa_rol_mensal_write on empresa_rol_mensal;
create policy empresa_rol_mensal_write on empresa_rol_mensal for all using (
  nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') = 'total'
) with check (
  nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') = 'total'
);

drop policy if exists empresa_rol_historico_anual_select on empresa_rol_historico_anual;
create policy empresa_rol_historico_anual_select on empresa_rol_historico_anual for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = empresa_rol_historico_anual.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
  and nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') <> 'sem_acesso'
);
drop policy if exists empresa_rol_historico_anual_write on empresa_rol_historico_anual;
create policy empresa_rol_historico_anual_write on empresa_rol_historico_anual for all using (
  nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') = 'total'
) with check (
  nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') = 'total'
);
