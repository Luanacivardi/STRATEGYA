-- Módulo TO DO: itens de inclusão manual (os outros dois tipos de atividade que o TO DO consolida
-- — ações de atas e ações micro de planos de ação — já existem em rac_acoes e planos_acao_itens).
create table todo_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  descricao text not null,
  responsavel_id uuid references auth.users(id),
  indicador_id uuid references indicadores(id) on delete set null,
  prazo date,
  status text not null default 'pendente' check (status in ('pendente', 'concluido')),
  created_at timestamptz not null default now()
);
create index idx_todo_itens_empresa on todo_itens(empresa_id);

alter table todo_itens enable row level security;
create policy "todo_itens_select" on todo_itens for select using (usuario_tem_acesso_empresa(empresa_id));
create policy "todo_itens_write" on todo_itens for all
  using (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']))
  with check (usuario_tem_acesso_empresa(empresa_id, array['orbeex', 'admin']));
