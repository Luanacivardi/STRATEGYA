-- Estende a Auditoria de Dados (log_alteracoes / fn_log_alteracao, migração 0024 + extensões em
-- 0025/0029/0031/0034/0035/0036/0041/0086/0087) para os módulos Gestão de Auditorias (ISO) e
-- Treinamentos, que nunca tiveram o trigger ligado às suas tabelas.
--
-- Escopo dentro de Auditorias: só as tabelas que representam registros que uma pessoa realmente
-- cria/edita (cadastro de processos, auditores, a auditoria em si, achados, aprovações, itens do
-- relatório etc.) — de propósito FICAM DE FORA as tabelas geradas automaticamente pelo
-- planejamento inteligente (auditorias_processos_turnos, auditorias_processos_selecionados,
-- auditorias_distribuicao_turno, auditorias_agenda): elas são recalculadas por inteiro (delete +
-- insert de várias linhas) toda vez que o planejamento roda, então rastreá-las a nível de campo só
-- geraria ruído no histórico sem valor de auditoria (não é "alguém editou um valor", é o algoritmo
-- reconstruindo a distribuição).
--
-- Apurações continua de fora por design (confidencialidade do comitê de investigação).
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
  elsif TG_TABLE_NAME in ('auditores_competencias', 'auditores_certificacoes') then
    select a.empresa_id into v_empresa_id from auditores a where a.id = coalesce(NEW.auditor_id, OLD.auditor_id);
  elsif TG_TABLE_NAME in (
    'auditorias_equipe', 'auditorias_achados', 'auditorias_aprovacoes', 'auditorias_documentos',
    'auditorias_relatorio_itens', 'auditorias_relatorio_pessoas', 'auditorias_relatorio_instrumentos',
    'auditorias_relatorio_procedimentos'
  ) then
    select a.empresa_id into v_empresa_id from auditorias a where a.id = coalesce(NEW.auditoria_id, OLD.auditoria_id);
  elsif TG_TABLE_NAME = 'treinamentos_participantes' then
    select t.empresa_id into v_empresa_id from treinamentos t where t.id = coalesce(NEW.treinamento_id, OLD.treinamento_id);
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
    'auditorias_turnos', 'auditorias_processos', 'auditores', 'auditores_competencias',
    'auditores_certificacoes', 'auditorias', 'auditorias_equipe', 'auditorias_achados',
    'auditorias_aprovacoes', 'auditorias_documentos', 'auditorias_relatorio_itens',
    'auditorias_relatorio_pessoas', 'auditorias_relatorio_instrumentos', 'auditorias_relatorio_procedimentos',
    'treinamentos_competencias', 'treinamentos', 'treinamentos_participantes', 'treinamentos_versatilidade'
  ]
  loop
    execute format(
      'create trigger trg_log_alteracao after insert or update or delete on %I for each row execute function fn_log_alteracao();',
      t
    );
  end loop;
end $$;
