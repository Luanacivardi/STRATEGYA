import { abrirModal, fecharModal, toast, escapeHtml, confirmar, imprimirSecao } from '../ui.js';

export const STATUS = {
  elaboracao: 'Elaboração',
  revisao: 'Revisão',
  aprovacao: 'Aguardando Aprovação',
  publicado: 'Publicado',
  obsoleto: 'Obsoleto',
};

export const CLASSIFICACAO = {
  publico: 'Público',
  confidencial: 'Confidencial',
  restrito: 'Restrito',
};

let grupoAtivo = 'mestra'; // 'mestra' | 'aprovacoes' | 'obsoletos'
let filtros = { tipo: '', status: '', processo: '', classificacao: '' };

async function listarTiposDocumento(supabase) {
  const { data, error } = await supabase.from('tipos_documento').select('*').order('nome');
  if (error) throw error;
  return data;
}

async function listarProcessos(supabase, empresaId) {
  const { data, error } = await supabase
    .from('macrofluxo_processos')
    .select('id, nome')
    .eq('empresa_id', empresaId)
    .eq('tipo', 'principal')
    .order('nome');
  if (error) throw error;
  return data;
}

async function listarDocumentos(supabase, empresaId) {
  const { data, error } = await supabase
    .from('documentos')
    .select('*, tipos_documento(id, chave, nome, prefixo_numeracao, secoes, exige_processo, exige_procedimento, exige_aprovacao_alta_direcao)')
    .eq('empresa_id', empresaId);
  if (error) throw error;
  return data;
}

async function listarRevisoesObsoletas(supabase, empresaId) {
  const { data, error } = await supabase
    .from('documentos_revisoes')
    .select('*, documentos!inner(numero, nome, empresa_id, tipos_documento(nome))')
    .eq('documentos.empresa_id', empresaId)
    .eq('status_final', 'obsoleto')
    .order('data', { ascending: false });
  if (error) throw error;
  return data;
}

