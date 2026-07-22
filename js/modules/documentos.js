import { abrirModal, fecharModal, toast, escapeHtml, imprimirSecao, confirmar, resolverNivel, baixarCsv } from '../ui.js';
import { abrirDetalhe } from './documentosDetalhe.js';

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

// Arquivo DE TRABALHO (Word/ODT/PDF de rascunho) — só quem tem edição total acessa (Gestão de
// Documentos). Nunca é exposto à aba Documentos (visualização), nem a usuários sem edição.
export const BUCKET_ARQUIVOS = 'documentos-arquivos';
export const ACCEPT_ARQUIVO = '.doc,.docx,.odt,.pdf';

// PDF PUBLICADO — o que a aba Documentos mostra a todos os usuários da empresa, sempre em PDF.
// Gerado a partir do arquivo de trabalho (a própria pessoa exporta o Word como PDF e anexa aqui;
// se o arquivo de trabalho já for PDF, os dois apontam para o mesmo conteúdo, cada um em seu bucket).
export const BUCKET_PDF = 'documentos-publicados';
export const ACCEPT_PDF = '.pdf';

export function arquivoEhPdf(nome) {
  return (nome || '').toLowerCase().endsWith('.pdf');
}

let modoAtivo = 'caixas'; // 'caixas' (padrão, todos os usuários) | 'gestao' (lista mestra, só Qualidade/orbeex)
let familiaAtiva = 'documentos';
let grupoAtivo = 'mestra';
let filtros = { tipo: '', status: '', processo: '', classificacao: '' };

export function ehRegistro(tipo) {
  return tipo.chave === 'registro';
}

async function listarTiposDocumento(supabase) {
  const { data, error } = await supabase.from('tipos_documento').select('*').order('nome');
  if (error) throw error;
  return data;
}

// Todos os processos do Macrofluxo (principais e de apoio) — só a Direção fica de fora,
// porque não recebe documentos. Principais primeiro, na mesma ordenação da tela do Macrofluxo.
async function listarProcessos(supabase, empresaId) {
  const { data, error } = await supabase
    .from('macrofluxo_processos')
    .select('id, nome, numero, tipo, ordem, created_at')
    .eq('empresa_id', empresaId)
    .neq('tipo', 'direcao');
  if (error) throw error;
  return [...data].sort((a, b) => (a.tipo === b.tipo
    ? (a.ordem - b.ordem || a.created_at.localeCompare(b.created_at))
    : (a.tipo === 'principal' ? -1 : 1)));
}

// Rótulo do processo puxando o número cadastrado no Macrofluxo (ex: "3.1 - Compras"), quando existir.
function rotuloProcesso(p) {
  if (!p) return '—';
  return p.numero ? `${p.numero} - ${p.nome}` : p.nome;
}

const BADGE_STATUS = {
  elaboracao: 'badge-neutral',
  revisao: 'badge-warning',
  aprovacao: 'badge-warning',
  publicado: 'badge-success',
  obsoleto: 'badge-danger',
};

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
    .select('*, documentos!inner(numero, nome, empresa_id, tipos_documento(nome, chave))')
    .eq('documentos.empresa_id', empresaId)
    .eq('status_final', 'obsoleto')
    .order('data', { ascending: false });
  if (error) throw error;
  return data;
}

async function listarDepartamentos(supabase, empresaId) {
  const { data, error } = await supabase.from('departamentos').select('id, nome').eq('empresa_id', empresaId);
  if (error) throw error;
  return data;
}

function calcularPodeAlterarCopiaControlada(state, usuarios, departamentos) {
  if (state.papelAtual === 'orbeex') return true;
  const meu = usuarios.find((u) => u.usuario_id === state.user.id);
  if (!meu || !meu.departamento_id) return false;
  const dep = departamentos.find((d) => d.id === meu.departamento_id);
  return !!dep && dep.nome.trim().toLowerCase() === 'qualidade';
}

