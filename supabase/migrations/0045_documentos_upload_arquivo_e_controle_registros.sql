-- Módulo Documentos: upload de arquivo (Word/PDF) por documento/revisão — a partir de agora, a
-- elaboração de um documento novo (ou de uma nova revisão) se dá anexando o arquivo já pronto,
-- em vez de digitar o conteúdo seção por seção dentro do sistema. O app passa a ser
-- controle de versão + lista mestra sobre esse arquivo. Documentos antigos que já têm conteúdo
-- digitado (campo "conteudo") continuam funcionando como estavam, para não perder histórico.

alter table documentos add column if not exists arquivo_url text;
alter table documentos add column if not exists arquivo_nome text;
alter table documentos add column if not exists arquivo_tamanho bigint;

alter table documentos_revisoes add column if not exists arquivo_url text;
alter table documentos_revisoes add column if not exists arquivo_nome text;

-- Controle de Registros (ISO 9001, cláusula 7.5.3.2): tempo de retenção, local de arquivamento e
-- forma de descarte — campos que só fazem sentido para o tipo "registro", mas ficam na mesma
-- tabela (documentos) por simplicidade, iguais em espírito às demais colunas específicas por tipo.
alter table documentos add column if not exists tempo_retencao_meses int;
alter table documentos add column if not exists local_armazenamento text;
alter table documentos add column if not exists forma_descarte text;

-- Bucket privado para os arquivos dos documentos — acesso só via signed URL, mesmo padrão já
-- usado em evidencias-planos e contas-anexos (path começa com o empresa_id, RLS confere isso).
insert into storage.buckets (id, name, public)
values ('documentos-arquivos', 'documentos-arquivos', false)
on conflict (id) do nothing;

create policy documentos_arquivos_select on storage.objects for select using (
  bucket_id = 'documentos-arquivos' and usuario_tem_acesso_empresa((split_part(name, '/', 1))::uuid)
);
create policy documentos_arquivos_insert on storage.objects for insert with check (
  bucket_id = 'documentos-arquivos' and nivel_edicao_usuario((split_part(name, '/', 1))::uuid) = 'total'
);
create policy documentos_arquivos_update on storage.objects for update using (
  bucket_id = 'documentos-arquivos' and nivel_edicao_usuario((split_part(name, '/', 1))::uuid) = 'total'
);
create policy documentos_arquivos_delete on storage.objects for delete using (
  bucket_id = 'documentos-arquivos' and nivel_edicao_usuario((split_part(name, '/', 1))::uuid) = 'total'
);
