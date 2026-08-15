-- Quatro acertos, sendo um deles um furo de permissão que só apareceu ao investigar o alerta de
-- políticas duplicadas do advisor:
--
-- 1) FURO: a escrita na ROL da empresa não estava restrita ao submódulo. As duas tabelas tinham
--    CINCO policies: uma "_write" (for all) checando nivel_edicao_usuario(..., 'rol') = 'total',
--    mais _insert/_update/_delete checando só nivel_edicao_usuario(..., 'controladoria') = 'total'
--    — sem o submódulo. Como policies permissivas se somam (OR), bastava ter Edição Total em
--    Controladoria para gravar a ROL, mesmo com o submódulo 'rol' explicitamente negado na matriz
--    de permissões. Ou seja, a restrição criada nas migrações 0092/0093 valia para ler, mas não
--    para escrever. Todas são recriadas abaixo exigindo o submódulo 'rol'.
--    (As policies por comando não estão em migração nenhuma do repositório — foram aplicadas
--    direto no painel. É o tipo de divergência que o workflow schema-producao.yml passa a expor.)
--
-- 2) Políticas permissivas duplicadas: a "_write" era "for all", então também era avaliada em todo
--    SELECT, junto com a policy de leitura. Fica uma policy por comando.
--
-- 3) Desempenho (advisor auth_rls_initplan): auth.uid() era reavaliado linha a linha nas policies
--    e dentro de nivel_edicao_usuario(). Com (select auth.uid()) o Postgres avalia uma vez só.
--
-- 4) nivel_edicao_usuario() devolvia 'leitura' para quem não tem vínculo com a empresa. Hoje isso
--    não vaza nada (toda policy checa o vínculo junto), mas é um padrão perigoso: qualquer policy
--    futura que confie só nesta função liberaria leitura para não-membro. O padrão passa a ser
--    'sem_acesso' — negar por omissão.
drop policy if exists empresa_rol_mensal_write on empresa_rol_mensal;
drop policy if exists empresa_rol_mensal_select on empresa_rol_mensal;
drop policy if exists empresa_rol_mensal_insert on empresa_rol_mensal;
drop policy if exists empresa_rol_mensal_update on empresa_rol_mensal;
drop policy if exists empresa_rol_mensal_delete on empresa_rol_mensal;

create policy empresa_rol_mensal_select on empresa_rol_mensal for select using (
  exists (select 1 from usuarios_empresas ue
          where ue.empresa_id = empresa_rol_mensal.empresa_id
            and ue.usuario_id = (select auth.uid()) and ue.ativo)
  and nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') <> 'sem_acesso'
);
create policy empresa_rol_mensal_insert on empresa_rol_mensal for insert
  with check (nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') = 'total');
create policy empresa_rol_mensal_update on empresa_rol_mensal for update
  using (nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') = 'total')
  with check (nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') = 'total');
create policy empresa_rol_mensal_delete on empresa_rol_mensal for delete
  using (nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') = 'total');

drop policy if exists empresa_rol_historico_anual_write on empresa_rol_historico_anual;
drop policy if exists empresa_rol_historico_anual_select on empresa_rol_historico_anual;
drop policy if exists empresa_rol_historico_anual_insert on empresa_rol_historico_anual;
drop policy if exists empresa_rol_historico_anual_update on empresa_rol_historico_anual;
drop policy if exists empresa_rol_historico_anual_delete on empresa_rol_historico_anual;

create policy empresa_rol_historico_anual_select on empresa_rol_historico_anual for select using (
  exists (select 1 from usuarios_empresas ue
          where ue.empresa_id = empresa_rol_historico_anual.empresa_id
            and ue.usuario_id = (select auth.uid()) and ue.ativo)
  and nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') <> 'sem_acesso'
);
create policy empresa_rol_historico_anual_insert on empresa_rol_historico_anual for insert
  with check (nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') = 'total');
create policy empresa_rol_historico_anual_update on empresa_rol_historico_anual for update
  using (nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') = 'total')
  with check (nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') = 'total');
create policy empresa_rol_historico_anual_delete on empresa_rol_historico_anual for delete
  using (nivel_edicao_usuario(empresa_id, 'controladoria', 'rol') = 'total');

-- Negar por omissão para quem não é membro ativo da empresa.
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
    where empresa_id = p_empresa_id and usuario_id = (select auth.uid()) and ativo;

  -- Sem vínculo ativo com a empresa não há nível nenhum a conceder.
  if v_papel is null then
    return 'sem_acesso';
  end if;

  if p_modulo = 'apuracoes' then
    if v_papel = 'orbeex' then
      return 'total';
    end if;
    if not usuario_no_comite_apuracao(p_empresa_id) then
      return 'sem_acesso';
    end if;
    v_nivel := nivel_configurado_usuario((select auth.uid()), p_empresa_id, p_modulo, p_submodulo);
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

  v_nivel := nivel_configurado_usuario((select auth.uid()), p_empresa_id, p_modulo, p_submodulo);
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

-- O submódulo do Organograma existe no js/modulosConfig.js e nas policies de organograma_cargos,
-- mas nunca foi inserido no catálogo — que deveria ser o espelho da configuração.
insert into catalogo_modulos_submodulos (modulo, submodulo, configuravel, ordem)
values ('planejamento-estrategico', 'contexto-organograma', true, 6)
on conflict do nothing;
