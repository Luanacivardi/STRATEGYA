-- Macrofluxo: mapa visual dos processos (Direção / Processo Principal / Processo de Apoio) por empresa
create table macrofluxo_processos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo text not null check (tipo in ('direcao', 'principal', 'apoio')),
  nome text not null,
  descricao text,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_macrofluxo_empresa on macrofluxo_processos(empresa_id);

alter table macrofluxo_processos enable row level security;

create policy "macrofluxo_select" on macrofluxo_processos for select using (usuario_tem_acesso_empresa(empresa_id));
create policy "macrofluxo_write" on macrofluxo_processos for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));