async function hashConteudo(conteudo) {
  const bytes = new TextEncoder().encode(JSON.stringify(conteudo || {}));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

export async function render(container, state) {
  const { supabase, empresaAtual, papelAtual } = state;
  const podeEditar = papelAtual !== 'usuario' || state.nivelEdicao === 'total';

  let tipos, processos, documentos, usuarios, revisoesObsoletas;
  try {
    [tipos, processos, documentos, usuarios, revisoesObsoletas] = await Promise.all([
      listarTiposDocumento(supabase),
      listarProcessos(supabase, empresaAtual.id),
      listarDocumentos(supabase, empresaAtual.id),
      supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }).then((r) => r.data || []),
      listarRevisoesObsoletas(supabase, empresaAtual.id),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar documentos: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const nomeUsuario = (id) => usuarios.find((u) => u.usuario_id === id)?.nome || usuarios.find((u) => u.usuario_id === id)?.email || '—';
  const nomeProcesso = (id) => processos.find((p) => p.id === id)?.nome || '—';
  const docsAtivos = documentos.filter((d) => d.status !== 'obsoleto');
  const docsAguardandoAprovacao = documentos.filter((d) => d.status === 'aprovacao');

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span><i class="ti ti-file-text"></i> Documentos</span>
        ${podeEditar ? '<button class="btn btn-primary btn-sm" id="btn-novo-documento"><i class="ti ti-plus"></i> Novo Documento</button>' : ''}
      </div>
      <div class="filters">
        <button class="filter-btn ${grupoAtivo === 'mestra' ? 'active' : ''}" data-grupo="mestra">Lista Mestra</button>
        <button class="filter-btn ${grupoAtivo === 'aprovacoes' ? 'active' : ''}" data-grupo="aprovacoes">Aguardando Aprovação ${docsAguardandoAprovacao.length ? `(${docsAguardandoAprovacao.length})` : ''}</button>
        <button class="filter-btn ${grupoAtivo === 'obsoletos' ? 'active' : ''}" data-grupo="obsoletos">Obsoletos</button>
      </div>
      <div id="documentos-corpo"></div>
    </div>
  `;

  const corpo = container.querySelector('#documentos-corpo');
  if (grupoAtivo === 'mestra') renderListaMestra(corpo, state, { tipos, processos, documentos: docsAtivos, usuarios, podeEditar, nomeUsuario, nomeProcesso });
  else if (grupoAtivo === 'aprovacoes') renderAprovacoes(corpo, state, { documentos: docsAguardandoAprovacao, usuarios, nomeUsuario });
  else renderObsoletos(corpo, { revisoes: revisoesObsoletas });

  container.querySelectorAll('[data-grupo]').forEach((btn) => {
    btn.addEventListener('click', () => { grupoAtivo = btn.dataset.grupo; render(container, state); });
  });

  const btnNovo = container.querySelector('#btn-novo-documento');
  if (btnNovo) btnNovo.addEventListener('click', () => abrirFormularioNovo(state, container, { tipos, processos, documentos }));
}

function renderListaMestra(corpo, state, { tipos, processos, documentos, usuarios, podeEditar, nomeUsuario, nomeProcesso }) {
  const filtrados = documentos.filter((d) =>
    (!filtros.tipo || d.tipo_documento_id === filtros.tipo) &&
    (!filtros.status || d.status === filtros.status) &&
    (!filtros.processo || d.processo_id === filtros.processo) &&
    (!filtros.classificacao || d.classificacao === filtros.classificacao)
  ).sort((a, b) => a.numero.localeCompare(b.numero));

  corpo.innerHTML = `
    <div class="form-row" style="margin:12px 0">
      <div class="form-group">
        <label>Tipo</label>
        <select id="dc-filtro-tipo">
          <option value="">Todos</option>
          ${tipos.map((t) => `<option value="${t.id}" ${filtros.tipo === t.id ? 'selected' : ''}>${escapeHtml(t.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="dc-filtro-status">
          <option value="">Todos</option>
          ${Object.entries(STATUS).filter(([k]) => k !== 'obsoleto').map(([k, v]) => `<option value="${k}" ${filtros.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Processo</label>
        <select id="dc-filtro-processo">
          <option value="">Todos</option>
          ${processos.map((p) => `<option value="${p.id}" ${filtros.processo === p.id ? 'selected' : ''}>${escapeHtml(p.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Classificação</label>
        <select id="dc-filtro-classificacao">
          <option value="">Todas</option>
          ${Object.entries(CLASSIFICACAO).map(([k, v]) => `<option value="${k}" ${filtros.classificacao === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <button class="btn btn-secondary btn-sm" id="dc-btn-csv"><i class="ti ti-download"></i> CSV</button>
      <button class="btn btn-secondary btn-sm" id="dc-btn-imprimir"><i class="ti ti-printer"></i> Imprimir</button>
    </div>
    ${filtrados.length ? `
      <table class="table">
        <thead><tr><th>Nº</th><th>Nome</th><th>Tipo</th><th>Rev.</th><th>Data</th><th>Status</th><th>Classificação</th><th></th></tr></thead>
        <tbody>
          ${filtrados.map((d) => `
            <tr>
              <td>${escapeHtml(d.numero)}</td>
              <td>${escapeHtml(d.nome)}</td>
              <td>${escapeHtml(d.tipos_documento.nome)}</td>
              <td>${String(d.revisao_atual).padStart(2, '0')}</td>
              <td>${formatarData(d.data_publicacao || d.created_at)}</td>
              <td><span class="badge">${STATUS[d.status]}</span></td>
              <td>${CLASSIFICACAO[d.classificacao]}</td>
              <td class="table-actions"><button class="icon-btn" data-abrir="${d.id}" title="Abrir"><i class="ti ti-eye"></i></button></td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<div class="empty-state"><i class="ti ti-file-text"></i>Nenhum documento cadastrado.</div>'}
  `;

  corpo.querySelector('#dc-filtro-tipo').addEventListener('change', (e) => { filtros.tipo = e.target.value; renderListaMestra(corpo, state, { tipos, processos, documentos, usuarios, podeEditar, nomeUsuario, nomeProcesso }); });
  corpo.querySelector('#dc-filtro-status').addEventListener('change', (e) => { filtros.status = e.target.value; renderListaMestra(corpo, state, { tipos, processos, documentos, usuarios, podeEditar, nomeUsuario, nomeProcesso }); });
  corpo.querySelector('#dc-filtro-processo').addEventListener('change', (e) => { filtros.processo = e.target.value; renderListaMestra(corpo, state, { tipos, processos, documentos, usuarios, podeEditar, nomeUsuario, nomeProcesso }); });
  corpo.querySelector('#dc-filtro-classificacao').addEventListener('change', (e) => { filtros.classificacao = e.target.value; renderListaMestra(corpo, state, { tipos, processos, documentos, usuarios, podeEditar, nomeUsuario, nomeProcesso }); });

  corpo.querySelector('#dc-btn-csv').addEventListener('click', () => exportarCsv(filtrados));
  corpo.querySelector('#dc-btn-imprimir').addEventListener('click', () => imprimirListaMestra(filtrados));

  corpo.querySelectorAll('[data-abrir]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const doc = documentos.find((d) => d.id === btn.dataset.abrir);
      abrirDetalhe(state, corpo.closest('#documentos-corpo').parentElement, doc, { tipos, processos, documentos, usuarios, podeEditar, nomeUsuario, nomeProcesso });
    });
  });
}

function exportarCsv(linhas) {
  const cabecalho = ['Nº', 'Nome', 'Tipo', 'Revisão', 'Data', 'Status', 'Classificação'];
  const escaparCsv = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const linhasCsv = linhas.map((d) => [
    d.numero, d.nome, d.tipos_documento.nome, String(d.revisao_atual).padStart(2, '0'),
    formatarData(d.data_publicacao || d.created_at), STATUS[d.status], CLASSIFICACAO[d.classificacao],
  ].map(escaparCsv).join(','));
  const csv = [cabecalho.map(escaparCsv).join(','), ...linhasCsv].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lista_mestra_documentos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function imprimirListaMestra(linhas) {
  imprimirSecao(`
    <h2>Lista Mestra de Documentos</h2>
    <table class="table">
      <thead><tr><th>Nº</th><th>Nome</th><th>Tipo</th><th>Rev.</th><th>Data</th><th>Status</th><th>Classificação</th></tr></thead>
      <tbody>
        ${linhas.map((d) => `<tr><td>${escapeHtml(d.numero)}</td><td>${escapeHtml(d.nome)}</td><td>${escapeHtml(d.tipos_documento.nome)}</td><td>${String(d.revisao_atual).padStart(2, '0')}</td><td>${formatarData(d.data_publicacao || d.created_at)}</td><td>${STATUS[d.status]}</td><td>${CLASSIFICACAO[d.classificacao]}</td></tr>`).join('')}
      </tbody>
    </table>
  `);
}

function renderAprovacoes(corpo, state, { documentos, usuarios, nomeUsuario }) {
  corpo.innerHTML = documentos.length ? `
    <table class="table">
      <thead><tr><th>Nº</th><th>Nome</th><th>Elaborado por</th><th>Aprovador solicitado</th><th></th></tr></thead>
      <tbody>
        ${documentos.map((d) => `
          <tr>
            <td>${escapeHtml(d.numero)}</td>
            <td>${escapeHtml(d.nome)}</td>
            <td>${escapeHtml(nomeUsuario(d.elaborado_por))}</td>
            <td>${escapeHtml(nomeUsuario(d.aprovador_solicitado_id))}</td>
            <td class="table-actions"><button class="icon-btn" data-abrir="${d.id}" title="Abrir"><i class="ti ti-eye"></i></button></td>
          </tr>`).join('')}
      </tbody>
    </table>` : '<div class="empty-state"><i class="ti ti-checkbox"></i>Nenhum documento aguardando aprovação.</div>';

  corpo.querySelectorAll('[data-abrir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const doc = documentos.find((d) => d.id === btn.dataset.abrir);
      const { supabase, empresaAtual } = state;
      const [tipos, processos, todos, usuariosResp] = await Promise.all([
        listarTiposDocumento(supabase),
        listarProcessos(supabase, empresaAtual.id),
        listarDocumentos(supabase, empresaAtual.id),
        supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }).then((r) => r.data || []),
      ]);
      const podeEditar = state.papelAtual !== 'usuario' || state.nivelEdicao === 'total';
      const nomeU = (id) => usuariosResp.find((u) => u.usuario_id === id)?.nome || usuariosResp.find((u) => u.usuario_id === id)?.email || '—';
      const nomeP = (id) => processos.find((p) => p.id === id)?.nome || '—';
      abrirDetalhe(state, corpo.closest('#documentos-corpo').parentElement, doc, { tipos, processos, documentos: todos, usuarios: usuariosResp, podeEditar, nomeUsuario: nomeU, nomeProcesso: nomeP });
    });
  });
}

function renderObsoletos(corpo, { revisoes }) {
  corpo.innerHTML = `
    <div class="alert alert-warning" style="text-align:center;font-weight:700">OBSOLETO — NÃO UTILIZAR</div>
    ${revisoes.length ? `
    <table class="table">
      <thead><tr><th>Nº</th><th>Nome</th><th>Tipo</th><th>Rev.</th><th>Data em que ficou obsoleto</th><th>Motivo</th></tr></thead>
      <tbody>
        ${revisoes.map((r) => `
          <tr>
            <td>${escapeHtml(r.documentos.numero)}</td>
            <td>${escapeHtml(r.documentos.nome)}</td>
            <td>${escapeHtml(r.documentos.tipos_documento.nome)}</td>
            <td>${String(r.numero_revisao).padStart(2, '0')}</td>
            <td>${formatarData(r.data)}</td>
            <td>${escapeHtml(r.descricao_alteracao)}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : '<div class="empty-state"><i class="ti ti-archive"></i>Nenhum documento obsoleto ainda.</div>'}
  `;
}

function abrirFormularioNovo(state, container, { tipos, documentos }) {
  const modal = abrirModal('Novo Documento', `
    <form id="form-novo-documento">
      <div class="form-group">
        <label>Tipo de Documento</label>
        <select id="nd-tipo" required>
          <option value="">Selecione...</option>
          ${tipos.map((t) => `<option value="${t.id}">${escapeHtml(t.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Nome</label>
        <input type="text" id="nd-nome" required>
      </div>
      <div id="nd-campos-condicionais"></div>
      <button class="btn btn-primary btn-block" type="submit">Criar rascunho</button>
    </form>
  `);

  const camposEl = modal.querySelector('#nd-campos-condicionais');

  modal.querySelector('#nd-tipo').addEventListener('change', async (e) => {
    const tipo = tipos.find((t) => t.id === e.target.value);
    if (!tipo) { camposEl.innerHTML = ''; return; }
    await renderCamposCondicionais(state, camposEl, tipo, documentos);
  });

  modal.querySelector('#form-novo-documento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { supabase, empresaAtual, user } = state;
    const tipoId = modal.querySelector('#nd-tipo').value;
    const tipo = tipos.find((t) => t.id === tipoId);
    if (!tipo) return toast('Selecione um tipo de documento.', 'erro');

    const processoId = modal.querySelector('#nd-processo')?.value || null;
    const procedimentoId = modal.querySelector('#nd-procedimento')?.value || null;
    const itId = modal.querySelector('#nd-it')?.value || null;
    const classificacao = modal.querySelector('#nd-classificacao')?.value || 'confidencial';

    if (tipo.exige_processo && !processoId) return toast('Este tipo de documento exige um Processo vinculado.', 'erro');
    if (tipo.exige_procedimento && !procedimentoId) return toast('Este tipo de documento exige um Procedimento vinculado.', 'erro');

    const payload = {
      empresa_id: empresaAtual.id,
      tipo_documento_id: tipoId,
      nome: modal.querySelector('#nd-nome').value.trim(),
      processo_id: processoId,
      procedimento_id: procedimentoId,
      it_id: itId,
      classificacao,
      elaborado_por: user.id,
      conteudo: Object.fromEntries((tipo.secoes || []).map((s) => [s, ''])),
    };

    const { error } = await supabase.from('documentos').insert(payload);
    if (error) return toast('Erro ao criar documento: ' + error.message, 'erro');
    toast('Documento criado em Elaboração.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}

async function renderCamposCondicionais(state, camposEl, tipo, documentos) {
  const { supabase, empresaAtual } = state;
  const processos = await listarProcessos(supabase, empresaAtual.id);
  const procedimentos = documentos.filter((d) => d.tipos_documento.chave === 'procedimento' && d.status !== 'obsoleto');
  const its = documentos.filter((d) => d.tipos_documento.chave === 'it' && d.status !== 'obsoleto');

  camposEl.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label>Processo${tipo.exige_processo ? ' *' : ''}</label>
        <select id="nd-processo" ${tipo.exige_processo ? 'required' : ''}>
          <option value="">—</option>
          ${processos.map((p) => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Procedimento${tipo.exige_procedimento ? ' *' : ''}</label>
        <select id="nd-procedimento" ${tipo.exige_procedimento ? 'required' : ''}>
          <option value="">—</option>
          ${procedimentos.map((p) => `<option value="${p.id}">${escapeHtml(p.numero)} - ${escapeHtml(p.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>IT (opcional)</label>
        <select id="nd-it">
          <option value="">—</option>
          ${its.map((i) => `<option value="${i.id}" data-procedimento="${i.procedimento_id || ''}">${escapeHtml(i.numero)} - ${escapeHtml(i.nome)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Classificação da Informação</label>
      <select id="nd-classificacao">
        ${Object.entries(CLASSIFICACAO).map(([k, v]) => `<option value="${k}" ${k === 'confidencial' ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </div>
  `;

  const selProcesso = camposEl.querySelector('#nd-processo');
  const selProcedimento = camposEl.querySelector('#nd-procedimento');
  const selIt = camposEl.querySelector('#nd-it');

  function filtrarItsPorProcedimento(procedimentoId) {
    [...selIt.options].forEach((opt) => {
      if (!opt.value) return;
      opt.hidden = procedimentoId ? opt.dataset.procedimento !== procedimentoId : false;
    });
  }

  selProcedimento.addEventListener('change', () => {
    const proc = procedimentos.find((p) => p.id === selProcedimento.value);
    if (proc && proc.processo_id) { selProcesso.value = proc.processo_id; }
    filtrarItsPorProcedimento(selProcedimento.value);
  });
}

function abrirDetalhe(state, container, doc, ctx) {
  const { tipos, processos, documentos, usuarios, podeEditar, nomeUsuario, nomeProcesso } = ctx;
  const tipo = doc.tipos_documento;
  const revisoesPromise = state.supabase.from('documentos_revisoes').select('*').eq('documento_id', doc.id).order('numero_revisao');

  revisoesPromise.then(({ data: revisoes }) => {
    const secoes = tipo.secoes || [];
    const emEdicao = doc.status !== 'publicado' && doc.status !== 'obsoleto';
    const revisaoVigentePublicada = (revisoes || []).find((r) => r.status_final === 'publicado');

    const modal = abrirModal(`${doc.numero} — ${escapeHtml(doc.nome)}`, `
      <div class="alert" style="margin-bottom:12px">
        <b>Status:</b> ${STATUS[doc.status]} &nbsp;|&nbsp; <b>Revisão:</b> ${String(doc.revisao_atual).padStart(2, '0')}
        &nbsp;|&nbsp; <b>Processo:</b> ${escapeHtml(nomeProcesso(doc.processo_id))}
        ${doc.procedimento_id ? `&nbsp;|&nbsp; <b>Procedimento:</b> ${escapeHtml(documentos.find((d) => d.id === doc.procedimento_id)?.numero || '—')}` : ''}
        ${doc.it_id ? `&nbsp;|&nbsp; <b>IT:</b> ${escapeHtml(documentos.find((d) => d.id === doc.it_id)?.numero || '—')}` : ''}
      </div>

      ${doc.status === 'publicado' && revisaoVigentePublicada ? `
        <p class="text-muted">Elaborado por ${escapeHtml(nomeUsuario(doc.elaborado_por))} · Aprovado por ${escapeHtml(nomeUsuario(doc.aprovado_por))} em ${formatarData(doc.data_publicacao)}</p>
      ` : ''}

      ${doc.status !== 'publicado' && revisaoVigentePublicada ? `<div class="alert alert-warning">Existe uma nova revisão em andamento. O conteúdo abaixo é o rascunho — a versão PUBLICADA vigente é a da tabela de histórico.</div>` : ''}

      <div id="dd-secoes">
        ${secoes.map((s, idx) => `
          <div class="form-group">
            <label>${escapeHtml(s)}</label>
            <textarea data-secao="${idx}" ${emEdicao && podeEditar ? '' : 'readonly'} rows="3">${escapeHtml((doc.conteudo || {})[s] || '')}</textarea>
          </div>`).join('')}
      </div>

      <div id="dd-acoes" style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0"></div>

      <h4>Histórico de Revisões</h4>
      <table class="table">
        <thead><tr><th>Rev.</th><th>Data</th><th>Descrição</th><th>Situação</th></tr></thead>
        <tbody>
          ${(revisoes || []).length ? revisoes.map((r) => `
            <tr>
              <td>${String(r.numero_revisao).padStart(2, '0')}</td>
              <td>${formatarData(r.data)}</td>
              <td>${escapeHtml(r.descricao_alteracao)}</td>
              <td><span class="badge">${r.status_final === 'publicado' ? 'Vigente' : 'Obsoleta'}</span></td>
            </tr>`).join('') : '<tr><td colspan="4" class="text-muted">Nenhuma revisão publicada ainda.</td></tr>'}
        </tbody>
      </table>
    `);

    const acoesEl = modal.querySelector('#dd-acoes');
    renderAcoes(state, container, modal, doc, ctx, acoesEl);
  });
}

function renderAcoes(state, container, modal, doc, ctx, acoesEl) {
  const { podeEditar, usuarios } = ctx;
  const { user } = state;
  const botoes = [];

  if (podeEditar && (doc.status === 'elaboracao' || doc.status === 'revisao')) {
    botoes.push('<button class="btn btn-secondary btn-sm" id="dd-salvar-rascunho">Salvar rascunho</button>');
    botoes.push('<button class="btn btn-primary btn-sm" id="dd-enviar-aprovacao">Enviar para aprovação</button>');
  }
  if (doc.status === 'aprovacao' && (podeEditar || doc.aprovador_solicitado_id === user.id)) {
    botoes.push('<button class="btn btn-primary btn-sm" id="dd-aprovar">Aprovar e publicar</button>');
    botoes.push('<button class="btn btn-secondary btn-sm" id="dd-devolver">Devolver para elaboração</button>');
  }
  if (podeEditar && doc.status === 'publicado') {
    botoes.push('<button class="btn btn-secondary btn-sm" id="dd-nova-revisao">Editar (nova revisão)</button>');
  }
  if (podeEditar && doc.status === 'elaboracao' && doc.revisao_atual === 0) {
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
    const conteudo = coletarConteudo();
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
      return toast(`Não é possível excluir: há documentos vinculados (${vinculados.map((v) => v.numero).join(', ')}).`, 'erro');
    }
    if (!(await confirmar('Excluir este documento? Esta ação não pode ser desfeita.'))) return;
    const { error } = await supabase.from('documentos').delete().eq('id', doc.id);
    if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
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
    const { error } = await state.supabase.from('documentos')
      .update({ conteudo, status: 'aprovacao', aprovador_solicitado_id: aprovadorId })
      .eq('id', doc.id);
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
    const hash = await hashConteudo(doc.conteudo);
    const nomeAprovador = user.user_metadata?.nome || user.email;
    const assinaturaAprovador = { usuario_id: user.id, nome: nomeAprovador, data_hora: new Date().toISOString(), hash_documento: hash };

    const { error: errUpd } = await supabase.from('documentos').update({
      status: 'publicado',
      aprovado_por: user.id,
      assinatura_aprovador: assinaturaAprovador,
      data_publicacao: new Date().toISOString(),
    }).eq('id', doc.id);
    if (errUpd) return toast('Erro ao publicar: ' + errUpd.message, 'erro');

    // A revisão "vigente" anterior (se houver) vira obsoleta; grava a nova como vigente.
    await supabase.from('documentos_revisoes')
      .update({ status_final: 'obsoleto' })
      .eq('documento_id', doc.id)
      .eq('status_final', 'publicado');

    const { error: errRev } = await supabase.from('documentos_revisoes').insert({
      documento_id: doc.id,
      numero_revisao: doc.revisao_atual,
      descricao_alteracao: doc.descricao_alteracao_pendente || 'Primeira emissão',
      conteudo_snapshot: doc.conteudo,
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
      <button class="btn btn-primary btn-block" type="submit">Iniciar revisão ${String(doc.revisao_atual + 1).padStart(2, '0')}</button>
    </form>
  `);

  modal.querySelector('#form-nova-revisao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const descricao = modal.querySelector('#nr-descricao').value.trim();
    const { error } = await state.supabase.from('documentos').update({
      status: 'elaboracao',
      revisao_atual: doc.revisao_atual + 1,
      descricao_alteracao_pendente: descricao,
    }).eq('id', doc.id);
    if (error) return toast('Erro: ' + error.message, 'erro');
    toast('Nova revisão iniciada. O documento publicado continua vigente até você publicar a revisão nova.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}
