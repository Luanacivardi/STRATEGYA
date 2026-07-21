-- Aprovação de documentos: qualquer usuário cadastrado pode aprovar, desde que o elaborador o
-- tenha designado como aprovador do documento (aprovador_solicitado_id). Hoje isso não funcionava
-- de fato: a política de UPDATE de "documentos" só permitia gravação para quem tem edição total,
-- então um usuário comum designado como aprovador via de fato ver o botão mas a gravação falhava
-- silenciosamente contra o RLS. Esta função roda com privilégio elevado (security definer) e
-- assume o controle de acesso no lugar da política de UPDATE da tabela para este caso específico:
-- o próprio aprovador designado sempre pode aprovar; só a equipe da Qualidade (mesmo critério de
-- usuario_pode_alterar_copia_controlada: papel orbeex ou departamento Qualidade) pode aprovar em
-- nome de outro usuário — e, quando o faz, é obrigada a registrar uma justificativa.

alter table documentos add column if not exists justificativa_aprovacao_substituta text;
alter table documentos_revisoes add column if not exists justificativa_aprovacao_substituta text;

comment on column documentos.justificativa_aprovacao_substituta is 'Preenchido só quando quem aprovou não é o aprovador designado (aprovador_solicitado_id) — obrigatório nesse caso, só a Qualidade pode fazer essa aprovação substituta.';

create or replace function aprovar_documento(
  p_documento_id uuid,
  p_hash_documento text,
  p_justificativa text default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_doc documentos%rowtype;
  v_eh_self boolean;
  v_eh_qualidade boolean;
  v_nome text;
  v_assinatura jsonb;
  v_justificativa_final text;
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
  if v_doc.arquivo_url is not null and v_doc.arquivo_pdf_url is null then
    raise exception 'Este documento ainda não tem o PDF de visualização anexado.';
  end if;

  v_eh_self := (v_doc.aprovador_solicitado_id = auth.uid());
  v_eh_qualidade := usuario_pode_alterar_copia_controlada(v_doc.empresa_id);

  if not v_eh_self and not v_eh_qualidade then
    raise exception 'Você não é o aprovador designado deste documento.';
  end if;

  if not v_eh_self then
    if p_justificativa is null or length(trim(p_justificativa)) = 0 then
      raise exception 'Informe a justificativa para aprovar em nome do aprovador designado.';
    end if;
    v_justificativa_final := trim(p_justificativa);
  else
    v_justificativa_final := null;
  end if;

  select coalesce(raw_user_meta_data->>'nome', email) into v_nome from auth.users where id = auth.uid();
  v_assinatura := jsonb_build_object(
    'usuario_id', auth.uid(),
    'nome', v_nome,
    'data_hora', now(),
    'hash_documento', p_hash_documento,
    'aprovacao_em_nome_de_terceiro', not v_eh_self,
    'justificativa', v_justificativa_final
  );

  update documentos set
    status = 'publicado',
    aprovado_por = auth.uid(),
    assinatura_aprovador = v_assinatura,
    data_publicacao = now(),
    justificativa_aprovacao_substituta = v_justificativa_final
  where id = p_documento_id;

  update documentos_revisoes set status_final = 'obsoleto'
    where documento_id = p_documento_id and status_final = 'publicado';

  insert into documentos_revisoes (
    documento_id, numero_revisao, descricao_alteracao, conteudo_snapshot,
    arquivo_url, arquivo_nome, arquivo_pdf_url, arquivo_pdf_nome,
    elaborado_por, aprovado_por, status_final, exige_treinamento,
    aprovacao_com_alerta_segregacao, justificativa_aprovacao_substituta
  ) values (
    p_documento_id, v_doc.revisao_atual, coalesce(v_doc.descricao_alteracao_pendente, 'Primeira emissão'),
    case when v_doc.arquivo_url is not null
      then jsonb_build_object('arquivo_url', v_doc.arquivo_url, 'arquivo_nome', v_doc.arquivo_nome, 'arquivo_tamanho', v_doc.arquivo_tamanho, 'arquivo_pdf_url', v_doc.arquivo_pdf_url)
      else v_doc.conteudo end,
    v_doc.arquivo_url, v_doc.arquivo_nome, v_doc.arquivo_pdf_url, v_doc.arquivo_pdf_nome,
    v_doc.elaborado_por, auth.uid(), 'publicado', v_doc.exige_treinamento,
    (v_doc.aprovador_solicitado_id = v_doc.elaborado_por),
    v_justificativa_final
  );

  update documentos set descricao_alteracao_pendente = null where id = p_documento_id;
end;
$$;

revoke all on function aprovar_documento(uuid, text, text) from public;
revoke execute on function aprovar_documento(uuid, text, text) from anon;
grant execute on function aprovar_documento(uuid, text, text) to authenticated;
