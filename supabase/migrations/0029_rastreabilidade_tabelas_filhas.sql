-- Fase 14 (extensão): estende a rastreabilidade (fn_log_alteracao, migração 0024) para tabelas
-- filhas que não têm empresa_id direto — resultados_indicadores, planos_acao_itens,
-- rac_indicadores e rac_acoes. Para essas, o empresa_id é derivado via join com a tabela pai.
--
-- Observação: se a tabela pai for excluída na mesma transação (ex.: exclusão em cascata de um
-- indicador que apaga seus resultados_indicadores), o join pode não encontrar mais o pai e o log
-- correspondente fica com empresa_id nulo — mesma limitação que já existia para exclusões em
-- cascata antes desta migração, apenas agora coberta explicitamente aqui.
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
  elsif TG_TABLE_NAME = 'resultados_indicadores' then
    select i.empresa_id into v_empresa_id from indicadores i where i.id = coalesce(NEW.indicador_id, OLD.indicador_id);
  elsif TG_TABLE_NAME = 'planos_acao_itens' then
    select p.empresa_id into v_empresa_id from planos_acao p where p.id = coalesce(NEW.plano_acao_id, OLD.plano_acao_id);
  elsif TG_TABLE_NAME = 'rac_indicadores' then
    select r.empresa_id into v_empresa_id from reunioes_analise_critica r where r.id = coalesce(NEW.reuniao_id, OLD.reuniao_id);
  elsif TG_TABLE_NAME = 'rac_acoes' then
    select r.empresa_id into v_empresa_id from reunioes_analise_critica r where r.id = coalesce(NEW.reuniao_id, OLD.reuniao_id);
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
  foreach t in array array['resultados_indicadores','planos_acao_itens','rac_indicadores','rac_acoes']
  loop
    execute format(
      'create trigger trg_log_alteracao after insert or update or delete on %I for each row execute function fn_log_alteracao();',
      t
    );
  end loop;
end $$;
