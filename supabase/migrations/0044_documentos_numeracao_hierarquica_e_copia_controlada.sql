-- Módulo Documentos: numeração hierárquica (P-01 / IT-01.01 / RG-01.01.01) e controle de
-- "cópia controlada" para a marca d'água de impressão (padrão: cópia não controlada).
--
-- Regras da numeração hierárquica (só vale para documentos NOVOS a partir de agora — documentos
-- já existentes mantêm o número que têm, para não quebrar rastreabilidade/cópias já distribuídas):
--   • Procedimento (P): sequencial por empresa, 2 dígitos — P-01, P-02...
--   • Instrução de Trabalho (IT): passa a exigir um Procedimento pai (procedimento_id obrigatório).
--     Número = IT-<sufixo do Procedimento pai>.<sequencial dentro desse Procedimento, 2 dígitos>
--   • Registro (RG) vinculado a uma IT (it_id preenchido): número hierárquico de 3 níveis,
--     RG-<sufixo da IT pai>.<sequencial dentro dessa IT, 2 dígitos>
--   • Demais casos (Manual, Política, Registro sem IT vinculada): numeração plana como já era
--     (prefixo-sequencial de 3 dígitos por empresa+tipo).

-- 1) IT agora exige Procedimento vinculado (garante que sempre dá pra montar o número hierárquico).
update tipos_documento set exige_procedimento = true where chave = 'it';

-- 2) Numeração hierárquica.
create or replace function gerar_numero_documento()
returns trigger
language plpgsql
as $$
declare
  v_chave text;
  v_prefixo text;
  v_proximo int;
  v_pai_numero text;
  v_pai_sufixo text;
begin
  if new.numero is not null then
    return new;
  end if;

  select chave, prefixo_numeracao into v_chave, v_prefixo
    from tipos_documento where id = new.tipo_documento_id;

  if v_chave = 'procedimento' then
    select coalesce(max((split_part(numero, '-', 2))::int), 0) + 1
      into v_proximo
      from documentos
      where empresa_id = new.empresa_id and tipo_documento_id = new.tipo_documento_id
        and split_part(numero, '-', 2) ~ '^\d+$';
    new.numero := v_prefixo || '-' || lpad(v_proximo::text, 2, '0');

  elsif v_chave = 'it' then
    if new.procedimento_id is null then
      raise exception 'Instrução de Trabalho precisa estar vinculada a um Procedimento para gerar a numeração.';
    end if;
    select numero into v_pai_numero from documentos where id = new.procedimento_id;
    v_pai_sufixo := split_part(v_pai_numero, '-', 2);
    select coalesce(max((split_part(numero, '.', 2))::int), 0) + 1
      into v_proximo
      from documentos
      where procedimento_id = new.procedimento_id and tipo_documento_id = new.tipo_documento_id
        and split_part(numero, '.', 2) ~ '^\d+$';
    new.numero := v_prefixo || '-' || v_pai_sufixo || '.' || lpad(v_proximo::text, 2, '0');

  elsif v_chave = 'registro' and new.it_id is not null then
    select numero into v_pai_numero from documentos where id = new.it_id;
    v_pai_sufixo := split_part(v_pai_numero, '-', 2);
    select coalesce(max((split_part(split_part(numero, '-', 2), '.', 3))::int), 0) + 1
      into v_proximo
      from documentos
      where it_id = new.it_id and tipo_documento_id = new.tipo_documento_id
        and split_part(split_part(numero, '-', 2), '.', 3) ~ '^\d+$';
    new.numero := v_prefixo || '-' || v_pai_sufixo || '.' || lpad(v_proximo::text, 2, '0');

  else
    select coalesce(max((split_part(numero, '-', 2))::int), 0) + 1
      into v_proximo
      from documentos
      where empresa_id = new.empresa_id and tipo_documento_id = new.tipo_documento_id
        and split_part(numero, '-', 2) ~ '^\d+$';
    new.numero := v_prefixo || '-' || lpad(v_proximo::text, 3, '0');
  end if;

  return new;
end;
$$;

-- 3) Cópia controlada: campo + RPC restrita ao departamento Qualidade (ou papel orbeex).
alter table documentos add column if not exists copia_controlada boolean not null default false;

create or replace function usuario_pode_alterar_copia_controlada(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1 from usuarios_empresas ue
    left join departamentos d on d.id = ue.departamento_id
    where ue.empresa_id = p_empresa_id
      and ue.usuario_id = auth.uid()
      and ue.ativo
      and (ue.papel = 'orbeex' or d.nome ilike 'qualidade')
  );
$$;

revoke all on function usuario_pode_alterar_copia_controlada(uuid) from public;
revoke execute on function usuario_pode_alterar_copia_controlada(uuid) from anon;
grant execute on function usuario_pode_alterar_copia_controlada(uuid) to authenticated;

create or replace function definir_copia_controlada(p_documento_id uuid, p_controlada boolean)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_empresa_id uuid;
begin
  select empresa_id into v_empresa_id from documentos where id = p_documento_id;
  if v_empresa_id is null then
    raise exception 'Documento não encontrado.';
  end if;
  if not usuario_pode_alterar_copia_controlada(v_empresa_id) then
    raise exception 'Você não tem permissão para alterar o status de cópia controlada. Apenas o departamento Qualidade pode fazer isso.';
  end if;
  update documentos set copia_controlada = p_controlada where id = p_documento_id;
end;
$$;

revoke all on function definir_copia_controlada(uuid, boolean) from public;
revoke execute on function definir_copia_controlada(uuid, boolean) from anon;
grant execute on function definir_copia_controlada(uuid, boolean) to authenticated;
