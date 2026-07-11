import { abrirModal, fecharModal, toast, escapeHtml, confirmar, dataValida, enviarPorEmail, imprimirSecao } from '../ui.js';
import { listarObjetivos } from './objetivos.js';
import * as todo from './todo.js';

const STATUS_LABEL = { nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento', concluido: 'Concluído', atrasado: 'Atrasado' };
const ORIGEM_LABEL = { objetivo: 'Objetivo', indicador: 'Indicador', risco: 'Risco/Oportunidade', nc: 'Não Conformidade', rac: 'Ata de Reunião' };

let filtroOrigemObjetivo = null; // quando vem da tela de Objetivos, já chega filtrado
let grupoAtivo = 'planos'; // 'planos' | 'todo'

export function definirFiltroObjetivo(objetivoId) {
  filtroOrigemObjetivo = objetivoId;
  grupoAtivo = 'planos';
}

// Permite navegar direto para um grupo (ex: atalho do Dashboard para Tarefas).
export function irParaGrupo(grupo) {
  grupoAtivo = grupo;
}

function renderFiltrosGrupo() {
  return `
    <div class="filters">
      <button class="filter-btn ${grupoAtivo === 'planos' ? 'active' : ''}" data-grupo="planos">Planos de Ação</button>
      <button class="filter-btn ${grupoAtivo === 'todo' ? 'active' : ''}" data-grupo="todo">Tarefas</button>
    </div>`;
}

function wireFiltrosGrupo(container, state) {
  container.querySelectorAll('[data-grupo]').forEach((btn) => {
    btn.addEventListener('click', () => { grupoAtivo = btn.dataset.grupo; render(container, state); });
  });
}

async function carregarOrigens(supabase, empresaId) {
  const [objetivos, { data: indicadoresData }, { data: riscosData }, { data: atasData }] = await Promise.all([
    listarObjetivos(supabase, empresaId),
    supabase.from('indicadores').select('id, nome').eq('empresa_id', empresaId),
    supabase.from('riscos_oportunidades').select('id, descricao').eq('empresa_id', empresaId),
    supabase.from('reunioes_analise_critica').select('id, data').eq('empresa_id', empresaId),
  ]);
  return { objetivos, indicadores: indicadoresData || [], riscos: riscosData || [], atas: atasData || [] };
}

function nomeOrigem(plano, origens) {
  if (!plano.origem || !plano.origem_id) return '—';
  if (plano.origem === 'objetivo') return origens.objetivos.find((o) => o.id === plano.origem_id)?.nome || '—';
  if (plano.origem === 'indicador') return origens.indicadores.find((i) => i.id === plano.origem_id)?.nome || '—';
  if (plano.origem === 'risco') return origens.riscos.find((r) => r.id === plano.origem_id)?.descricao || '—';
  if (plano.origem === 'rac') { const a = origens.atas.find((x) => x.id === plano.origem_id); return a ? `Ata de ${a.data}` : '—'; }
  return '—';
}

export async function render(container, state) {
  if (grupoAtivo === 'todo') return renderTodoGrupo(container, state);
  return renderPlanos(container, state);
}

async function renderTodoGrupo(container, state) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><span><i class="ti ti-list-check"></i> Ações</span></div>
      ${renderFiltrosGrupo()}
      <div id="planos-todo-corpo"></div>
    </div>
  `;
  wireFiltrosGrupo(container, state);
  await todo.renderCorpo(container.querySelector('#planos-todo-corpo'), state);
}

async function renderPlanos(container, state) {
  const { supabase, empresaAtual, papelAtual } = state;
  const podeEditar = papelAtual !== 'usuario';

  let planos, origens, membros;
  try {
    const [resPlanos, origensData, membrosData] = await Promise.all([
      supabase.from('planos_acao').select('*').eq('empresa_id', empresaAtual.id),
      carregarOrigens(supabase, empresaAtual.id),
      supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }).then((r) => r.data || []),
    ]);
    if (resPlanos.error) throw resPlanos.error;
    // Numeração sequencial (001/2026...) já reflete a ordem de criação, então essa é a ordem natural de exibição.
    planos = [...resPlanos.data].sort((a, b) => a.numero.localeCompare(b.numero));
    origens = origensData;
    membros = membrosData;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar planos de ação: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const emailPorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));
  const selecionados = new Set(); // ids dos planos marcados para ações em massa (CSV/PDF/e-mail)

  function planosFiltrados() {
    if (filtroOrigemObjetivo) {
      return planos.filter((p) => p.origem === 'objetivo' && p.origem_id === filtroOrigemObjetivo);
    }
    const busca = (container.querySelector('#pa-busca')?.value || '').trim().toLowerCase();
    const respFiltro = container.querySelector('#pa-filtro-responsavel')?.value || '';
    const indicadorFiltro = container.querySelector('#pa-filtro-indicador')?.value || '';
    const objetivoFiltro = container.querySelector('#pa-filtro-objetivo')?.value || '';
    const de = container.querySelector('#pa-filtro-de')?.value || '';
    const ate = container.querySelector('#pa-filtro-ate')?.value || '';

    return planos.filter((p) => {
      if (busca) {
        const alvo = `${p.titulo} ${p.o_que || ''} ${p.por_que || ''} ${p.como || ''} ${p.onde || ''}`.toLowerCase();
        if (!alvo.includes(busca)) return false;
      }
      if (respFiltro && (emailPorId.get(p.responsavel_id) || '—') !== respFiltro) return false;
      if (indicadorFiltro && !(p.origem === 'indicador' && p.origem_id === indicadorFiltro)) return false;
      if (objetivoFiltro && !(p.origem === 'objetivo' && p.origem_id === objetivoFiltro)) return false;
      if (de && (!p.quando || p.quando < de)) return false;
      if (ate && (!p.quando || p.quando > ate)) return false;
      return true;
    });
  }

  // Ações em massa agem sobre a seleção (checkboxes) quando houver algo marcado, senão sobre
  // todos os planos visíveis com os filtros atuais.
  function planosAlvo() {
    if (selecionados.size) return planos.filter((p) => selecionados.has(p.id));
    return planosFiltrados();
  }

  function atualizarBotoesAcao() {
    const n = planosAlvo().length;
    container.querySelector('#btn-planos-csv').innerHTML = `<i class="ti ti-download"></i> CSV (${n})`;
    container.querySelector('#btn-planos-email').innerHTML = `<i class="ti ti-mail"></i> E-mail (${n})`;
    container.querySelector('#btn-planos-pdf').innerHTML = `<i class="ti ti-printer"></i> PDF (${n})`;
  }

  function renderTabelaPlanos() {
    const filtrados = planosFiltrados();
    const area = container.querySelector('#planos-tabela-area');
    area.innerHTML = filtrados.length ? `
        <table class="table">
          <thead><tr><th><input type="checkbox" id="pa-selecionar-todas"></th><th>Nº</th><th>Título</th><th>Origem</th><th>Responsável</th><th>Quando</th><th>Status</th><th>%</th><th>Evidência</th><th></th></tr></thead>
          <tbody>
            ${filtrados.map((p) => `
              <tr>
                <td><input type="checkbox" class="pa-checkbox" data-id="${p.id}" ${selecionados.has(p.id) ? 'checked' : ''}></td>
                <td><span class="badge badge-neutral">${escapeHtml(p.numero)}</span></td>
                <td><strong>${escapeHtml(p.titulo)}</strong><br><span class="text-muted">${escapeHtml(p.o_que || '')}</span></td>
                <td>${p.origem ? `<span class="badge badge-neutral">${ORIGEM_LABEL[p.origem]}</span><br>` : ''}${escapeHtml(nomeOrigem(p, origens))}</td>
                <td>${escapeHtml(emailPorId.get(p.responsavel_id) || '—')}</td>
                <td>${p.quando || '—'}</td>
                <td><span class="badge status-${p.status}">${STATUS_LABEL[p.status]}</span></td>
                <td>${p.percentual_conclusao}%</td>
                <td>${p.evidencia_nome ? `<button class="icon-btn" data-ver-evidencia="${p.id}" title="Ver evidência"><i class="ti ti-paperclip"></i></button>` : '—'}</td>
                <td class="table-actions">
                  <button class="icon-btn" data-imprimir-plano="${p.id}" title="Imprimir plano de ação"><i class="ti ti-printer"></i></button>
                  ${podeEditar ? `
                    <button class="icon-btn" data-editar="${p.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                    <button class="icon-btn" data-excluir="${p.id}" title="Excluir"><i class="ti ti-trash"></i></button>
                  ` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>` : '<div class="empty-state"><i class="ti ti-list-check"></i>Nenhum plano de ação encontrado.</div>';

    const idsVisiveis = filtrados.map((p) => p.id);
    const selecionarTodas = area.querySelector('#pa-selecionar-todas');
    if (selecionarTodas) {
      selecionarTodas.checked = idsVisiveis.length > 0 && idsVisiveis.every((id) => selecionados.has(id));
      selecionarTodas.addEventListener('change', () => {
        idsVisiveis.forEach((id) => (selecionarTodas.checked ? selecionados.add(id) : selecionados.delete(id)));
        atualizarBotoesAcao();
        renderTabelaPlanos();
      });
    }

    area.querySelectorAll('.pa-checkbox').forEach((chk) => {
      chk.addEventListener('change', () => {
        if (chk.checked) selecionados.add(chk.dataset.id);
        else selecionados.delete(chk.dataset.id);
        atualizarBotoesAcao();
      });
    });

    area.querySelectorAll('[data-editar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = planos.find((p) => p.id === btn.dataset.editar);
        abrirFormulario(state, container, origens, membros, item);
      });
    });

    area.querySelectorAll('[data-excluir]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        // Não permite excluir um plano com tarefas (ações micro) vinculadas — evita perder o
        // histórico de execução por engano; é preciso excluir as tarefas primeiro.
        const { count, error: errCount } = await supabase
          .from('planos_acao_itens')
          .select('id', { count: 'exact', head: true })
          .eq('plano_acao_id', btn.dataset.excluir);
        if (errCount) return toast('Erro ao verificar tarefas vinculadas: ' + errCount.message, 'erro');
        if (count > 0) {
          return toast(`Este plano tem ${count} tarefa(s) vinculada(s) e não pode ser excluído. Exclua as tarefas em "Ações micro" primeiro.`, 'erro');
        }

        if (!(await confirmar('Excluir este plano de ação?'))) return;
        const { error } = await supabase.from('planos_acao').delete().eq('id', btn.dataset.excluir);
        if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
        toast('Plano de ação excluído.', 'sucesso');
        render(container, state);
      });
    });

    area.querySelectorAll('[data-ver-evidencia]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const plano = planos.find((p) => p.id === btn.dataset.verEvidencia);
        const { data, error } = await supabase.storage.from('evidencias-planos').createSignedUrl(plano.evidencia_url, 300);
        if (error) return toast('Erro ao abrir evidência: ' + error.message, 'erro');
        window.open(data.signedUrl, '_blank');
      });
    });

    area.querySelectorAll('[data-imprimir-plano]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const plano = planos.find((p) => p.id === btn.dataset.imprimirPlano);
        imprimirPlano(state, plano, origens);
      });
    });
  }

  container.innerHTML = `
    <div class="card">
      <div class="lista-toolbar">
        <span style="font-weight:700;font-size:14px;color:var(--navy)"><i class="ti ti-list-check"></i> Ações</span>
        <div class="lista-toolbar-acoes">
          <button class="btn btn-secondary btn-sm" id="btn-planos-csv"><i class="ti ti-download"></i> CSV</button>
          <button class="btn btn-secondary btn-sm" id="btn-planos-email"><i class="ti ti-mail"></i> E-mail</button>
          <button class="btn btn-secondary btn-sm" id="btn-planos-pdf"><i class="ti ti-printer"></i> PDF</button>
          ${podeEditar ? '<button class="btn btn-primary btn-sm" id="btn-add-plano"><i class="ti ti-plus"></i> Novo plano</button>' : ''}
        </div>
      </div>
      ${renderFiltrosGrupo()}
      ${filtroOrigemObjetivo ? `
        <div class="alert alert-info">
          <i class="ti ti-filter"></i>
          <span>Mostrando apenas os planos do objetivo selecionado. <a href="#" id="link-limpar-filtro">Ver todos</a></span>
        </div>` : `
        <div class="filters filters-compact">
          <input type="text" id="pa-busca" class="filter-select filter-select-sm" placeholder="Buscar por palavra-chave...">
          <select id="pa-filtro-responsavel" class="filter-select filter-select-sm">
            <option value="">Responsável</option>
            ${membros.map((m) => `<option value="${escapeHtml(m.nome || m.email)}">${escapeHtml(m.nome || m.email)}</option>`).join('')}
          </select>
          <select id="pa-filtro-indicador" class="filter-select filter-select-sm">
            <option value="">Indicador</option>
            ${origens.indicadores.map((i) => `<option value="${i.id}">${escapeHtml(i.nome)}</option>`).join('')}
          </select>
          <select id="pa-filtro-objetivo" class="filter-select filter-select-sm">
            <option value="">Objetivo</option>
            ${origens.objetivos.map((o) => `<option value="${o.id}">${escapeHtml(o.nome)}</option>`).join('')}
          </select>
          <input type="date" id="pa-filtro-de" class="filter-select filter-select-sm" title="De">
          <input type="date" id="pa-filtro-ate" class="filter-select filter-select-sm" title="Até">
        </div>`}
      <div id="planos-tabela-area"></div>
    </div>
  `;

  wireFiltrosGrupo(container, state);
  renderTabelaPlanos();
  atualizarBotoesAcao();

  container.querySelectorAll('#pa-busca, #pa-filtro-responsavel, #pa-filtro-indicador, #pa-filtro-objetivo, #pa-filtro-de, #pa-filtro-ate').forEach((el) => {
    el.addEventListener('input', () => { renderTabelaPlanos(); atualizarBotoesAcao(); });
    el.addEventListener('change', () => { renderTabelaPlanos(); atualizarBotoesAcao(); });
  });

  const linkLimpar = container.querySelector('#link-limpar-filtro');
  if (linkLimpar) linkLimpar.addEventListener('click', (e) => { e.preventDefault(); filtroOrigemObjetivo = null; render(container, state); });

  const btnAdd = container.querySelector('#btn-add-plano');
  if (btnAdd) btnAdd.addEventListener('click', () => abrirFormulario(state, container, origens, membros));

  container.querySelector('#btn-planos-csv').addEventListener('click', () => exportarCsvPlanos(planosAlvo(), origens, emailPorId));
  container.querySelector('#btn-planos-pdf').addEventListener('click', () => imprimirListaPlanos(planosAlvo(), origens, emailPorId));
  container.querySelector('#btn-planos-email').addEventListener('click', () => {
    const alvo = planosAlvo();
    const corpo = alvo.map((p) => `${p.numero} — ${p.titulo}\nStatus: ${STATUS_LABEL[p.status]} (${p.percentual_conclusao}%)\nResponsável: ${emailPorId.get(p.responsavel_id) || '—'}\nQuando: ${p.quando || '—'}\n`).join('\n');
    enviarPorEmail('Planos de Ação', corpo || 'Nenhum plano encontrado.');
  });
}

