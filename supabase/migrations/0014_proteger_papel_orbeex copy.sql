-- Renomeia os papéis do modelo (admin | consultor | cliente) para (orbeex | admin | usuario)
-- e adiciona identidade visual (cor + logo) por empresa, com bucket de storage para logos.

alter table usuarios_empresas drop constraint usuarios_empresas_papel_check;
update usuarios_empresas set papel = 'orbeex' where papel = 'consultor';
update usuarios_empresas set papel = 'usuario' where papel = 'cliente';
alter table usuarios_empresas add constraint usuarios_empresas_papel_check check (papel in ('orbeex', 'admin', 'usuario'));

drop policy "empresas_update" on empresas;
create policy "empresas_update" on empresas for update
  using (usuario_tem_acesso_empresa(id, array['orbeex', 'admin']));

drop policy "empresas_delete" on empresas;
create policy "empresas_delete" on empresas for delete
  using (usuario_tem_acesso_empresa(id, array['orbeex']));

drop policy "usuarios_empresas_select" on usuarios_empresas;
create policy "usuarios_empresas_select" on usuarios_empresas for select
  using (usuario_id = auth.uid() or usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

drop policy "usuarios_empresas_insert" on usuarios_empresas;
create policy "usuarios_empresas_insert" on usuarios_empresas for insert
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

drop policy "usuarios_empresas_update" on usuarios_empresas;
create policy "usuarios_empresas_update" on usuarios_empresas for update
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

drop policy "usuarios_empresas_delete" on usuarios_empresas;
create policy "usuarios_empresas_delete" on usuarios_empresas for delete
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

drop policy "contexto_write" on contexto_organizacional;
create policy "contexto_write" on contexto_organizacional for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

drop policy "partes_write" on partes_interessadas;
create policy "partes_write" on partes_interessadas for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

drop policy "objetivos_write" on objetivos_estrategicos;
create policy "objetivos_write" on objetivos_estrategicos for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

drop policy "objetivos_relacoes_write" on objetivos_relacoes;
create policy "objetivos_relacoes_write" on objetivos_relacoes for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

drop policy "indicadores_write" on indicadores;
create policy "indicadores_write" on indicadores for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

drop policy "riscos_write" on riscos_oportunidades;
create policy "riscos_write" on riscos_oportunidades for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

drop policy "planos_write" on planos_acao;
create policy "planos_write" on planos_acao for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

drop policy "rac_write" on reunioes_analise_critica;
create policy "rac_write" on reunioes_analise_critica for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));

drop policy "resultados_write" on resultados_indicadores;
create policy "resultados_write" on resultados_indicadores for all
  using (exists (select 1 from indicadores i where i.id = indicador_id and usuario_tem_acesso_empresa(i.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from indicadores i where i.id = indicador_id and usuario_tem_acesso_empresa(i.empresa_id, array['orbeex', 'admin'])));

drop policy "acoes_rac_write" on acoes_rac;
create policy "acoes_rac_write" on acoes_rac for all
  using (exists (select 1 from reunioes_analise_critica r where r.id = reuniao_id and usuario_tem_acesso_empresa(r.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from reunioes_analise_critica r where r.id = reuniao_id and usuario_tem_acesso_empresa(r.empresa_id, array['orbeex', 'admin'])));

create or replace function criar_empresa(p_nome text, p_cnpj text default null)
returns empresas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa empresas;
begin
  insert into empresas (nome, cnpj) values (p_nome, p_cnpj) returning * into v_empresa;
  insert into usuarios_empresas (usuario_id, empresa_id, papel)
    values (auth.uid(), v_empresa.id, 'orbeex');
  return v_empresa;
end;
$$;

create or replace function convidar_usuario_por_email(p_empresa_id uuid, p_email text, p_papel text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  if not usuario_tem_acesso_empresa(p_empresa_id, array['orbeex', 'admin']) then
    raise exception 'Sem permissão para gerenciar usuários desta empresa';
  end if;

  if p_papel not in ('orbeex', 'admin', 'usuario') then
    raise exception 'Papel inválido';
  end if;

  select id into v_usuario_id from auth.users where email = p_email limit 1;
  if v_usuario_id is null then
    raise exception 'Nenhum usuário cadastrado com este e-mail';
  end if;

  insert into usuarios_empresas (usuario_id, empresa_id, papel)
    values (v_usuario_id, p_empresa_id, p_papel)
    on conflict (usuario_id, empresa_id) do update set papel = excluded.papel;
end;
$$;

alter table empresas add column cor_primaria text not null default '#252538';
alter table empresas add column cor_destaque text not null default '#E8B84B';
alter table empresas add column logo_url text;

insert into storage.buckets (id, name, public) values ('logos-empresas', 'logos-empresas', true)
on conflict (id) do nothing;

create policy "logos_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos-empresas' and usuario_tem_acesso_empresa((split_part(name, '/', 1))::uuid, array['orbeex', 'admin']));

create policy "logos_update" on storage.objects for update to authenticated
  using (bucket_id = 'logos-empresas' and usuario_tem_acesso_empresa((split_part(name, '/', 1))::uuid, array['orbeex', 'admin']));

create policy "logos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'logos-empresas' and usuario_tem_acesso_empresa((split_part(name, '/', 1))::uuid, array['orbeex', 'admin']));

-- Bucket público já serve GET de objetos sem precisar de policy de SELECT em storage.objects;
-- nenhuma policy de select é criada para evitar listagem pública dos arquivos.
