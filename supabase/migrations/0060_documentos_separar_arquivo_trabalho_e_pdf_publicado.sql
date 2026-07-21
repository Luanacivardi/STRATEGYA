-- Separa o arquivo DE TRABALHO (Word/ODT/PDF de rascunho, editável) do PDF PUBLICADO (o que todo
-- mundo da empresa pode visualizar). Até aqui, qualquer usuário da empresa conseguia baixar o
-- arquivo de trabalho direto pela API do Storage (a restrição de "Visualizar" na tela era só de
-- interface — o bucket 'documentos-arquivos' permitia SELECT para qualquer membro da empresa).
-- Isso corrige a falha e estrutura o novo fluxo: elaboração continua em Word na Gestão de
-- Documentos; a versão vista por todos em Documentos passa a ser sempre um PDF, num bucket com
-- RLS de leitura aberta a todos da empresa, mas escrita restrita a quem edita.

-- 1) Bucket dos arquivos de trabalho: SELECT restrito a quem tem edição total (mesma regra já
--    usada para insert/update/delete) — deixa de ser legível por qualquer membro da empresa.
drop policy if exists documentos_arquivos_select on storage.objects;
create policy documentos_arquivos_select on storage.objects for select using (
  bucket_id = 'documentos-arquivos' and nivel_edicao_usuario((split_part(name, '/', 1))::uuid) = 'total'
);

-- 2) Novo bucket para os PDFs publicados — leitura liberada a todos da empresa; escrita restrita
--    a quem edita (mesmo padrão do bucket de trabalho).
insert into storage.buckets (id, name, public)
values ('documentos-publicados', 'documentos-publicados', false)
on conflict (id) do nothing;

create policy documentos_publicados_select on storage.objects for select using (
  bucket_id = 'documentos-publicados' and usuario_tem_acesso_empresa((split_part(name, '/', 1))::uuid)
);
create policy documentos_publicados_insert on storage.objects for insert with check (
  bucket_id = 'documentos-publicados' and nivel_edicao_usuario((split_part(name, '/', 1))::uuid) = 'total'
);
create policy documentos_publicados_update on storage.objects for update using (
  bucket_id = 'documentos-publicados' and nivel_edicao_usuario((split_part(name, '/', 1))::uuid) = 'total'
);
create policy documentos_publicados_delete on storage.objects for delete using (
  bucket_id = 'documentos-publicados' and nivel_edicao_usuario((split_part(name, '/', 1))::uuid) = 'total'
);

-- 3) Colunas do PDF publicado, separadas do arquivo de trabalho.
alter table documentos add column if not exists arquivo_pdf_url text;
alter table documentos add column if not exists arquivo_pdf_nome text;
alter table documentos add column if not exists arquivo_pdf_tamanho bigint;

alter table documentos_revisoes add column if not exists arquivo_pdf_url text;
alter table documentos_revisoes add column if not exists arquivo_pdf_nome text;

comment on column documentos.arquivo_pdf_url is 'PDF publicado (bucket documentos-publicados) — o que a aba Documentos exibe a todos os usuários. Sempre acompanha o arquivo de trabalho (documentos.arquivo_url), gerado a partir dele.';
