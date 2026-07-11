-- Rastreabilidade completa: registra usuário, data/hora, campo alterado, valor anterior e novo
-- valor em todas as tabelas principais do Planejamento Estratégico, Riscos e Colaboradores.
create table log_alteracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid, -- sem FK proposital: log é histórico e não pode sumir se a empresa for excluída
  tabela text not null,
  registro_id uuid not null,
  usuario_id uuid references auth.users(id) on delete set null,
  operacao text not null check (operacao in ('insert','update','delete')),
  campo text,
  valor_anterior text,
  valor_novo text,
  criado_em timestamptz not null default now()
);

create index idx_log_alteracoes_empresa on log_alteracoes(empresa_id, criado_em desc);
create index idx_log_alteracoes_registro on log_alteracoes(tabela, registro_id);

alter table log_alteracoes enable row level security;

-- Só ORBEEX e admin da empresa podem consultar o histórico dela.
create policy log_alteracoes_select on log_alteracoes for select
  using (
    exists (
      select 1 from usuarios_empresas ue
      where ue.empresa_id = log_alteracoes.empresa_id
        and ue.usuario_id = auth.uid()
        and ue.papel in ('orbeex','admin')
        and ue.ativo
    )
  );

-- Ninguém grava direto pelo client; só a função do trigger (security definer) grava.
revoke insert, update, delete on log_alteracoes from authenticated, anon;

create or replace function fn_log_alteracao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_registro_id uuid;
  v_usuario uuid := auth.uid();
  v_key text;
  v_old_val text;
  v_new_val text;
  v_old_json jsonb;
  v_new_json jsonb;
  excluir text[] := array['id','created_at','empresa_id'];
begin
  if TG_TABLE_NAME = 'empresas' then
    v_empresa_id := coalesce(NEW.id, OLD.id);
  else
    v_empresa_id := coalesce(NEW.empresa_id, OLD.empresa_id);
  end if;
  v_registro_id := coalesce(NEW.id, OLD.id);

  if TG_OP = 'INSERT' then
    v_new_json := to_jsonb(NEW);
    for v_key in select jsonb_object_keys(v_new_json) loop
      if v_key = any(excluir) then continue; end if;
      v_new_val := v_new_json ->> v_key;
      if v_new_val is not null then
        insert into log_alteracoes(empresa_id, tabela, registro_id, usuario_id, operacao, campo, valor_anterior, valor_novo)
        values (v_empresa_id, TG_TABLE_NAME, v_registro_id, v_usuario, 'insert', v_key, null, v_new_val);
      end if;
    end loop;
  elsif TG_OP = 'UPDATE' then
    v_old_json := to_jsonb(OLD);
    v_new_json := to_jsonb(NEW);
    for v_key in select jsonb_object_keys(v_new_json) loop
      if v_key = any(excluir) then continue; end if;
      v_old_val := v_old_json ->> v_key;
      v_new_val := v_new_json ->> v_key;
      if v_old_val is distinct from v_new_val then
        insert into log_alteracoes(empresa_id, tabela, registro_id, usuario_id, operacao, campo, valor_anterior, valor_novo)
        values (v_empresa_id, TG_TABLE_NAME, v_registro_id, v_usuario, 'update', v_key, v_old_val, v_new_val);
      end if;
    end loop;
  elsif TG_OP = 'DELETE' then
    v_old_json := to_jsonb(OLD);
    for v_key in select jsonb_object_keys(v_old_json) loop
      if v_key = any(excluir) then continue; end if;
      v_old_val := v_old_json ->> v_key;
      if v_old_val is not null then
        insert into log_alteracoes(empresa_id, tabela, registro_id, usuario_id, operacao, campo, valor_anterior, valor_novo)
        values (v_empresa_id, TG_TABLE_NAME, v_registro_id, v_usuario, 'delete', v_key, v_old_val, null);
      end if;
    end loop;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'empresas','objetivos_estrategicos','objetivos_relacoes','indicadores','planos_acao',
    'reunioes_analise_critica','riscos_oportunidades','contexto_organizacional',
    'partes_interessadas','macrofluxo_processos','todo_itens','usuarios_empresas'
  ]
  loop
    execute format(
      'create trigger trg_log_alteracao after insert or update or delete on %I for each row execute function fn_log_alteracao();',
      t
    );
  end loop;
end $$;