export async function hashConteudo(conteudo) {
  const bytes = new TextEncoder().encode(JSON.stringify(conteudo || {}));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Aprovar e publicar um documento. Regra: o aprovador designado pelo elaborador
// (aprovador_solicitado_id) sempre pode aprovar o próprio documento — qualquer usuário cadastrado
// serve, não precisa ter permissão de edição. Só a equipe da Qualidade (mesmo critério usado para
// cópia controlada: papel orbeex ou departamento Qualidade) pode aprovar EM NOME de outro usuário,
// e nesse caso é obrigada a registrar a justificativa. O controle de acesso de verdade acontece
// dentro da função aprovar_documento no banco (esta checagem aqui só decide o que mostrar na tela).
export function abrirModalAprovar(state, container, doc, ctx = {}) {
  const { podeAlterarCopiaControlada, nomeUsuario } = ctx;
  const souAprovadorDesignado = doc.aprovador_solicitado_id === state.user.id;
  const podeAprovarPorOutro = !souAprovadorDesignado && !!podeAlterarCopiaControlada;

  if (!souAprovadorDesignado && !podeAprovarPorOutro) {
    return toast('Você não é o aprovador designado deste documento. Apenas ele (ou a equipe da Qualidade, com justificativa) pode aprovar.', 'erro');
  }

  const nomeAprovadorDesignado = nomeUsuario ? nomeUsuario(doc.aprovador_solicitado_id) : '—';
  const modal = abrirModal('Aprovar e publicar', `
    ${podeAprovarPorOutro ? `
      <div class="alert alert-warning" style="margin-bottom:10px">
        <i class="ti ti-alert-triangle"></i>
        <span>Você está aprovando em nome de <strong>${escapeHtml(nomeAprovadorDesignado)}</strong>, o aprovador designado deste documento. Isso só deve ser feito pela equipe da Qualidade, em situações justificadas.</span>
      </div>
      <div class="form-group">
        <label>Justificativa (obrigatória)</label>
        <textarea id="ap-justificativa" required placeholder="Por que a Qualidade está aprovando no lugar do usuário designado?"></textarea>
      </div>
    ` : ''}
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
    if (doc.arquivo_url && !doc.arquivo_pdf_url) {
      fecharModal();
      return toast('Este documento ainda não tem o PDF de visualização anexado.', 'erro');
    }
    const justificativa = podeAprovarPorOutro ? modal.querySelector('#ap-justificativa').value.trim() : null;
    if (podeAprovarPorOutro && !justificativa) return toast('Informe a justificativa.', 'erro');

    const senha = modal.querySelector('#ap-senha').value;
    const { error: errAuth } = await supabase.auth.signInWithPassword({ email: user.email, password: senha });
    if (errAuth) return toast('Senha incorreta.', 'erro');

    const dadosParaHash = doc.arquivo_url
      ? { arquivo_url: doc.arquivo_url, arquivo_nome: doc.arquivo_nome, arquivo_tamanho: doc.arquivo_tamanho, arquivo_pdf_url: doc.arquivo_pdf_url }
      : doc.conteudo;
    const hash = await hashConteudo(dadosParaHash);

    const { error } = await supabase.rpc('aprovar_documento', {
      p_documento_id: doc.id,
      p_hash_documento: hash,
      p_justificativa: justificativa,
    });
    if (error) return toast('Erro ao aprovar: ' + error.message, 'erro');

    toast('Documento aprovado e publicado.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}

export function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function formatarTamanho(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function sanitizarNomeArquivo(nome) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function uploadArquivoDocumento(supabase, empresaId, documentoId, arquivo) {
  const nomeSanitizado = sanitizarNomeArquivo(arquivo.name);
  const caminho = empresaId + '/' + documentoId + '/' + Date.now() + '_' + nomeSanitizado;
  const { error } = await supabase.storage.from(BUCKET_ARQUIVOS).upload(caminho, arquivo);
  if (error) throw error;
  return { arquivo_url: caminho, arquivo_nome: arquivo.name, arquivo_tamanho: arquivo.size };
}

export async function uploadPdfDocumento(supabase, empresaId, documentoId, arquivo) {
  const nomeSanitizado = sanitizarNomeArquivo(arquivo.name);
  const caminho = empresaId + '/' + documentoId + '/' + Date.now() + '_' + nomeSanitizado;
  const { error } = await supabase.storage.from(BUCKET_PDF).upload(caminho, arquivo);
  if (error) throw error;
  return { arquivo_pdf_url: caminho, arquivo_pdf_nome: arquivo.name, arquivo_pdf_tamanho: arquivo.size };
}

export async function removerArquivosDocumento(supabase, { arquivo_url, arquivo_pdf_url } = {}) {
  if (arquivo_url) await supabase.storage.from(BUCKET_ARQUIVOS).remove([arquivo_url]);
  if (arquivo_pdf_url) await supabase.storage.from(BUCKET_PDF).remove([arquivo_pdf_url]);
}

// Abre/baixa o arquivo DE TRABALHO — só chamado a partir da Gestão de Documentos, para quem tem
// edição total (o bucket em si já recusa a leitura para qualquer outro perfil, ver migração 0060).
export async function abrirArquivoDocumento(supabase, caminho) {
  const { data, error } = await supabase.storage.from(BUCKET_ARQUIVOS).createSignedUrl(caminho, 300);
  if (error) return toast('Erro ao gerar link do arquivo: ' + error.message, 'erro');
  window.open(data.signedUrl, '_blank');
}

// Visualizador do PDF publicado — usado por TODOS os perfis (inclusive quem edita) sempre que o
// documento é aberto pela aba Documentos, e também pela Gestão de Documentos para quem não tem
// edição total. Renderiza o PDF em <canvas> (imagem rasterizada) em vez de um <iframe> com o link
// assinado: o link nunca fica exposto no DOM/rede como um endereço reaproveitável, e o conteúdo
// vira pixels (sem texto selecionável/copiável). Aviso importante: isto eleva bastante a barreira
// contra cópia casual, mas não é uma proteção real contra alguém tecnicamente decidido — captura
// de tela, impressão do sistema operacional ou inspeção da resposta de rede sempre continuam
// possíveis para quem já está autenticado e vendo o conteúdo na tela.
export async function abrirVisualizadorDocumento(state, doc, ctx = {}) {
  const { supabase } = state;
  const { nomeUsuario, nomeProcesso } = ctx;
  if (!doc.arquivo_pdf_url) {
    toast('Este documento ainda não tem uma versão em PDF publicada para visualização.', 'erro');
    return;
  }

  const linhaMeta = (label, valor) => `<div class="doc-visualizador-meta-item"><span>${escapeHtml(label)}</span><strong>${valor}</strong></div>`;
  const modal = abrirModal(`${escapeHtml(doc.numero)} — ${escapeHtml(doc.nome)}`, `
    <div class="doc-visualizador-meta">
      ${linhaMeta('Revisão', String(doc.revisao_atual).padStart(2, '0'))}
      ${linhaMeta('Classificação', escapeHtml(CLASSIFICACAO[doc.classificacao] || '—'))}
      ${nomeProcesso ? linhaMeta('Processo', escapeHtml(nomeProcesso(doc.processo_id))) : ''}
      ${nomeUsuario ? linhaMeta('Elaborado por', escapeHtml(nomeUsuario(doc.elaborado_por))) : ''}
      ${nomeUsuario ? linhaMeta('Aprovado por', doc.aprovado_por ? escapeHtml(nomeUsuario(doc.aprovado_por)) : '—') : ''}
      ${linhaMeta('Publicado em', formatarData(doc.data_publicacao))}
    </div>
    <div class="alert alert-info" style="margin:10px 0 12px">
      <i class="ti ti-shield-lock"></i>
      <span>Visualização controlada — o download deste documento não está disponível por aqui. Para obter o arquivo original, procure a Gestão de Documentos.</span>
    </div>
    <div id="doc-pdf-paginas" class="doc-pdf-paginas"><p class="text-muted">Carregando documento...</p></div>
  `);
  modal.classList.add('modal-xl');

  // Deterrente de UI (não é proteção real, ver aviso acima): bloqueia o menu de contexto e os
  // atalhos de salvar/imprimir enquanto o modal do documento está aberto.
  const bloquearAtalho = (e) => {
    if ((e.ctrlKey || e.metaKey) && ['s', 'p'].includes(e.key.toLowerCase())) e.preventDefault();
  };
  modal.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', bloquearAtalho);
  const pararDeBloquear = () => document.removeEventListener('keydown', bloquearAtalho);
  new MutationObserver((_, obs) => {
    if (!document.body.contains(modal)) { pararDeBloquear(); obs.disconnect(); }
  }).observe(document.getElementById('modal-overlay'), { childList: true });

  const area = modal.querySelector('#doc-pdf-paginas');
  try {
    const { data, error } = await supabase.storage.from(BUCKET_PDF).download(doc.arquivo_pdf_url);
    if (error) throw error;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    area.innerHTML = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.4 });
      const canvas = document.createElement('canvas');
      canvas.className = 'doc-pdf-pagina';
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      area.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
    if (!pdf.numPages) area.innerHTML = '<div class="empty-state"><i class="ti ti-file-off"></i>PDF vazio.</div>';
  } catch (err) {
    area.innerHTML = `<div class="alert alert-warning">Erro ao carregar o PDF: ${escapeHtml(err.message)}</div>`;
  }
}

export async function render(container, state) {
  const { supabase, empresaAtual, papelAtual } = state;
  const podeEditar = resolverNivel(state, 'documentos') === 'total';
  // Referência ao container raiz do módulo, para telas internas (detalhe do documento, formulário
  // de criação) conseguirem disparar um re-render completo depois de salvar, mesmo estando várias
  // camadas abaixo (visão em caixinhas ou Gestão de Documentos).
  state.__documentosTopContainer = container;

  let tipos, processos, documentos, usuarios, revisoesObsoletas, departamentos;
  try {
    [tipos, processos, documentos, usuarios, revisoesObsoletas, departamentos] = await Promise.all([
      listarTiposDocumento(supabase),
      listarProcessos(supabase, empresaAtual.id),
      listarDocumentos(supabase, empresaAtual.id),
      supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }).then((r) => r.data || []),
      listarRevisoesObsoletas(supabase, empresaAtual.id),
      listarDepartamentos(supabase, empresaAtual.id),
    ]);
  } catch (err) {
    container.innerHTML = '<div class="alert alert-warning">Erro ao carregar documentos: ' + escapeHtml(err.message) + '</div>';
    return;
  }

  const nomeUsuario = (id) => usuarios.find((u) => u.usuario_id === id)?.nome || usuarios.find((u) => u.usuario_id === id)?.email || '—';
  const nomeProcesso = (id) => rotuloProcesso(processos.find((p) => p.id === id));
  // "Gestão de Documentos" (lista mestra, edição, impressão) fica disponível só para quem também
  // pode alternar cópia controlada — ORBEEX ou setor Qualidade. Os demais usuários só enxergam a
  // visão de caixinhas por processo, sempre em modo leitura.
  const podeAlterarCopiaControlada = calcularPodeAlterarCopiaControlada(state, usuarios, departamentos);
  const mostrarGestao = podeAlterarCopiaControlada;
  if (!mostrarGestao) modoAtivo = 'caixas';
  // ADM e ORBEEX podem excluir documento em qualquer situação (além da regra normal: elaboração + revisão 0).
  const podeExcluirSempre = papelAtual === 'admin' || papelAtual === 'orbeex';

  const ctx = { tipos, processos, documentos, usuarios, revisoesObsoletas, nomeUsuario, nomeProcesso, podeEditar, podeAlterarCopiaControlada, podeExcluirSempre };

  container.innerHTML = `
    ${mostrarGestao ? `
      <nav class="tabs">
        <button class="tab-btn ${modoAtivo === 'caixas' ? 'active' : ''}" data-modo="caixas"><i class="ti ti-layout-grid"></i> Documentos</button>
        <button class="tab-btn ${modoAtivo === 'gestao' ? 'active' : ''}" data-modo="gestao"><i class="ti ti-settings"></i> Gestão de Documentos</button>
      </nav>` : ''}
    <div id="documentos-modo-area"></div>
  `;
  container.querySelectorAll('[data-modo]').forEach((btn) => {
    btn.addEventListener('click', () => { modoAtivo = btn.dataset.modo; render(container, state); });
  });

  const area = container.querySelector('#documentos-modo-area');
  if (modoAtivo === 'gestao' && mostrarGestao) renderGestaoDocumentos(area, state, ctx, container);
  else renderCaixas(area, state, ctx);
}

// ==================== VISÃO EM CAIXINHAS (padrão para todos os usuários) ====================
// Uma caixa por processo do Macrofluxo, com os documentos publicados daquele processo, mais uma
// caixa "Documentos Institucionais" para os que não têm processo vinculado (código de ética,
// manuais gerais etc — processo_id nulo). Cada caixa também mostra, quando houver, os documentos
// daquele processo aguardando aprovação.
// Monta a árvore Procedimento → Instrução de Trabalho → Registro (na ordem de numeração), com os
// demais tipos (manual, política...) soltos no topo — reflete o vínculo procedimento_id/it_id já
// existente no banco, em vez de tentar adivinhar a hierarquia só pelo texto do número.
function construirArvoreDocumentos(docs) {
  const porId = new Map(docs.map((d) => [d.id, d]));
  const porNumero = (a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true });
  const procedimentos = docs.filter((d) => d.tipos_documento.chave === 'procedimento').sort(porNumero);
  const soltos = docs.filter((d) => !porId.has(d.procedimento_id) && !porId.has(d.it_id) && d.tipos_documento.chave !== 'procedimento').sort(porNumero);

  const nivel = (doc, profundidade) => {
    const filhos = docs.filter((d) => d.procedimento_id === doc.id || d.it_id === doc.id).sort(porNumero);
    return [{ doc, profundidade }, ...filhos.flatMap((f) => nivel(f, profundidade + 1))];
  };

  return [...soltos.map((d) => ({ doc: d, profundidade: 0 })), ...procedimentos.flatMap((p) => nivel(p, 0))];
}

const ICONE_TIPO = { procedimento: 'ti-file-text', it: 'ti-list-details', registro: 'ti-clipboard-list' };

function renderCaixas(area, state, ctx) {
  const { processos, documentos, nomeUsuario } = ctx;

  const publicados = documentos.filter((d) => d.status === 'publicado');
  const pendentes = documentos.filter((d) => d.status === 'aprovacao');
  // Visível a todo mundo, independente de cargo ou departamento: os documentos que o próprio
  // usuário foi designado a aprovar (aprovador_solicitado_id) — é aqui que ele visualiza o PDF e
  // aprova/devolve, sem precisar de acesso à Gestão de Documentos.
  const minhasAprovacoes = pendentes.filter((d) => d.aprovador_solicitado_id === state.user.id);

  const caixaInstitucional = { id: null, nome: 'Documentos Institucionais', institucional: true };
  const caixas = [caixaInstitucional, ...processos];

  area.innerHTML = `
    ${minhasAprovacoes.length ? `
      <div class="card" style="margin-bottom:14px">
        <div class="card-header"><span><i class="ti ti-clock-exclamation"></i> Aguardando sua aprovação (${minhasAprovacoes.length})</span></div>
        <table class="table">
          <thead><tr><th>Nº</th><th>Nome</th><th>Elaborado por</th><th></th></tr></thead>
          <tbody>
            ${minhasAprovacoes.map((d) => `
              <tr>
                <td>${escapeHtml(d.numero)}</td>
                <td>${escapeHtml(d.nome)}</td>
                <td>${escapeHtml(nomeUsuario(d.elaborado_por))}</td>
                <td class="table-actions">
                  <button class="icon-btn" data-visualizar-aprovacao="${d.id}" title="Visualizar"><i class="ti ti-eye"></i></button>
                  <button class="btn btn-primary btn-sm" data-aprovar="${d.id}">Aprovar</button>
                  <button class="btn btn-secondary btn-sm" data-devolver="${d.id}">Devolver</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}
    <div class="doc-caixas-grid">
      ${caixas.map((p) => {
        const docsDaCaixa = publicados.filter((d) => (p.institucional ? d.processo_id === null : d.processo_id === p.id));
        const pendentesDaCaixa = pendentes.filter((d) => (p.institucional ? d.processo_id === null : d.processo_id === p.id));
        return `
        <button type="button" class="doc-caixa" data-abrir-caixa="${p.institucional ? 'institucional' : p.id}">
          <div class="doc-caixa-icone"><i class="ti ${p.institucional ? 'ti-building-bank' : 'ti-sitemap'}"></i></div>
          <div class="doc-caixa-nome">${escapeHtml(p.institucional ? p.nome : rotuloProcesso(p))}</div>
          <div class="doc-caixa-contagem">${docsDaCaixa.length} documento${docsDaCaixa.length === 1 ? '' : 's'}</div>
          ${pendentesDaCaixa.length ? `<span class="doc-caixa-badge-pendente"><i class="ti ti-clock-exclamation"></i> ${pendentesDaCaixa.length} pendente${pendentesDaCaixa.length === 1 ? '' : 's'}</span>` : ''}
        </button>`;
      }).join('')}
    </div>
  `;

  area.querySelectorAll('[data-visualizar-aprovacao]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const doc = documentos.find((d) => d.id === btn.dataset.visualizarAprovacao);
      abrirVisualizadorDocumento(state, doc, ctx);
    });
  });

  area.querySelectorAll('[data-aprovar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const doc = documentos.find((d) => d.id === btn.dataset.aprovar);
      abrirModalAprovar(state, state.__documentosTopContainer, doc, ctx);
    });
  });

  area.querySelectorAll('[data-devolver]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const doc = documentos.find((d) => d.id === btn.dataset.devolver);
      if (!(await confirmar(`Devolver "${doc.nome}" para elaboração?`))) return;
      const { error } = await state.supabase.rpc('devolver_documento_para_elaboracao', { p_documento_id: doc.id });
      if (error) return toast('Erro: ' + error.message, 'erro');
      toast('Documento devolvido para elaboração.', 'sucesso');
      render(state.__documentosTopContainer, state);
    });
  });

  area.querySelectorAll('[data-abrir-caixa]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chave = btn.dataset.abrirCaixa;
      const p = chave === 'institucional' ? caixaInstitucional : processos.find((x) => x.id === chave);
      const docsDaCaixa = publicados.filter((d) => (p.institucional ? d.processo_id === null : d.processo_id === p.id));
      const pendentesDaCaixa = pendentes.filter((d) => (p.institucional ? d.processo_id === null : d.processo_id === p.id));
      abrirModalDocumentosProcesso(state, ctx, p, docsDaCaixa, pendentesDaCaixa);
    });
  });
}

// A aba Documentos é só de visualização, para todo mundo (inclusive quem pode editar) — sem
// nenhum atalho para a ficha de edição aqui. Editar, aprovar e ver o histórico de revisões só
// acontece na Gestão de Documentos.
function abrirModalDocumentosProcesso(state, ctx, p, docsDaCaixa, pendentesDaCaixa) {
  const { documentos } = ctx;
  const arvore = construirArvoreDocumentos(docsDaCaixa);

  const linhaDoc = (doc, profundidade) => `
    <li style="padding-left:${profundidade * 20}px">
      <a href="#" data-ver-doc="${doc.id}"><i class="ti ${ICONE_TIPO[doc.tipos_documento.chave] || 'ti-file-text'}"></i> <span class="doc-modal-numero">${escapeHtml(doc.numero)}</span> ${escapeHtml(doc.nome)}</a>
    </li>`;

  const modal = abrirModal(p.institucional ? p.nome : rotuloProcesso(p), `
    ${pendentesDaCaixa.length ? `
      <div class="doc-caixa-pendente">
        <p class="doc-caixa-pendente-titulo"><i class="ti ti-clock-exclamation"></i> Pendente de aprovação (${pendentesDaCaixa.length})</p>
        <ul class="doc-caixa-lista">${pendentesDaCaixa.map((d) => `<li><a href="#" data-ver-doc="${d.id}">${escapeHtml(d.numero)} — ${escapeHtml(d.nome)}</a></li>`).join('')}</ul>
      </div>` : ''}
    ${arvore.length ? `<ul class="doc-caixa-lista doc-arvore">${arvore.map(({ doc, profundidade }) => linhaDoc(doc, profundidade)).join('')}</ul>` : '<div class="empty-state"><i class="ti ti-file-off"></i>Nenhum documento publicado ainda para este processo.</div>'}
  `);
  modal.classList.add('modal-xl');

  modal.querySelectorAll('[data-ver-doc]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const doc = documentos.find((d) => d.id === link.dataset.verDoc);
      if (!doc) return;
      abrirVisualizadorDocumento(state, doc, ctx);
    });
  });
}

function renderGestaoDocumentos(container, state, ctx, topContainer) {
  const { tipos, processos, documentos, usuarios, revisoesObsoletas, podeEditar, nomeUsuario, nomeProcesso, podeAlterarCopiaControlada, podeExcluirSempre } = ctx;

  const tiposFamilia = tipos.filter((t) => ehRegistro(t) === (familiaAtiva === 'registros'));
  const documentosFamilia = documentos.filter((d) => ehRegistro(d.tipos_documento) === (familiaAtiva === 'registros'));
  const docsAtivos = documentosFamilia.filter((d) => d.status !== 'obsoleto');
  const docsAguardandoAprovacao = documentosFamilia.filter((d) => d.status === 'aprovacao');
  const revisoesObsoletasFamilia = revisoesObsoletas.filter((r) => ehRegistro(r.documentos.tipos_documento) === (familiaAtiva === 'registros'));

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span><i class="ti ti-file-text"></i> Gestão de Documentos</span>
        ${podeEditar ? '<button class="btn btn-primary btn-sm" id="btn-novo-documento"><i class="ti ti-plus"></i> Novo</button>' : ''}
      </div>
      <nav class="tabs" style="margin-bottom:0">
        <button class="tab-btn ${familiaAtiva === 'documentos' ? 'active' : ''}" data-familia="documentos"><i class="ti ti-file-text"></i> Documentos (Procedimento, IT, Manual, Política)</button>
        <button class="tab-btn ${familiaAtiva === 'registros' ? 'active' : ''}" data-familia="registros"><i class="ti ti-clipboard-list"></i> Registros</button>
      </nav>
      <nav class="tabs">
        <button class="tab-btn ${grupoAtivo === 'mestra' ? 'active' : ''}" data-grupo="mestra"><i class="ti ti-list-details"></i> Lista Mestra</button>
        <button class="tab-btn ${grupoAtivo === 'aprovacoes' ? 'active' : ''}" data-grupo="aprovacoes"><i class="ti ti-checkbox"></i> Aguardando Aprovação ${docsAguardandoAprovacao.length ? '(' + docsAguardandoAprovacao.length + ')' : ''}</button>
        <button class="tab-btn ${grupoAtivo === 'obsoletos' ? 'active' : ''}" data-grupo="obsoletos"><i class="ti ti-archive"></i> Obsoletos</button>
        <button class="tab-btn ${grupoAtivo === 'monitoramento' ? 'active' : ''}" data-grupo="monitoramento"><i class="ti ti-chart-bar"></i> Monitoramento</button>
      </nav>
      <div id="documentos-corpo"></div>
    </div>
  `;

  const corpo = container.querySelector('#documentos-corpo');
  const rerender = () => render(topContainer, state);
  if (grupoAtivo === 'mestra') renderListaMestra(corpo, state, { tipos, processos, documentos: docsAtivos, usuarios, podeEditar, nomeUsuario, nomeProcesso, podeAlterarCopiaControlada, podeExcluirSempre, ehRegistros: familiaAtiva === 'registros' });
  else if (grupoAtivo === 'aprovacoes') renderAprovacoes(corpo, state, { documentos: docsAguardandoAprovacao, usuarios, nomeUsuario, podeAlterarCopiaControlada, podeExcluirSempre });
  else if (grupoAtivo === 'monitoramento') renderMonitoramento(corpo, { documentos, tipos, revisoesObsoletas }, (grupo) => { grupoAtivo = grupo; rerender(); });
  else renderObsoletos(corpo, { revisoes: revisoesObsoletasFamilia });

  container.querySelectorAll('[data-familia]').forEach((btn) => {
    btn.addEventListener('click', () => { familiaAtiva = btn.dataset.familia; grupoAtivo = 'mestra'; rerender(); });
  });

  container.querySelectorAll('[data-grupo]').forEach((btn) => {
    btn.addEventListener('click', () => { grupoAtivo = btn.dataset.grupo; rerender(); });
  });

  const btnNovo = container.querySelector('#btn-novo-documento');
  if (btnNovo) btnNovo.addEventListener('click', () => abrirFormularioNovo(state, topContainer, { tipos: tiposFamilia, processos, documentos }));
}

function renderListaMestra(corpo, state, { tipos, processos, documentos, usuarios, podeEditar, nomeUsuario, nomeProcesso, podeAlterarCopiaControlada, podeExcluirSempre, ehRegistros }) {
  const filtrados = documentos.filter((d) =>
    (!filtros.tipo || d.tipo_documento_id === filtros.tipo) &&
    (!filtros.status || d.status === filtros.status) &&
    (!filtros.processo || d.processo_id === filtros.processo) &&
    (!filtros.classificacao || d.classificacao === filtros.classificacao)
  ).sort((a, b) => a.numero.localeCompare(b.numero));

  const tiposFiltro = tipos.filter((t) => ehRegistro(t) === ehRegistros);

  corpo.innerHTML = `
    <div class="form-row" style="margin:12px 0">
      <div class="form-group">
        <label>Tipo</label>
        <select id="dc-filtro-tipo">
          <option value="">Todos</option>
          ${tiposFiltro.map((t) => `<option value="${t.id}" ${filtros.tipo === t.id ? 'selected' : ''}>${escapeHtml(t.nome)}</option>`).join('')}
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
          ${processos.map((p) => `<option value="${p.id}" ${filtros.processo === p.id ? 'selected' : ''}>${escapeHtml(rotuloProcesso(p))}</option>`).join('')}
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
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <span class="text-muted">${filtrados.length} ${ehRegistros ? 'registro(s)' : 'documento(s)'} encontrado(s)</span>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" id="dc-btn-csv"><i class="ti ti-download"></i> CSV</button>
        <button class="btn btn-secondary btn-sm" id="dc-btn-imprimir"><i class="ti ti-printer"></i> Imprimir</button>
      </div>
    </div>
    ${filtrados.length ? `
      <table class="table">
        <thead><tr>
          <th>Nº</th><th>Nome</th><th>Tipo</th><th>Processo</th><th>Rev.</th><th>Data</th><th>Status</th><th>Classificação</th>
          ${ehRegistros ? '<th>Retenção</th>' : ''}
          <th>Arquivo</th><th></th>
        </tr></thead>
        <tbody>
          ${filtrados.map((d) => `
            <tr>
              <td>${escapeHtml(d.numero)}</td>
              <td>${podeEditar && d.arquivo_url ? `<a href="#" class="dc-abrir-arquivo" data-abrir-arquivo="${d.id}" title="Abrir arquivo de trabalho"><i class="ti ti-file-text"></i>${escapeHtml(d.nome)}</a>` : escapeHtml(d.nome)}</td>
              <td>${escapeHtml(d.tipos_documento.nome)}</td>
              <td>${escapeHtml(nomeProcesso(d.processo_id))}</td>
              <td>${String(d.revisao_atual).padStart(2, '0')}</td>
              <td>${formatarData(d.data_publicacao || d.created_at)}</td>
              <td><span class="badge ${BADGE_STATUS[d.status] || 'badge-neutral'}">${STATUS[d.status]}</span></td>
              <td>${CLASSIFICACAO[d.classificacao]}</td>
              ${ehRegistros ? `<td>${d.tempo_retencao_meses ? d.tempo_retencao_meses + ' meses' : '—'}</td>` : ''}
              <td>
                ${d.arquivo_pdf_url ? `<button class="icon-btn" data-visualizar-pdf="${d.id}" title="Visualizar PDF"><i class="ti ti-eye"></i></button>` : ''}
                ${podeEditar && d.arquivo_url ? `<button class="icon-btn" data-baixar="${d.id}" title="Abrir arquivo de trabalho"><i class="ti ti-file-download"></i></button>` : ''}
                ${!d.arquivo_pdf_url && !d.arquivo_url ? '—' : ''}
              </td>
              <td class="table-actions"><button class="icon-btn" data-abrir="${d.id}" title="Abrir ficha"><i class="ti ti-file-info"></i></button></td>
            </tr>`).join('')}
        </tbody>
      </table>` : `<div class="empty-state"><i class="ti ti-file-text"></i>Nenhum ${ehRegistros ? 'registro' : 'documento'} cadastrado.</div>`}
  `;

  const rerender = () => renderListaMestra(corpo, state, { tipos, processos, documentos, usuarios, podeEditar, nomeUsuario, nomeProcesso, podeAlterarCopiaControlada, podeExcluirSempre, ehRegistros });
  corpo.querySelector('#dc-filtro-tipo').addEventListener('change', (e) => { filtros.tipo = e.target.value; rerender(); });
  corpo.querySelector('#dc-filtro-status').addEventListener('change', (e) => { filtros.status = e.target.value; rerender(); });
  corpo.querySelector('#dc-filtro-processo').addEventListener('change', (e) => { filtros.processo = e.target.value; rerender(); });
  corpo.querySelector('#dc-filtro-classificacao').addEventListener('change', (e) => { filtros.classificacao = e.target.value; rerender(); });

  corpo.querySelector('#dc-btn-csv').addEventListener('click', () => exportarCsv(filtrados, ehRegistros));
  corpo.querySelector('#dc-btn-imprimir').addEventListener('click', () => imprimirListaMestra(filtrados, ehRegistros));

  corpo.querySelectorAll('[data-baixar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const doc = documentos.find((d) => d.id === btn.dataset.baixar);
      abrirArquivoDocumento(state.supabase, doc.arquivo_url);
    });
  });

  corpo.querySelectorAll('[data-abrir-arquivo]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const doc = documentos.find((d) => d.id === link.dataset.abrirArquivo);
      abrirArquivoDocumento(state.supabase, doc.arquivo_url);
    });
  });

  corpo.querySelectorAll('[data-visualizar-pdf]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const doc = documentos.find((d) => d.id === btn.dataset.visualizarPdf);
      abrirVisualizadorDocumento(state, doc, { nomeUsuario, nomeProcesso });
    });
  });

  corpo.querySelectorAll('[data-abrir]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const doc = documentos.find((d) => d.id === btn.dataset.abrir);
      abrirDetalhe(state, state.__documentosTopContainer, doc, { tipos, processos, documentos, usuarios, podeEditar, nomeUsuario, nomeProcesso, podeAlterarCopiaControlada, podeExcluirSempre });
    });
  });
}

