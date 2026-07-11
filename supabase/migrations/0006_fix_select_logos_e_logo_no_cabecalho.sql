-- Corrige upload de logo: o Storage do Supabase faz "INSERT ... RETURNING *" internamente,
-- então além da policy de INSERT é preciso uma policy de SELECT em storage.objects/storage.buckets
-- (restrita aos membros da empresa, não pública) para o upload não falhar com
-- "new row violates row-level security policy".

create policy "logos_select" on storage.objects for select to authenticated
  using (bucket_id = 'logos-empresas' and usuario_tem_acesso_empresa((split_part(name, '/', 1))::uuid));

create policy "buckets_select" on storage.buckets for select to authenticated
  using (id = 'logos-empresas');
