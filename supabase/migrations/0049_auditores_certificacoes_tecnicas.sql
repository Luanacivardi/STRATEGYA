-- Auditores: além das competências fixas em norma ISO (auditores_competencias), permite
-- registrar outras certificações/treinamentos técnicos livres (ex: NR-12, Solda, CIPA, curso de
-- formação de auditor de terceira parte etc.) — nome livre, sem check constraint de valores.

create table auditores_certificacoes (
  id uuid primary key default gen_random_uuid(),
  auditor_id uuid not null references auditores(id) on delete cascade,
  nome text not null,
  instituicao text,
  data_obtencao date,
  validade date,
  created_at timestamptz not null default now()
);
create index idx_auditores_certificacoes_auditor on auditores_certificacoes(auditor_id);

alter table auditores_certificacoes enable row level security;

create policy "auditores_certificacoes_select" on auditores_certificacoes for select
  using (exists (select 1 from auditores a where a.id = auditor_id and usuario_tem_acesso_empresa(a.empresa_id)));
create policy "auditores_certificacoes_write" on auditores_certificacoes for all
  using (exists (select 1 from auditores a where a.id = auditor_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])))
  with check (exists (select 1 from auditores a where a.id = auditor_id and usuario_tem_acesso_empresa(a.empresa_id, array['orbeex', 'admin'])));

comment on table auditores_certificacoes is 'Certificações/treinamentos técnicos livres do auditor (além das competências fixas em norma ISO de auditores_competencias) — nome livre, ex: NR-12, Solda, formação de auditor de terceira parte.';