function exportarCsv(linhas, ehRegistros) {
  const cabecalho = ['Nº', 'Nome', 'Tipo', 'Revisão', 'Data', 'Status', 'Classificação'].concat(ehRegistros ? ['Retenção (meses)', 'Local de Arquivamento'] : []).concat(['Arquivo']);
  const linhasValores = linhas.map((d) => [
    d.numero, d.nome, d.tipos_documento.nome, String(d.revisao_atual).padStart(2, '0'),
    formatarData(d.data_publicacao || d.created_at), STATUS[d.status], CLASSIFICACAO[d.classificacao],
  ].concat(ehRegistros ? [d.tempo_retencao_meses || '', d.local_armazenamento || ''] : []).concat([d.arquivo_nome || '']));
  const nomeArquivo = 'lista_mestra_' + (ehRegistros ? 'registros' : 'documentos') + '_' + new Date().toISOString().slice(0, 10) + '.csv';
  baixarCsv(nomeArquivo, cabecalho, linhasValores);
}

function imprimirListaMestra(linhas, ehRegistros) {
  imprimirSecao(`
    <h2>Lista Mestra de ${ehRegistros ? 'Registros' : 'Documentos'}</h2>
    <table class="table">
      <thead><tr>
        <th>Nº</th><th>Nome</th><th>Tipo</th><th>Rev.</th><th>Data</th><th>Status</th><th>Classificação</th>
        ${ehRegistros ? '<th>Retenção</th>' : ''}
      </tr></thead>
      <tbody>
        ${linhas.map((d) => `<tr>
          <td>${escapeHtml(d.numero)}</td><td>${escapeHtml(d.nome)}</td><td>${escapeHtml(d.tipos_documento.nome)}</td>
          <td>${String(d.revisao_atual).padStart(2, '0')}</td><td>${formatarData(d.data_publicacao || d.created_at)}</td>
          <td>${STATUS[d.status]}</td><td>${CLASSIFICACAO[d.classificacao]}</td>
          ${ehRegistros ? `<td>${d.tempo_retencao_meses ? d.tempo_retencao_meses + ' meses' : '—'}</td>` : ''}
        </tr>`).join('')}
      </tbody>
    </table>
  `);
}

