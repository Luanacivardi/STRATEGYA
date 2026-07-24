-- Organograma da empresa (novo grupo dentro de Contexto): hierarquia de cargos/pessoas.
-- Auto-referência (superior_id) monta a árvore automaticamente a partir do cadastro — sem
-- editor de arrastar-e-soltar, o desenho é derivado da hierarquia informada no formulário.
create table organograma_cargos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome_cargo text not null,
  nome_pessoa text,
  superior_id uuid references organograma_cargos(id) on delete set null,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_organograma_empresa on organograma_cargos(empresa_id);
create index idx_organograma_superior on organograma_cargos(superior_id);

alter table organograma_cargos enable row level security;

create policy "organograma_cargos_select" on organograma_cargos for select
  using (usuario_tem_acesso_empresa(empresa_id) and nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-organograma') <> 'sem_acesso');
create policy "organograma_cargos_insert" on organograma_cargos for insert
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-organograma') = 'total');
create policy "organograma_cargos_update" on organograma_cargos for update
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-organograma') = 'total')
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-organograma') = 'total');
create policy "organograma_cargos_delete" on organograma_cargos for delete
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin']) or nivel_edicao_usuario(empresa_id, 'planejamento-estrategico', 'contexto-organograma') = 'total');
