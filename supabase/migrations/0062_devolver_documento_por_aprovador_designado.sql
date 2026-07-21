-- Mesma lacuna do aprovar_documento: "Devolver para elaboração" também é uma ação do aprovador
-- designado (ou da Qualidade), mas a política de UPDATE de "documentos" exige edição total.
create or replace function devolver_documento_para_elaboracao(p_documento_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_doc documentos%rowtype;
begin
  select * into v_doc from documentos where id = p_documento_id;
  if v_doc.id is null then
    raise exception 'Documento não encontrado.';
  end if;
  if not usuario_tem_acesso_empresa(v_doc.empresa_id) then
    raise exception 'Você não tem acesso a esta empresa.';
  end if;
  if v_doc.status <> 'aprovacao' then
    raise exception 'Este documento não está aguardando aprovação.';
  end if;
  if v_doc.aprovador_solicitado_id <> auth.uid() and not usuario_pode_alterar_copia_controlada(v_doc.empresa_id) then
    raise exception 'Você não é o aprovador designado deste documento.';
  end if;

  update documentos set status = 'elaboracao', aprovador_solicitado_id = null where id = p_documento_id;
end;
$$;

revoke all on function devolver_documento_para_elaboracao(uuid) from public;
revoke execute on function devolver_documento_para_elaboracao(uuid) from anon;
grant execute on function devolver_documento_para_elaboracao(uuid) to authenticated;