function exportarCsvPlanos(planos, origens, emailPorId) {
  const cabecalho = ['Nº', 'Título', 'Origem', 'Responsável', 'Quando', 'Status', '%'];
  const escaparCsv = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const linhasCsv = planos.map((p) => [
    p.numero, p.titulo, nomeOrigem(p, origens), emailPorId.get(p.responsavel_id) || '—', p.quando || '', STATUS_LABEL[p.status], p.percentual_conclusao,
  ].map(escaparCsv).join(','));
  const csv = [cabecalho.map(escaparCsv).join(','), ...linhasCsv].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `planos_acao_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Monta o documento de impressão de um único plano de ação (5W2H completo + tarefas micro),
// usando o timbre padrão (#print-letterhead) e a área reservada #print-secao.
async function imprimirPlano(state, plano, origens) {
  const { supabase } = state;
  const { data: itens } = await supabase.from('planos_acao_itens').select('*').eq('plano_acao_id', plano.id).order('created_at');
  const { data: membros } = await supabase.rpc('listar_usuarios_empresa', { p_empresa_id: state.empresaAtual.id });
  const nomePorId = new Map((membros || []).map((m) => [m.usuario_id, m.nome || m.email]));

  imprimirSecao(`
    <h2 style="margin-bottom:4px">Plano de Ação ${escapeHtml(plano.numero)}</h2>
    <p class="text-muted">${escapeHtml(plano.titulo)}</p>
    <hr class="sep">
    <table class="print-detalhe-tabela">
      <tbody>
        <tr><th>Origem</th><td>${plano.origem ? `${ORIGEM_LABEL[plano.origem]} — ${escapeHtml(nomeOrigem(plano, origens))}` : '—'}</td></tr>
        <tr><th>O quê</th><td>${escapeHtml(plano.o_que || '—')}</td></tr>
        <tr><th>Por quê</th><td>${escapeHtml(plano.por_que || '—')}</td></tr>
        <tr><th>Onde</th><td>${escapeHtml(plano.onde || '—')}</td></tr>
        <tr><th>Quando</th><td>${plano.quando || '—'}</td></tr>
        <tr><th>Quem (responsável)</th><td>${escapeHtml(nomePorId.get(plano.responsavel_id) || '—')}</td></tr>
        <tr><th>Como</th><td>${escapeHtml(plano.como || '—')}</td></tr>
        <tr><th>Quanto custa</th><td>${plano.quanto_custa ?? '—'}</td></tr>
        <tr><th>Status</th><td>${STATUS_LABEL[plano.status]} (${plano.percentual_conclusao}% concluído)</td></tr>
      </tbody>
    </table>
    <h4 style="margin-top:16px">Tarefas</h4>
    ${(itens || []).length ? `
      <table class="table">
        <thead><tr><th>Descrição</th><th>Responsável</th><th>Prazo</th><th>Status</th><th>%</th></tr></thead>
        <tbody>
          ${itens.map((i) => `
            <tr>
              <td>${escapeHtml(i.descricao)}</td>
              <td>${escapeHtml(nomePorId.get(i.responsavel_id) || '—')}</td>
              <td>${i.prazo || '—'}</td>
              <td>${STATUS_LABEL[i.status]}</td>
              <td>${i.percentual_conclusao}%</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<p>Nenhuma tarefa registrada.</p>'}
  `);
}

// Documento de impressão da lista de planos (respeitando os filtros ativos no momento do clique).
function imprimirListaPlanos(planos, origens, emailPorId) {
  imprimirSecao(`
    <h2 style="margin-bottom:4px">Planos de Ação</h2>
    <p class="text-muted">${planos.length} plano(s)</p>
    <hr class="sep">
    ${planos.length ? `
      <table class="table">
        <thead><tr><th>Nº</th><th>Título</th><th>Origem</th><th>Responsável</th><th>Quando</th><th>Status</th><th>%</th></tr></thead>
        <tbody>
          ${planos.map((p) => `
            <tr>
              <td>${escapeHtml(p.numero)}</td>
              <td>${escapeHtml(p.titulo)}</td>
              <td>${p.origem ? ORIGEM_LABEL[p.origem] + ' — ' : ''}${escapeHtml(nomeOrigem(p, origens))}</td>
              <td>${escapeHtml(emailPorId.get(p.responsavel_id) || '—')}</td>
              <td>${p.quando || '—'}</td>
              <td>${STATUS_LABEL[p.status]}</td>
              <td>${p.percentual_conclusao}%</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<p>Nenhum plano encontrado com os filtros atuais.</p>'}
  `);
}

function abrirFormulario(state, container, origens, membros, item = null) {
  const { supabase, empresaAtual } = state;

  const optionsOrigem = (origem) => {
    if (origem === 'objetivo') return origens.objetivos.map((o) => `<option value="${o.id}">${escapeHtml(o.nome)}</option>`).join('');
    if (origem === 'indicador') return origens.indicadores.map((i) => `<option value="${i.id}">${escapeHtml(i.nome)}</option>`).join('');
    if (origem === 'risco') return origens.riscos.map((r) => `<option value="${r.id}">${escapeHtml(r.descricao)}</option>`).join('');
    return '';
  };

  const modal = abrirModal(item ? 'Editar plano de ação' : 'Novo plano de ação (5W2H)', `
    <form id="form-plano">
      <div class="form-group">
        <label>Título</label>
        <input type="text" id="pa-titulo" required value="${item ? escapeHtml(item.titulo) : ''}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Origem</label>
          <select id="pa-origem">
            <option value="">Nenhuma (avulso)</option>
            <option value="objetivo" ${item?.origem === 'objetivo' ? 'selected' : ''}>Objetivo</option>
            <option value="indicador" ${item?.origem === 'indicador' ? 'selected' : ''}>Indicador</option>
            <option value="risco" ${item?.origem === 'risco' ? 'selected' : ''}>Risco/Oportunidade</option>
          </select>
        </div>
        <div class="form-group" id="grupo-origem-id" style="${item?.origem ? '' : 'display:none'}">
          <label>Item vinculado</label>
          <select id="pa-origem-id">${item?.origem ? optionsOrigem(item.origem) : ''}</select>
        </div>
      </div>
      <div class="form-group">
        <label>O quê</label>
        <textarea id="pa-o-que">${item ? escapeHtml(item.o_que || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label>Por quê</label>
        <textarea id="pa-por-que">${item ? escapeHtml(item.por_que || '') : ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Onde</label>
          <input type="text" id="pa-onde" value="${item ? escapeHtml(item.onde || '') : ''}">
        </div>
        <div class="form-group">
          <label>Quando</label>
          <input type="date" id="pa-quando" value="${item?.quando || ''}">
        </div>
      </div>
      <div class="form-group">
        <label>Responsável</label>
        <select id="pa-responsavel">
          <option value="">—</option>
          ${membros.map((m) => `<option value="${m.usuario_id}" ${item?.responsavel_id === m.usuario_id ? 'selected' : ''}>${escapeHtml(m.nome || m.email)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Como</label>
        <textarea id="pa-como">${item ? escapeHtml(item.como || '') : ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Quanto custa</label>
          <input type="number" step="any" id="pa-quanto-custa" value="${item?.quanto_custa ?? ''}">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="pa-status">
            ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${item?.status === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      ${item ? `<p class="text-muted">% de conclusão: <strong id="pa-percentual-display">${item.percentual_conclusao}%</strong> (calculado automaticamente a partir das tarefas abaixo)</p>` : ''}
      <div class="form-group">
        <label>Evidência (opcional)</label>
        ${item?.evidencia_nome ? `<p class="text-muted" style="margin-bottom:6px">Arquivo atual: ${escapeHtml(item.evidencia_nome)}</p>` : ''}
        <input type="file" id="pa-evidencia">
      </div>
      <div class="form-group">
        <label>Tarefas</label>
        ${item ? `
          <div id="pa-itens-micro-lista"><p class="text-muted" style="font-size:12px">Carregando...</p></div>
          <div class="form-group">
            <label style="font-weight:400;font-size:12px">Descrição da tarefa</label>
            <textarea id="item-descricao"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label style="font-weight:400;font-size:12px">Responsável</label>
              <select id="item-responsavel">
                <option value="">—</option>
                ${membros.map((m) => `<option value="${m.usuario_id}">${escapeHtml(m.nome || m.email)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label style="font-weight:400;font-size:12px">Prazo</label>
              <input type="date" id="item-prazo">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label style="font-weight:400;font-size:12px">Status</label>
              <select id="item-status">
                ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label style="font-weight:400;font-size:12px">% de conclusão</label>
              <input type="number" min="0" max="100" id="item-percentual" value="0">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><button type="button" class="btn btn-secondary btn-block" id="btn-salvar-item-micro">Adicionar tarefa</button></div>
            <div class="form-group" id="grupo-cancelar-item-micro" style="display:none">
              <button type="button" class="btn btn-secondary btn-block" id="btn-cancelar-item-micro">Cancelar edição</button>
            </div>
          </div>
        ` : '<p class="text-muted">Salve o plano primeiro para adicionar tarefas.</p>'}
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#pa-origem').addEventListener('change', (e) => {
    const grupo = modal.querySelector('#grupo-origem-id');
    const select = modal.querySelector('#pa-origem-id');
    if (!e.target.value) {
      grupo.style.display = 'none';
      select.innerHTML = '';
      return;
    }
    grupo.style.display = '';
    select.innerHTML = optionsOrigem(e.target.value);
  });

  if (item) montarAcoesMicro(state, modal, item, membros);

  modal.querySelector('#form-plano').addEventListener('submit', async (e) => {
    e.preventDefault();
    const quando = modal.querySelector('#pa-quando').value;
    if (quando && !dataValida(quando)) return toast('Data "Quando" inválida.', 'erro');
    const origem = modal.querySelector('#pa-origem').value || null;
    const payload = {
      empresa_id: empresaAtual.id,
      titulo: modal.querySelector('#pa-titulo').value.trim(),
      origem,
      origem_id: origem ? (modal.querySelector('#pa-origem-id').value || null) : null,
      o_que: modal.querySelector('#pa-o-que').value.trim(),
      por_que: modal.querySelector('#pa-por-que').value.trim(),
      onde: modal.querySelector('#pa-onde').value.trim(),
      quando: quando || null,
      responsavel_id: modal.querySelector('#pa-responsavel').value || null,
      como: modal.querySelector('#pa-como').value.trim(),
      quanto_custa: modal.querySelector('#pa-quanto-custa').value || null,
      status: modal.querySelector('#pa-status').value,
    };

    const arquivo = modal.querySelector('#pa-evidencia').files[0];
    let planoId = item?.id;

    const query = item
      ? supabase.from('planos_acao').update(payload).eq('id', item.id).select().single()
      : supabase.from('planos_acao').insert(payload).select().single();
    const { data: salvo, error } = await query;
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    planoId = salvo.id;

    if (arquivo) {
      const caminho = `${empresaAtual.id}/${planoId}/${arquivo.name}`;
      const { error: errUpload } = await supabase.storage.from('evidencias-planos').upload(caminho, arquivo, { upsert: true });
      if (errUpload) {
        toast('Plano salvo, mas houve erro ao enviar a evidência: ' + errUpload.message, 'erro');
      } else {
        await supabase.from('planos_acao').update({ evidencia_url: caminho, evidencia_nome: arquivo.name }).eq('id', planoId);
      }
    }

    toast('Plano de ação salvo com sucesso.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}

// O % do plano macro é a média das ações micro; recalculado toda vez que uma ação micro é criada, editada ou excluída.
export async function recalcularPercentualMacro(supabase, planoAcaoId) {
  const { data: itens } = await supabase.from('planos_acao_itens').select('percentual_conclusao').eq('plano_acao_id', planoAcaoId);
  const lista = itens || [];
  const percentual = lista.length ? Math.round(lista.reduce((soma, i) => soma + i.percentual_conclusao, 0) / lista.length) : 0;
  await supabase.from('planos_acao').update({ percentual_conclusao: percentual }).eq('id', planoAcaoId);
  return percentual;
}

// Gerencia as ações micro embutidas no próprio formulário do plano (sem modal separado).
async function montarAcoesMicro(state, modal, plano, membros) {
  const { supabase } = state;
  const podeEditar = state.papelAtual !== 'usuario';
  const emailPorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));

  const { data: itensData, error } = await supabase
    .from('planos_acao_itens')
    .select('*')
    .eq('plano_acao_id', plano.id)
    .order('created_at');
  if (error) return toast('Erro ao carregar tarefas: ' + error.message, 'erro');
  let itens = itensData;

  function renderListaItensMicro() {
    const listaEl = modal.querySelector('#pa-itens-micro-lista');
    if (!listaEl) return;
    listaEl.innerHTML = itens.length ? `
      <table class="table">
        <thead><tr><th>Descrição</th><th>Responsável</th><th>Prazo</th><th>Status</th><th>%</th>${podeEditar ? '<th></th>' : ''}</tr></thead>
        <tbody>
          ${itens.map((i) => `
            <tr>
              <td>${escapeHtml(i.descricao)}</td>
              <td>${escapeHtml(emailPorId.get(i.responsavel_id) || '—')}</td>
              <td>${i.prazo || '—'}</td>
              <td><span class="badge status-${i.status}">${STATUS_LABEL[i.status]}</span></td>
              <td>${i.percentual_conclusao}%</td>
              ${podeEditar ? `<td class="table-actions">
                <button type="button" class="icon-btn" data-editar-item="${i.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                <button type="button" class="icon-btn" data-excluir-item="${i.id}" title="Excluir"><i class="ti ti-trash"></i></button>
              </td>` : ''}
            </tr>`).join('')}
        </tbody>
      </table>` : '<p class="text-muted">Nenhuma tarefa cadastrada ainda.</p>';

    if (!podeEditar) return;

    listaEl.querySelectorAll('[data-editar-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = itens.find((x) => x.id === btn.dataset.editarItem);
        modal.querySelector('#item-descricao').value = i.descricao;
        modal.querySelector('#item-responsavel').value = i.responsavel_id || '';
        modal.querySelector('#item-prazo').value = i.prazo || '';
        modal.querySelector('#item-status').value = i.status;
        modal.querySelector('#item-percentual').value = i.percentual_conclusao;
        modal.dataset.itemMicroEditando = i.id;
        modal.querySelector('#btn-salvar-item-micro').textContent = 'Salvar edição';
        modal.querySelector('#grupo-cancelar-item-micro').style.display = '';
        modal.querySelector('#item-descricao').focus();
      });
    });

    listaEl.querySelectorAll('[data-excluir-item]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmar('Excluir esta tarefa?'))) return;
        const { error: errDel } = await supabase.from('planos_acao_itens').delete().eq('id', btn.dataset.excluirItem);
        if (errDel) return toast('Erro ao excluir: ' + errDel.message, 'erro');
        await recarregarEAtualizar();
      });
    });
  }

  async function recarregarEAtualizar() {
    const { data } = await supabase.from('planos_acao_itens').select('*').eq('plano_acao_id', plano.id).order('created_at');
    itens = data || [];
    plano.percentual_conclusao = await recalcularPercentualMacro(supabase, plano.id);
    const display = modal.querySelector('#pa-percentual-display');
    if (display) display.textContent = `${plano.percentual_conclusao}%`;
    renderListaItensMicro();
  }

  renderListaItensMicro();

  const btnSalvar = modal.querySelector('#btn-salvar-item-micro');
  const btnCancelar = modal.querySelector('#btn-cancelar-item-micro');
  const grupoCancelar = modal.querySelector('#grupo-cancelar-item-micro');
  if (!btnSalvar || !podeEditar) return;

  function limparFormularioItem() {
    modal.querySelector('#item-descricao').value = '';
    modal.querySelector('#item-responsavel').value = '';
    modal.querySelector('#item-prazo').value = '';
    modal.querySelector('#item-status').value = 'nao_iniciado';
    modal.querySelector('#item-percentual').value = 0;
    delete modal.dataset.itemMicroEditando;
    btnSalvar.textContent = 'Adicionar tarefa';
    grupoCancelar.style.display = 'none';
  }

  btnCancelar.addEventListener('click', limparFormularioItem);

  btnSalvar.addEventListener('click', async () => {
    const descricao = modal.querySelector('#item-descricao').value.trim();
    if (!descricao) return toast('Descreva a tarefa antes de salvar.', 'erro');
    const prazo = modal.querySelector('#item-prazo').value;
    if (prazo && !dataValida(prazo)) return toast('Prazo inválido.', 'erro');
    const itemId = modal.dataset.itemMicroEditando;
    const payload = {
      plano_acao_id: plano.id,
      descricao,
      responsavel_id: modal.querySelector('#item-responsavel').value || null,
      prazo: prazo || null,
      status: modal.querySelector('#item-status').value,
      percentual_conclusao: Number(modal.querySelector('#item-percentual').value) || 0,
    };
    const query = itemId
      ? supabase.from('planos_acao_itens').update(payload).eq('id', itemId)
      : supabase.from('planos_acao_itens').insert(payload);
    const { error: errSalvar } = await query;
    if (errSalvar) return toast('Erro ao salvar tarefa: ' + errSalvar.message, 'erro');
    toast('Tarefa salva com sucesso.', 'sucesso');
    limparFormularioItem();
    await recarregarEAtualizar();
  });
}