function renderAprovacoes(corpo, state, { documentos, usuarios, nomeUsuario, podeAlterarCopiaControlada, podeExcluirSempre }) {
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
      const podeEditar = resolverNivel(state, 'documentos') === 'total';
      const nomeU = (id) => usuariosResp.find((u) => u.usuario_id === id)?.nome || usuariosResp.find((u) => u.usuario_id === id)?.email || '—';
      const nomeP = (id) => rotuloProcesso(processos.find((p) => p.id === id));
      abrirDetalhe(state, corpo.closest('#documentos-corpo').parentElement, doc, { tipos, processos, documentos: todos, usuarios: usuariosResp, podeEditar, nomeUsuario: nomeU, nomeProcesso: nomeP, podeAlterarCopiaControlada, podeExcluirSempre });
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

// Aba "Monitoramento": visão geral (documentos + registros, das duas famílias) para gestão da Qualidade.
function renderMonitoramento(corpo, { documentos, revisoesObsoletas }, irPara) {
  const naoObsoletos = documentos.filter((d) => d.status !== 'obsoleto');
  const totalDocumentos = naoObsoletos.filter((d) => !ehRegistro(d.tipos_documento)).length;
  const totalRegistros = naoObsoletos.filter((d) => ehRegistro(d.tipos_documento)).length;
  const emElaboracao = naoObsoletos.filter((d) => d.status === 'elaboracao' || d.status === 'revisao').length;
  const aguardandoAprovacao = naoObsoletos.filter((d) => d.status === 'aprovacao').length;
  const publicados = naoObsoletos.filter((d) => d.status === 'publicado').length;
  const totalObsoletos = documentos.filter((d) => d.status === 'obsoleto').length;

  const hoje = new Date();
  const calcularVencimento = (d) => {
    const base = new Date(d.data_publicacao || d.created_at);
    const vencimento = new Date(base);
    vencimento.setMonth(vencimento.getMonth() + d.tempo_retencao_meses);
    return { base, vencimento, dias: Math.round((vencimento - hoje) / (1000 * 60 * 60 * 24)) };
  };
  const registrosVencendo = naoObsoletos
    .filter((d) => ehRegistro(d.tipos_documento) && d.tempo_retencao_meses && (d.data_publicacao || d.created_at))
    .map((d) => Object.assign({ doc: d }, calcularVencimento(d)))
    .filter((r) => r.dias <= 60)
    .sort((a, b) => a.dias - b.dias);

  const semaforo = (dias) => (dias < 0 ? 'vermelho' : dias <= 30 ? 'amarelo' : 'verde');

  corpo.innerHTML = `
    <div class="dashboard-grid">
      <div class="dashboard-card" data-atalho="mestra"><div class="dashboard-card-label">Documentos ativos</div><div class="dashboard-card-value">${totalDocumentos}</div></div>
      <div class="dashboard-card" data-atalho="mestra"><div class="dashboard-card-label">Registros ativos</div><div class="dashboard-card-value">${totalRegistros}</div></div>
      <div class="dashboard-card" data-atalho="mestra"><div class="dashboard-card-label">Em elaboração/revisão</div><div class="dashboard-card-value">${emElaboracao}</div></div>
      <div class="dashboard-card" data-atalho="aprovacoes"><div class="dashboard-card-label">Aguardando aprovação</div><div class="dashboard-card-value">${aguardandoAprovacao}</div></div>
      <div class="dashboard-card" data-atalho="mestra"><div class="dashboard-card-label">Publicados</div><div class="dashboard-card-value">${publicados}</div></div>
      <div class="dashboard-card" data-atalho="obsoletos"><div class="dashboard-card-label">Obsoletos (histórico)</div><div class="dashboard-card-value">${totalObsoletos}</div></div>
    </div>

    <h4>Registros com retenção vencendo em até 60 dias (ISO 9001 — cláusula 7.5.3.2)</h4>
    ${registrosVencendo.length ? `
      <table class="table">
        <thead><tr><th>Nº</th><th>Nome</th><th>Emissão</th><th>Retenção</th><th>Vencimento</th><th>Situação</th></tr></thead>
        <tbody>
          ${registrosVencendo.map((r) => `
            <tr>
              <td>${escapeHtml(r.doc.numero)}</td>
              <td>${escapeHtml(r.doc.nome)}</td>
              <td>${formatarData(r.base.toISOString())}</td>
              <td>${r.doc.tempo_retencao_meses} meses</td>
              <td>${formatarData(r.vencimento.toISOString())}</td>
              <td><span class="semaforo-dot semaforo-${semaforo(r.dias)}"></span>${r.dias < 0 ? 'Vencido' : r.dias + ' dia(s)'}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<div class="empty-state"><i class="ti ti-clock"></i>Nenhum registro com retenção vencendo em breve.</div>'}
  `;

  corpo.querySelectorAll('[data-atalho]').forEach((el) => {
    el.addEventListener('click', () => irPara(el.dataset.atalho));
  });
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
      <div class="form-group">
        <label>Numeração</label>
        <select id="nd-modo-numeracao">
          <option value="automatica">Automática — o sistema gera o próximo número (padrão P-01 / IT-01.01 / RG-01.01.01)</option>
          <option value="propria">Própria — a empresa já possui numeração vigente</option>
        </select>
      </div>
      <div class="form-group" id="nd-grupo-numero-proprio" style="display:none">
        <label>Número do documento (numeração vigente da empresa) *</label>
        <input type="text" id="nd-numero-proprio" placeholder="Ex: PQ-051, IT 7.3-02, FOR-123...">
        <p class="text-muted" style="font-size:12px;margin-top:4px">O número é mantido exatamente como digitado — o controle de revisão, aprovação e lista mestra funciona normalmente.</p>
      </div>
      <div class="form-group">
        <label>Arquivo de trabalho (Word ou PDF) *</label>
        <input type="file" id="nd-arquivo" accept="${ACCEPT_ARQUIVO}" required>
        <p class="text-muted" style="font-size:12px;margin-top:4px">Fica disponível só na Gestão de Documentos, para quem edita.</p>
      </div>
      <div class="form-group" id="nd-grupo-pdf" style="display:none">
        <label>PDF para visualização *</label>
        <input type="file" id="nd-arquivo-pdf" accept="${ACCEPT_PDF}">
        <p class="text-muted" style="font-size:12px;margin-top:4px">Exporte o arquivo de trabalho como PDF (Word: Arquivo &gt; Salvar como &gt; PDF) e anexe aqui — é o que todos os usuários verão na aba Documentos.</p>
      </div>
      <div id="nd-campos-condicionais"></div>
      <button class="btn btn-primary btn-block" type="submit">Criar rascunho</button>
    </form>
  `);

  const camposEl = modal.querySelector('#nd-campos-condicionais');

  modal.querySelector('#nd-modo-numeracao').addEventListener('change', (e) => {
    modal.querySelector('#nd-grupo-numero-proprio').style.display = e.target.value === 'propria' ? '' : 'none';
  });

  // Se o arquivo de trabalho já for PDF, o mesmo arquivo serve para visualização — não precisa
  // pedir um segundo upload. Só pede o PDF em separado quando o arquivo de trabalho é Word/ODT.
  modal.querySelector('#nd-arquivo').addEventListener('change', (e) => {
    const arquivo = e.target.files[0];
    const precisaPdf = arquivo && !arquivoEhPdf(arquivo.name);
    const grupoPdf = modal.querySelector('#nd-grupo-pdf');
    grupoPdf.style.display = precisaPdf ? '' : 'none';
    modal.querySelector('#nd-arquivo-pdf').required = precisaPdf;
  });

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

    const arquivo = modal.querySelector('#nd-arquivo').files[0];
    if (!arquivo) return toast('Anexe o arquivo de trabalho do documento (Word ou PDF).', 'erro');
    const arquivoJaEhPdf = arquivoEhPdf(arquivo.name);
    const arquivoPdf = modal.querySelector('#nd-arquivo-pdf').files[0];
    if (!arquivoJaEhPdf && !arquivoPdf) return toast('Anexe também o PDF para visualização (obrigatório quando o arquivo de trabalho não é PDF).', 'erro');

    // Numeração própria: mantém o número vigente da empresa (o gatilho do banco só gera número
    // automático quando o campo vem vazio). Valida duplicidade dentro da empresa antes de criar.
    let numeroProprio = null;
    if (modal.querySelector('#nd-modo-numeracao').value === 'propria') {
      numeroProprio = modal.querySelector('#nd-numero-proprio').value.trim();
      if (!numeroProprio) return toast('Informe o número do documento (numeração vigente da empresa).', 'erro');
      const jaExiste = documentos.some((d) => d.status !== 'obsoleto' && (d.numero || '').trim().toLowerCase() === numeroProprio.toLowerCase());
      if (jaExiste) return toast(`Já existe um documento ativo com o número "${escapeHtml(numeroProprio)}" nesta empresa.`, 'erro');
    }

    const processoId = modal.querySelector('#nd-processo')?.value || null;
    const procedimentoId = modal.querySelector('#nd-procedimento')?.value || null;
    const itId = modal.querySelector('#nd-it')?.value || null;
    const classificacao = modal.querySelector('#nd-classificacao')?.value || 'confidencial';

    if (tipo.exige_processo && !processoId) return toast('Este tipo de documento exige um Processo vinculado.', 'erro');
    // O vínculo obrigatório com Procedimento existe para montar a numeração hierárquica automática;
    // com numeração própria da empresa ele passa a ser opcional (mas continua recomendado).
    if (tipo.exige_procedimento && !procedimentoId && !numeroProprio) return toast('Este tipo de documento exige um Procedimento vinculado.', 'erro');

    let tempoRetencao = null, localArmazenamento = null, formaDescarte = null;
    if (ehRegistro(tipo)) {
      tempoRetencao = modal.querySelector('#nd-retencao')?.value;
      localArmazenamento = modal.querySelector('#nd-local-armazenamento')?.value?.trim();
      formaDescarte = modal.querySelector('#nd-forma-descarte')?.value?.trim() || null;
      if (!tempoRetencao) return toast('Informe o tempo de retenção do registro (cláusula 7.5.3.2 da ISO 9001).', 'erro');
      if (!localArmazenamento) return toast('Informe o local de arquivamento do registro.', 'erro');
    }

    const btnSubmit = modal.querySelector('button[type="submit"]');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Enviando arquivo...';

    const novoId = crypto.randomUUID();
    let arquivoInfo, pdfInfo;
    try {
      arquivoInfo = await uploadArquivoDocumento(supabase, empresaAtual.id, novoId, arquivo);
      pdfInfo = arquivoJaEhPdf
        ? await uploadPdfDocumento(supabase, empresaAtual.id, novoId, arquivo)
        : await uploadPdfDocumento(supabase, empresaAtual.id, novoId, arquivoPdf);
    } catch (err) {
      await removerArquivosDocumento(supabase, { arquivo_url: arquivoInfo?.arquivo_url, arquivo_pdf_url: pdfInfo?.arquivo_pdf_url });
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Criar rascunho';
      return toast('Erro ao enviar arquivo: ' + err.message, 'erro');
    }

    const payload = Object.assign({
      id: novoId,
      empresa_id: empresaAtual.id,
      tipo_documento_id: tipoId,
      numero: numeroProprio, // null = numeração automática pelo gatilho do banco
      nome: modal.querySelector('#nd-nome').value.trim(),
      processo_id: processoId,
      procedimento_id: procedimentoId,
      it_id: itId,
      classificacao,
      elaborado_por: user.id,
      arquivo_url: arquivoInfo.arquivo_url,
      arquivo_nome: arquivoInfo.arquivo_nome,
      arquivo_tamanho: arquivoInfo.arquivo_tamanho,
      arquivo_pdf_url: pdfInfo.arquivo_pdf_url,
      arquivo_pdf_nome: pdfInfo.arquivo_pdf_nome,
      arquivo_pdf_tamanho: pdfInfo.arquivo_pdf_tamanho,
    }, ehRegistro(tipo) ? {
      tempo_retencao_meses: Number(tempoRetencao),
      local_armazenamento: localArmazenamento,
      forma_descarte: formaDescarte,
    } : {});

    const { error } = await supabase.from('documentos').insert(payload);
    if (error) {
      await removerArquivosDocumento(supabase, { arquivo_url: arquivoInfo.arquivo_url, arquivo_pdf_url: pdfInfo.arquivo_pdf_url });
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Criar rascunho';
      return toast('Erro ao criar documento: ' + error.message, 'erro');
    }
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
          ${processos.map((p) => `<option value="${p.id}">${escapeHtml(rotuloProcesso(p))}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Procedimento${tipo.exige_procedimento ? ' *' : ''}</label>
        <select id="nd-procedimento" ${tipo.exige_procedimento ? 'required' : ''}>
          <option value="">—</option>
          ${procedimentos.map((p) => `<option value="${p.id}">${escapeHtml(p.numero)} - ${escapeHtml(p.nome)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>IT ${tipo.chave === 'registro' ? 'vinculada (recomendado para a numeração hierárquica)' : '(opcional)'}</label>
      <select id="nd-it">
        <option value="">—</option>
        ${its.map((i) => `<option value="${i.id}" data-procedimento="${i.procedimento_id || ''}">${escapeHtml(i.numero)} - ${escapeHtml(i.nome)}</option>`).join('')}
      </select>
    </div>
    ${tipo.chave === 'registro' ? `
      <div class="form-row">
        <div class="form-group">
          <label>Tempo de retenção (meses) *</label>
          <input type="number" id="nd-retencao" min="1" required>
        </div>
        <div class="form-group">
          <label>Local de arquivamento *</label>
          <input type="text" id="nd-local-armazenamento" required placeholder="Ex: Pasta física — Arquivo Qualidade">
        </div>
        <div class="form-group">
          <label>Forma de descarte</label>
          <input type="text" id="nd-forma-descarte" placeholder="Ex: Trituração após o prazo de retenção">
        </div>
      </div>
    ` : ''}
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
    if (!selIt) return;
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
