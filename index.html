-- Fase 13: versionamento anual do Planejamento Estratégico, modelo "fechar o ano" (snapshot).
-- Fechar um ano tira uma fotografia congelada (somente leitura) do estado atual — objetivos,
-- indicadores + resultados, planos de ação + tarefas, contexto (SWOT), partes interessadas e
-- macrofluxo — sem apagar ou resetar os dados vivos, que continuam sendo editados normalmente
-- (o "novo ciclo" é simplesmente a continuidade dos mesmos registros).
create table ciclos_pe (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  ano int not null,
  fechado_em timestamptz not null default now(),
  fechado_por uuid references auth.users(id),
  unique (empresa_id, ano)
);

create table ciclos_pe_snapshot (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references ciclos_pe(id) on delete cascade,
  tabela text not null,
  dados jsonb not null default '[]'::jsonb
);
create index idx_ciclos_snapshot_ciclo on ciclos_pe_snapshot(ciclo_id, tabela);

alter table ciclos_pe enable row level security;
alter table ciclos_pe_snapshot enable row level security;

create policy ciclos_pe_select on ciclos_pe for select using (
  exists (select 1 from usuarios_empresas ue where ue.empresa_id = ciclos_pe.empresa_id and ue.usuario_id = auth.uid() and ue.ativo)
);
create policy ciclos_pe_snapshot_select on ciclos_pe_snapshot for select using (
  exists (
    select 1 from ciclos_pe c
    join usuarios_empresas ue on ue.empresa_id = c.empresa_id
    where c.id = ciclos_pe_snapshot.ciclo_id and ue.usuario_id = auth.uid() and ue.ativo
  )
);

-- Só a função (security definer) grava; ninguém insere/edita/apaga ciclos direto pelo client.
revoke insert, update, delete on ciclos_pe from authenticated, anon;
revoke insert, update, delete on ciclos_pe_snapshot from authenticated, anon;

create or replace function fechar_ciclo_pe(p_empresa_id uuid, p_ano int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel text;
  v_ciclo_id uuid;
begin
  select papel into v_papel from usuarios_empresas
    where empresa_id = p_empresa_id and usuario_id = auth.uid() and ativo;
  if v_papel is null or v_papel not in ('orbeex','admin') then
    raise exception 'Apenas ORBEEX ou administrador podem fechar o ano.';
  end if;

  insert into ciclos_pe(empresa_id, ano, fechado_por) values (p_empresa_id, p_ano, auth.uid())
    returning id into v_ciclo_id;

  insert into ciclos_pe_snapshot(ciclo_id, tabela, dados) values
    (v_ciclo_id, 'objetivos_estrategicos', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from objetivos_estrategicos t where t.empresa_id = p_empresa_id)),
    (v_ciclo_id, 'indicadores', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from indicadores t where t.empresa_id = p_empresa_id)),
    (v_ciclo_id, 'resultados_indicadores', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from resultados_indicadores r join indicadores i on i.id = r.indicador_id where i.empresa_id = p_empresa_id)),
    (v_ciclo_id, 'planos_acao', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from planos_acao t where t.empresa_id = p_empresa_id)),
    (v_ciclo_id, 'planos_acao_itens', (select coalesce(jsonb_agg(to_jsonb(pi)), '[]'::jsonb) from planos_acao_itens pi join planos_acao p on p.id = pi.plano_acao_id where p.empresa_id = p_empresa_id)),
    (v_ciclo_id, 'contexto_organizacional', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from contexto_organizacional t where t.empresa_id = p_empresa_id)),
    (v_ciclo_id, 'partes_interessadas', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from partes_interessadas t where t.empresa_id = p_empresa_id)),
    (v_ciclo_id, 'macrofluxo_processos', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from macrofluxo_processos t where t.empresa_id = p_empresa_id)),
    (v_ciclo_id, 'riscos_oportunidades', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from riscos_oportunidades t where t.empresa_id = p_empresa_id));

  return v_ciclo_id;
end;
$$;
