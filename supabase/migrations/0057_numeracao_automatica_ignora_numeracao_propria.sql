-- Correção: a numeração automática deve considerar apenas documentos numerados no padrão do
-- sistema (P-01, IT-01.01, RG-01.01.01...). Documentos com numeração própria da empresa
-- (ex: "PQ-051") não podem influenciar a sequência automática — antes, "PQ-051" fazia o
-- próximo Procedimento automático sair como P-52 em vez de P-02.
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
  v_pai_sufixo_re text;
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
        and numero ~ ('^' || v_prefixo || '-\d+$');
    new.numero := v_prefixo || '-' || lpad(v_proximo::text, 2, '0');

  elsif v_chave = 'it' then
    if new.procedimento_id is null then
      raise exception 'Instrução de Trabalho precisa estar vinculada a um Procedimento para gerar a numeração.';
    end if;
    select numero into v_pai_numero from documentos where id = new.procedimento_id;
    v_pai_sufixo := split_part(v_pai_numero, '-', 2);
    v_pai_sufixo_re := replace(v_pai_sufixo, '.', '\.');
    select coalesce(max((split_part(numero, '.', 2))::int), 0) + 1
      into v_proximo
      from documentos
      where procedimento_id = new.procedimento_id and tipo_documento_id = new.tipo_documento_id
        and numero ~ ('^' || v_prefixo || '-' || v_pai_sufixo_re || '\.\d+$');
    new.numero := v_prefixo || '-' || v_pai_sufixo || '.' || lpad(v_proximo::text, 2, '0');

  elsif v_chave = 'registro' and new.it_id is not null then
    select numero into v_pai_numero from documentos where id = new.it_id;
    v_pai_sufixo := split_part(v_pai_numero, '-', 2);
    v_pai_sufixo_re := replace(v_pai_sufixo, '.', '\.');
    select coalesce(max((split_part(split_part(numero, '-', 2), '.', 3))::int), 0) + 1
      into v_proximo
      from documentos
      where it_id = new.it_id and tipo_documento_id = new.tipo_documento_id
        and numero ~ ('^' || v_prefixo || '-' || v_pai_sufixo_re || '\.\d+$');
    new.numero := v_prefixo || '-' || v_pai_sufixo || '.' || lpad(v_proximo::text, 2, '0');

  else
    select coalesce(max((split_part(numero, '-', 2))::int), 0) + 1
      into v_proximo
      from documentos
      where empresa_id = new.empresa_id and tipo_documento_id = new.tipo_documento_id
        and numero ~ ('^' || v_prefixo || '-\d+$');
    new.numero := v_prefixo || '-' || lpad(v_proximo::text, 3, '0');
  end if;

  return new;
end;
$$;
