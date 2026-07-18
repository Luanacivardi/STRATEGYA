-- Auditorias externas/certificação/recertificação: permite anexar os documentos enviados pelo
-- organismo certificador (plano de auditoria, relatório do auditor externo, certificado etc).
-- Distinto dos "achados" (evidências da execução) — aqui é documentação recebida de terceiros,
-- vinculada à auditoria como um todo. Reaproveita o bucket já existente 'evidencias-auditorias'.

create table auditorias_documentos (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references auditorias(id) on delete cascade,
  nome_arquivo text not null,
  url text not null,
  descricao text,
  enviado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index idx_auditorias_documentos_auditoria on auditorias_documentos(auditoria_id);

alter table auditorias_documentos enable row level security;

create policy "auditorias_documentos_select" on auditorias_documentos for select
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id)));
create policy "auditorias_documentos_write" on auditorias_documentos for all
  using (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from auditorias a where a.id = auditoria_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])));

comment on table auditorias_documentos is 'Documentos recebidos do organismo certificador/auditor externo (plano de auditoria, relatório, certificado etc), vinculados à auditoria como um todo — distinto dos achados de execução.';
