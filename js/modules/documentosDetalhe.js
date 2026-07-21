// Detalhe do documento (modal), ações do fluxo de aprovação e substituição de arquivo.
// Separado de documentos.js só por tamanho de arquivo (mantém os módulos menores) — import
// circular com documentos.js é seguro aqui porque "render" só é chamado dentro de callbacks,
// nunca durante a avaliação do módulo.
import { abrirModal, fecharModal, toast, escapeHtml, confirmar } from '../ui.js';
import { imprimirDocumentoLegado, visualizarPdfDocumentoLegado } from './documentosImpressaoLegado.js';
import {
  render, STATUS, CLASSIFICACAO, ehRegistro, formatarData, formatarTamanho,
  hashConteudo, uploadArquivoDocumento, abrirArquivoDocumento, visualizarArquivoRestrito, BUCKET_ARQUIVOS, ACCEPT_ARQUIVO,
} from './documentos.js';

const BADGE_STATUS = {
  elaboracao: 'badge-neutral',
  revisao: 'badge-warning',
  aprovacao: 'badge-warning',
  publicado: 'badge-success',
  obsoleto: 'badge-danger',
};

export function abrirDetalhe(state, container, doc, ctx) {
  const { tipos, processos, documentos, usuarios, podeEditar, nomeUsuario, nomeProcesso, podeAlterarCopiaControlada } = ctx;
  const tipo = doc.tipos_documento;
  const revisoesPromise = state.supabase.from('documentos_revisoes').select('*').eq('documento_id', doc.id).order('numero_revisao');

  revisoesPromise.then(({ data: revisoes }) => {
    const secoes = tipo.secoes || [];
    const emEdicao = doc.status !== 'publicado' && doc.status !== 'obsoleto';
    const revisaoVigentePublicada = (revisoes || []).find((r) => r.status_final === 'publicado');
    const temArquivo = !!doc.arquivo_url;

    const modal = abrirModal(`${escapeHtml(doc.numero)} — ${escapeHtml(doc.nome)}`, `
      <div class="doc-secao-modal">
        <div class="doc-secao-modal-titulo">Identificação</div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
          <span class="badge ${BADGE_STATUS[doc.status] || 'badge-neutral'}">${STATUS[doc.status]}</span>
          <span class="badge ${doc.copia_controlada ? 'badge-success' : 'badge-danger'}">${doc.copia_controlada ? 'CÓPIA CONTROLADA' : 'CÓPIA NÃO CONTROLADA'}</span>
          <span class="text-muted"><b>Revisão:</b> ${String(doc.revisao_atual).padStart(2, '0')}</span>
        </div>
        <div class="text-muted">
          <b>Processo:</b> ${escapeHtml(nomeProcesso(doc.processo_id))}
          ${doc.procedimento_id ? ` &nbsp;|&nbsp; <b>Procedimento:</b> ${escapeHtml(documentos.find((d) => d.id === doc.procedimento_id)?.numero || '—')}` : ''}
          ${doc.it_id ? ` &nbsp;|&nbsp; <b>IT:</b> ${escapeHtml(documentos.find((d) => d.id === doc.it_id)?.numero || '—')}` : ''}
        </div>
        ${doc.status === 'publicado' && revisaoVigentePublicada ? `
          <p class="text-muted" style="margin-top:8px">Elaborado por ${escapeHtml(nomeUsuario(doc.elaborado_por))} · Aprovado por ${escapeHtml(nomeUsuario(doc.aprovado_por))} em ${formatarData(doc.data_publicacao)}</p>
        ` : ''}
        ${doc.status !== 'publicado' && revisaoVigentePublicada ? `<div class="alert alert-warning" style="margin-top:10px">Existe uma nova revisão em andamento. O conteúdo abaixo é o rascunho — a versão PUBLICADA vigente é a da tabela de histórico.</div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${temArquivo ? (podeEditar ? `
            <button class="btn btn-secondary btn-sm" id="dd-abrir-arquivo-topo" type="button"><i class="ti ti-external-link"></i> Abrir Arquivo</button>
          ` : `
            <button class="btn btn-secondary btn-sm" id="dd-visualizar-restrito-topo" type="button"><i class="ti ti-eye"></i> Visualizar</button>
          `) : (podeEditar ? `
            <button class="btn btn-secondary btn-sm" id="dd-visualizar-pdf" type="button"><i class="ti ti-file-type-pdf"></i> Visualizar PDF</button>
            <button class="btn btn-secondary btn-sm" id="dd-imprimir" type="button"><i class="ti ti-printer"></i> Imprimir</button>
          ` : '')}
          ${podeAlterarCopiaControlada ? `<button class="btn btn-secondary btn-sm" id="dd-alternar-copia-controlada" type="button">Marcar como ${doc.copia_controlada ? 'Cópia Não Controlada' : 'Cópia Controlada'}</button>` : ''}
        </div>
      </div>

      <div class="doc-secao-modal">
        <div class="doc-secao-modal-titulo">Conteúdo do Documento</div>
        <div id="dd-arquivo">
          ${temArquivo ? `
            <div class="form-group" style="margin-bottom:0">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span><i class="ti ti-file"></i> ${escapeHtml(doc.arquivo_nome || 'arquivo')} ${doc.arquivo_tamanho ? `(${formatarTamanho(doc.arquivo_tamanho)})` : ''}</span>
                ${podeEditar
                  ? `<button class="btn btn-secondary btn-sm" id="dd-baixar-arquivo" type="button"><i class="ti ti-download"></i> Abrir/Baixar</button>`
                  : `<button class="btn btn-secondary btn-sm" id="dd-visualizar-restrito" type="button"><i class="ti ti-eye"></i> Visualizar</button>`}
                ${emEdicao && podeEditar ? `<button class="btn btn-secondary btn-sm" id="dd-substituir-arquivo" type="button"><i class="ti ti-replace"></i> Substituir arquivo</button>` : ''}
              </div>
            </div>
          ` : `
            <div id="dd-secoes">
              ${secoes.map((s, idx) => `
                <div class="form-group">
                  <label>${idx + 1}. ${escapeHtml(s.toUpperCase())}</label>
                  <textarea data-secao="${idx}" ${emEdicao && podeEditar ? '' : 'readonly'} rows="3">${escapeHtml((doc.conteudo || {})[s] || '')}</textarea>
                </div>`).join('')}
            </div>
          `}
        </div>
      </div>

      ${ehRegistro(tipo) ? `
        <div class="doc-secao-modal">
          <div class="doc-secao-modal-titulo">Controle do Registro (ISO 9001 — cláusula 7.5.3.2)</div>
          <div class="form-row">
            <div class="form-group">
              <label>Tempo de retenção (meses)</label>
              <input type="number" id="dd-retencao" min="1" value="${doc.tempo_retencao_meses ?? ''}" ${podeEditar ? '' : 'readonly'}>
            </div>
            <div class="form-group">
              <label>Local de arquivamento</label>
              <input type="text" id="dd-local-armazenamento" value="${escapeHtml(doc.local_armazenamento || '')}" ${podeEditar ? '' : 'readonly'}>
            </div>
            <div class="form-group">
              <label>Forma de descarte</label>
              <input type="text" id="dd-forma-descarte" value="${escapeHtml(doc.forma_descarte || '')}" ${podeEditar ? '' : 'readonly'}>
            </div>
          </div>
          ${podeEditar ? `<button class="btn btn-secondary btn-sm" id="dd-salvar-retencao" type="button">Salvar controle do registro</button>` : ''}
        </div>
      ` : ''}

      <div id="dd-acoes" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"></div>

      <div class="doc-secao-modal" style="margin-bottom:0">
        <div class="doc-secao-modal-titulo">Histórico de Revisões</div>
        <table class="table">
          <thead><tr><th>Rev.</th><th>Data</th><th>Descrição</th><th>Situação</th><th></th></tr></thead>
          <tbody>
            ${(revisoes || []).length ? revisoes.map((r) => `
              <tr>
                <td>${String(r.numero_revisao).padStart(2, '0')}</td>
                <td>${formatarData(r.data)}</td>
                <td>${escapeHtml(r.descricao_alteracao)}</td>
                <td><span class="badge ${r.status_final === 'publicado' ? 'badge-success' : 'badge-neutral'}">${r.status_final === 'publicado' ? 'Vigente' : 'Obsoleta'}</span></td>
                <td>${r.arquivo_url && podeEditar ? `<button class="icon-btn" data-baixar-revisao="${r.id}" title="Abrir arquivo desta revisão"><i class="ti ti-file-download"></i></button>` : ''}</td>
              </tr>`).join('') : '<tr><td colspan="5" class="text-muted">Nenhuma revisão publicada ainda.</td></tr>'}
          </tbody>
        </table>
      </div>
    `);
    modal.classList.add('modal-xl');

    const btnAbrirArquivoTopo = modal.querySelector('#dd-abrir-arquivo-topo');
    if (btnAbrirArquivoTopo) btnAbrirArquivoTopo.addEventListener('click', () => abrirArquivoDocumento(state.supabase, doc.arquivo_url));

    const btnVisualizarRestritoTopo = modal.querySelector('#dd-visualizar-restrito-topo');
    if (btnVisualizarRestritoTopo) btnVisualizarRestritoTopo.addEventListener('click', () => visualizarArquivoRestrito(state.supabase, doc.arquivo_url, doc.arquivo_nome));

    const btnBaixarArquivo = modal.querySelector('#dd-baixar-arquivo');
    if (btnBaixarArquivo) btnBaixarArquivo.addEventListener('click', () => abrirArquivoDocumento(state.supabase, doc.arquivo_url));

    const btnVisualizarRestrito = modal.querySelector('#dd-visualizar-restrito');
    if (btnVisualizarRestrito) btnVisualizarRestrito.addEventListener('click', () => visualizarArquivoRestrito(state.supabase, doc.arquivo_url, doc.arquivo_nome));

    const btnSubstituirArquivo = modal.querySelector('#dd-substituir-arquivo');
    if (btnSubstituirArquivo) btnSubstituirArquivo.addEventListener('click', () => substituirArquivoDocumento(state, container, doc));

    const btnVisualizarPdf = modal.querySelector('#dd-visualizar-pdf');
    if (btnVisualizarPdf) btnVisualizarPdf.addEventListener('click', () => visualizarPdfDocumentoLegado(state, doc, revisoes, ctx));

    const btnImprimir = modal.querySelector('#dd-imprimir');
    if (btnImprimir) btnImprimir.addEventListener('click', () => imprimirDocumentoLegado(state, doc, revisoes, ctx));

    modal.querySelectorAll('[data-baixar-revisao]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rev = (revisoes || []).find((r) => r.id === btn.dataset.baixarRevisao);
        if (rev && rev.arquivo_url) abrirArquivoDocumento(state.supabase, rev.arquivo_url);
      });
    });

    const btnAlternarCopia = modal.querySelector('#dd-alternar-copia-controlada');
    if (btnAlternarCopia) btnAlternarCopia.addEventListener('click', async () => {
      const novoValor = !doc.copia_controlada;
      const { error } = await state.supabase.rpc('definir_copia_controlada', { p_documento_id: doc.id, p_controlada: novoValor });
      if (error) return toast('Erro ao alterar cópia controlada: ' + error.message, 'erro');
      toast(`Documento marcado como ${novoValor ? 'Cópia Controlada' : 'Cópia Não Controlada'}.`, 'sucesso');
      fecharModal();
      render(container, state);
    });

    const btnSalvarRetencao = modal.querySelector('#dd-salvar-retencao');
    if (btnSalvarRetencao) btnSalvarRetencao.addEventListener('click', async () => {
      const tempoRetencao = modal.querySelector('#dd-retencao').value;
      const localArmazenamento = modal.querySelector('#dd-local-armazenamento').value.trim();
      const formaDescarte = modal.querySelector('#dd-forma-descarte').value.trim();
      const { error } = await state.supabase.from('documentos').update({
        tempo_retencao_meses: tempoRetencao ? Number(tempoRetencao) : null,
        local_armazenamento: localArmazenamento || null,
        forma_descarte: formaDescarte || null,
      }).eq('id', doc.id);
      if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
      toast('Controle do registro atualizado.', 'sucesso');
      fecharModal();
      render(container, state);
    });

    const acoesEl = modal.querySelector('#dd-acoes');
    renderAcoes(state, container, modal, doc, ctx, acoesEl);
  });
}

async function substituirArquivoDocumento(state, container, doc) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPT_ARQUIVO;
  input.onchange = async () => {
    const arquivo = input.files[0];
    if (!arquivo) return;
    const { supabase } = state;
    try {
      const arquivoInfo = await uploadArquivoDocumento(supabase, doc.empresa_id, doc.id, arquivo);
      const arquivoAntigo = doc.arquivo_url;
      const { error } = await supabase.from('documentos').update({
        arquivo_url: arquivoInfo.arquivo_url,
        arquivo_nome: arquivoInfo.arquivo_nome,
        arquivo_tamanho: arquivoInfo.arquivo_tamanho,
      }).eq('id', doc.id);
      if (error) throw error;
      if (arquivoAntigo) await supabase.storage.from(BUCKET_ARQUIVOS).remove([arquivoAntigo]);
      toast('Arquivo substituído.', 'sucesso');
      fecharModal();
      render(container, state);
    } catch (err) {
      toast('Erro ao substituir arquivo: ' + err.message, 'erro');
    }
  };
  input.click();
}

function renderAcoes(state, container, modal, doc, ctx, acoesEl) {
  const { podeEditar, usuarios } = ctx;
  const { user } = state;
  const temArquivo = !!doc.arquivo_url;
  const botoes = [];

  if (podeEditar && !temArquivo && (doc.status === 'elaboracao' || doc.status === 'revisao')) {
    botoes.push('<button class="btn btn-secondary btn-sm" id="dd-salvar-rascunho">Salvar rascunho</button>');
  }
  if (podeEditar && (doc.status === 'elaboracao' || doc.status === 'revisao')) {
    botoes.push('<button class="btn btn-primary btn-sm" id="dd-enviar-aprovacao">Enviar para aprovação</button>');
  }
  if (doc.status === 'aprovacao' && (podeEditar || doc.aprovador_solicitado_id === user.id)) {
    botoes.push('<button class="btn btn-primary btn-sm" id="dd-aprovar">Aprovar e publicar</button>');
    botoes.push('<button class="btn btn-secondary btn-sm" id="dd-devolver">Devolver para elaboração</button>');
  }
  if (podeEditar && doc.status === 'publicado') {
    botoes.push('<button class="btn btn-secondary btn-sm" id="dd-nova-revisao">Editar (nova revisão)</button>');
  }
  const podeExcluir = ctx.podeExcluirSempre || (podeEditar && doc.status === 'elaboracao' && doc.revisao_atual === 0);
  if (podeExcluir) {
    botoes.push('<button class="btn btn-danger btn-sm" id="dd-excluir">Excluir</button>');
  }
  acoesEl.innerHTML = botoes.join(' ');

  const coletarConteudo = () => {
    const secoes = doc.tipos_documento.secoes || [];
    const resultado = {};
    modal.querySelectorAll('[data-secao]').forEach((el) => { resultado[secoes[Number(el.dataset.secao)]] = el.value; });
    return resultado;
  };

  const btnSalvar = acoesEl.querySelector('#dd-salvar-rascunho');
  if (btnSalvar) btnSalvar.addEventListener('click', async () => {
    const { error } = await state.supabase.from('documentos').update({ conteudo: coletarConteudo() }).eq('id', doc.id);
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    toast('Rascunho salvo.', 'sucesso');
    fecharModal();
    render(container, state);
  });

  const btnEnviar = acoesEl.querySelector('#dd-enviar-aprovacao');
  if (btnEnviar) btnEnviar.addEventListener('click', () => {
    const conteudo = temArquivo ? null : coletarConteudo();
    abrirModalEnviarAprovacao(state, container, doc, conteudo, usuarios);
  });

  const btnAprovar = acoesEl.querySelector('#dd-aprovar');
  if (btnAprovar) btnAprovar.addEventListener('click', () => abrirModalAprovar(state, container, doc));

  const btnDevolver = acoesEl.querySelector('#dd-devolver');
  if (btnDevolver) btnDevolver.addEventListener('click', async () => {
    if (!(await confirmar('Devolver este documento para Elaboração?'))) return;
    const { error } = await state.supabase.from('documentos').update({ status: 'elaboracao', aprovador_solicitado_id: null }).eq('id', doc.id);
    if (error) return toast('Erro: ' + error.message, 'erro');
    toast('Documento devolvido para elaboração.', 'sucesso');
    fecharModal();
    render(container, state);
  });

  const btnNovaRevisao = acoesEl.querySelector('#dd-nova-revisao');
  if (btnNovaRevisao) btnNovaRevisao.addEventListener('click', () => abrirModalNovaRevisao(state, container, doc));

  const btnExcluir = acoesEl.querySelector('#dd-excluir');
  if (btnExcluir) btnExcluir.addEventListener('click', async () => {
    const { supabase } = state;
    const { data: vinculados } = await supabase.from('documentos').select('numero, nome').or(`procedimento_id.eq.${doc.id},it_id.eq.${doc.id}`).neq('status', 'obsoleto');
    if (vinculados && vinculados.length) {
      return toast(`Não é possível excluir: há documentos vinculados (${vinculados.map((v) => escapeHtml(v.numero)).join(', ')}).`, 'erro');
    }
    if (!(await confirmar('Excluir este documento e todo o seu histórico de revisões? Esta ação não pode ser desfeita.'))) return;
    const { data: revisoesDoc } = await supabase.from('documentos_revisoes').select('arquivo_url').eq('documento_id', doc.id);
    const { error } = await supabase.from('documentos').delete().eq('id', doc.id);
    if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
    const arquivosParaRemover = [doc.arquivo_url, ...(revisoesDoc || []).map((r) => r.arquivo_url)].filter(Boolean);
    if (arquivosParaRemover.length) await supabase.storage.from(BUCKET_ARQUIVOS).remove(arquivosParaRemover);
    toast('Documento excluído.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}

function abrirModalEnviarAprovacao(state, container, doc, conteudo, usuarios) {
  const modal = abrirModal('Enviar para aprovação', `
    <form id="form-enviar-aprovacao">
      <div class="form-group">
        <label>Aprovador</label>
        <select id="ea-aprovador" required>
          <option value="">Selecione...</option>
          ${usuarios.filter((u) => u.ativo).map((u) => `<option value="${u.usuario_id}">${escapeHtml(u.nome || u.email)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Enviar</button>
    </form>
  `);

  modal.querySelector('#form-enviar-aprovacao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const aprovadorId = modal.querySelector('#ea-aprovador').value;
    if (aprovadorId === doc.elaborado_por) {
      if (!(await confirmar('Atenção: você está enviando para aprovação de um documento que você mesmo elaborou (ou selecionou a si mesmo como aprovador). Deseja continuar?'))) return;
    }
    const payload = { status: 'aprovacao', aprovador_solicitado_id: aprovadorId };
    if (conteudo) payload.conteudo = conteudo;
    const { error } = await state.supabase.from('documentos').update(payload).eq('id', doc.id);
    if (error) return toast('Erro: ' + error.message, 'erro');
    toast('Enviado para aprovação.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}

function abrirModalAprovar(state, container, doc) {
  const modal = abrirModal('Aprovar e publicar', `
    <p class="text-muted">Confirme sua senha para assinar eletronicamente a aprovação deste documento.</p>
    <form id="form-aprovar">
      <div class="form-group">
        <label>Sua senha</label>
        <input type="password" id="ap-senha" required autocomplete="current-password">
      </div>
      <button class="btn btn-primary btn-block" type="submit">Confirmar aprovação e publicar</button>
    </form>
  `);

  modal.querySelector('#form-aprovar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { supabase, user } = state;
    const senha = modal.querySelector('#ap-senha').value;
    const { error: errAuth } = await supabase.auth.signInWithPassword({ email: user.email, password: senha });
    if (errAuth) return toast('Senha incorreta.', 'erro');

    const alertaSegregacao = doc.aprovador_solicitado_id === doc.elaborado_por;
    const dadosParaHash = doc.arquivo_url
      ? { arquivo_url: doc.arquivo_url, arquivo_nome: doc.arquivo_nome, arquivo_tamanho: doc.arquivo_tamanho }
      : doc.conteudo;
    const hash = await hashConteudo(dadosParaHash);
    const nomeAprovador = user.user_metadata?.nome || user.email;
    const assinaturaAprovador = { usuario_id: user.id, nome: nomeAprovador, data_hora: new Date().toISOString(), hash_documento: hash };

    const { error: errUpd } = await supabase.from('documentos').update({
      status: 'publicado',
      aprovado_por: user.id,
      assinatura_aprovador: assinaturaAprovador,
      data_publicacao: new Date().toISOString(),
    }).eq('id', doc.id);
    if (errUpd) return toast('Erro ao publicar: ' + errUpd.message, 'erro');

    await supabase.from('documentos_revisoes')
      .update({ status_final: 'obsoleto' })
      .eq('documento_id', doc.id)
      .eq('status_final', 'publicado');

    const { error: errRev } = await supabase.from('documentos_revisoes').insert({
      documento_id: doc.id,
      numero_revisao: doc.revisao_atual,
      descricao_alteracao: doc.descricao_alteracao_pendente || 'Primeira emissão',
      conteudo_snapshot: dadosParaHash,
      arquivo_url: doc.arquivo_url || null,
      arquivo_nome: doc.arquivo_nome || null,
      elaborado_por: doc.elaborado_por,
      aprovado_por: user.id,
      status_final: 'publicado',
      exige_treinamento: doc.exige_treinamento,
      aprovacao_com_alerta_segregacao: alertaSegregacao,
    });
    if (errRev) return toast('Documento publicado, mas houve erro ao gravar o histórico: ' + errRev.message, 'erro');

    await supabase.from('documentos').update({ descricao_alteracao_pendente: null }).eq('id', doc.id);

    toast('Documento aprovado e publicado.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}

function abrirModalNovaRevisao(state, container, doc) {
  const modal = abrirModal('Iniciar nova revisão', `
    <form id="form-nova-revisao">
      <div class="form-group">
        <label>Descrição da alteração (obrigatório)</label>
        <textarea id="nr-descricao" required placeholder="O que está sendo alterado nesta revisão?"></textarea>
      </div>
      <div class="form-group">
        <label>Novo arquivo do documento (Word ou PDF) *</label>
        <input type="file" id="nr-arquivo" accept="${ACCEPT_ARQUIVO}" required>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Iniciar revisão ${String(doc.revisao_atual + 1).padStart(2, '0')}</button>
    </form>
  `);

  modal.querySelector('#form-nova-revisao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { supabase } = state;
    const descricao = modal.querySelector('#nr-descricao').value.trim();
    const arquivo = modal.querySelector('#nr-arquivo').files[0];
    if (!arquivo) return toast('Anexe o novo arquivo desta revisão.', 'erro');

    const btnSubmit = modal.querySelector('button[type="submit"]');
    btnSubmit.disabled = true;

    let arquivoInfo;
    try {
      arquivoInfo = await uploadArquivoDocumento(supabase, doc.empresa_id, doc.id, arquivo);
    } catch (err) {
      btnSubmit.disabled = false;
      return toast('Erro ao enviar arquivo: ' + err.message, 'erro');
    }

    const { error } = await supabase.from('documentos').update({
      status: 'elaboracao',
      revisao_atual: doc.revisao_atual + 1,
      descricao_alteracao_pendente: descricao,
      arquivo_url: arquivoInfo.arquivo_url,
      arquivo_nome: arquivoInfo.arquivo_nome,
      arquivo_tamanho: arquivoInfo.arquivo_tamanho,
    }).eq('id', doc.id);
    if (error) {
      await supabase.storage.from(BUCKET_ARQUIVOS).remove([arquivoInfo.arquivo_url]);
      btnSubmit.disabled = false;
      return toast('Erro: ' + error.message, 'erro');
    }
    toast('Nova revisão iniciada. O documento publicado continua vigente até você publicar a revisão nova.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}
