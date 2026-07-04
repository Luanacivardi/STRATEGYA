-- Planos de Ação (5W2H): troca "quem" (texto livre) por responsavel_id (vínculo real com usuário),
-- adiciona campo de evidência (upload) e bucket privado de storage para os arquivos.

alter table planos_acao drop column quem;
alter table planos_acao add column responsavel_id uuid references auth.users(id);
alter table planos_acao add column evidencia_url text;
alter table planos_acao add column evidencia_nome text;
create index idx_planos_origem on planos_acao(origem, origem_id);

insert into storage.buckets (id, name, public) values ('evidencias-planos', 'evidencias-planos', false)
on conflict (id) do nothing;

create policy "evidencias_select" on storage.objects for select to authenticated
  using (bucket_id = 'evidencias-planos' and usuario_tem_acesso_empresa((split_part(name, '/', 1))::uuid));

create policy "evidencias_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias-planos' and usuario_tem_acesso_empresa((split_part(name, '/', 1))::uuid, array['orbeex', 'admin']));

create policy "evidencias_update" on storage.objects for update to authenticated
  using (bucket_id = 'evidencias-planos' and usuario_tem_acesso_empresa((split_part(name, '/', 1))::uuid, array['orbeex', 'admin']));

create policy "evidencias_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'evidencias-planos' and usuario_tem_acesso_empresa((split_part(name, '/', 1))::uuid, array['orbeex', 'admin']));
