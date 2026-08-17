import { abrirModal, fecharModal, toast, escapeHtml, confirmar, imprimirSecao, resolverNivel, podeEditarRegistro, formatarData } from '../ui.js';

// Módulo "Gestão de Treinamentos" (ISO 9001 cláusula 7.2): solicitação (com N participantes) →
// aprovação → agendamento → execução → fechamento (presença + conclusão) → análise de eficácia →
// atualização automática da Matriz de Versatilidade (ver trigger treinamentos_atualizar_versatilidade
// na migração 0086). Estrutura em abas no mesmo padrão de js/modules/auditorias.js.
//
// Submódulo 'solicitacoes' cobre o ciclo de vida inteiro do registro (Solicitações, Cronograma —
// mesma fonte de dados só reorganizada visualmente — e Fechamento); 'versatilidade' cobre o catálogo
// de competências e a matriz (ver js/modulosConfig.js e js/modules/permissoesShared.js).

const TIPO_LABEL = {
  integracao: 'Integração', tecnico: 'Técnico', comportamental: 'Comportamental', seguranca: 'Segurança',
  qualidade: 'Qualidade', legal: 'Legal/Normativo', lideranca: 'Liderança', outro: 'Outro',
};
const MODALIDADE_LABEL = { presencial: 'Presencial', online: 'Online (ao vivo)', ead: 'EAD (gravado)', in_company: 'In Company' };
const INSTRUTOR_TIPO_LABEL = { interno: 'Interno', externo: 'Externo' };
const STATUS_LABEL = {
  solicitado: 'Solicitado', aprovado: 'Aprovado', reprovado: 'Reprovado', agendado: 'Agendado',
  em_execucao: 'Em Execução', concluido: 'Concluído', fechado: 'Fechado', cancelado: 'Cancelado',
};
const STATUS_BADGE = {
  solicitado: 'badge-neutral', aprovado: 'badge-warning', reprovado: 'badge-danger', agendado: 'badge-warning',
  em_execucao: 'badge-warning', concluido: 'badge-success', fechado: 'badge-success', cancelado: 'badge-neutral',
};
const EFICACIA_LABEL = { eficaz: 'Eficaz', parcialmente_eficaz: 'Parcialmente Eficaz', ineficaz: 'Ineficaz' };
const EFICACIA_BADGE = { eficaz: 'badge-success', parcialmente_eficaz: 'badge-warning', ineficaz: 'badge-danger' };
const NIVEL_VERSATILIDADE_LABEL = { 0: 'Não treinado', 1: 'Em treinamento', 2: 'Treinado', 3: 'Treinado c/ autonomia', 4: 'Multiplicador' };

// Réplica do rótulo usado em objetivos.js/sipoc.js — não importado de lá pra evitar acoplamento
// entre módulos por causa de uma função tão pequena.
function rotuloProcesso(p) {
  return p.numero ? `${p.numero} — ${p.nome}` : p.nome;
}

function nivelSolicitacoes(state) {
  return resolverNivel(state, 'treinamentos', 'solicitacoes');
}
function podeCriarSolicitacao(state) {
  const n = nivelSolicitacoes(state);
  return n === 'total' || n === 'proprio';
}
function podeEditarTreinamento(state, treinamento) {
  return podeEditarRegistro(state, treinamento?.solicitante_id, 'treinamentos', 'solicitacoes');
}
function podeEditarVersatilidade(state) {
  return resolverNivel(state, 'treinamentos', 'versatilidade') === 'total';
}

let grupoAtivo = 'solicitacoes'; // 'solicitacoes' | 'cronograma' | 'fechamento' | 'versatilidade' | 'dashboard'

// Cronograma e Dashboard são visualizações agregadas de 'solicitacoes' — mesmo acesso da aba
// Solicitações (mesmo padrão do dashboard de auditorias.js).
const SUBMODULOS_POR_GRUPO = { solicitacoes: 'solicitacoes', cronograma: 'solicitacoes', fechamento: 'solicitacoes', versatilidade: 'versatilidade', dashboard: 'solicitacoes' };

function renderFiltrosGrupo(state) {
  const visivel = (grupo) => resolverNivel(state, 'treinamentos', SUBMODULOS_POR_GRUPO[grupo]) !== 'sem_acesso';
  const aba = (grupo, icone, label) => visivel(grupo)
    ? `<button class="tab-btn ${grupoAtivo === grupo ? 'active' : ''}" data-grupo="${grupo}"><i class="ti ${icone}"></i> ${label}</button>` : '';
  if (!visivel(grupoAtivo)) {
    grupoAtivo = ['solicitacoes', 'cronograma', 'fechamento', 'versatilidade', 'dashboard'].find(visivel) || 'solicitacoes';
  }
  return `
    <nav class="tabs">
      ${aba('solicitacoes', 'ti-clipboard-list', 'Solicitações')}
      ${aba('cronograma', 'ti-calendar', 'Cronograma')}
      ${aba('fechamento', 'ti-checkbox', 'Fechamento')}
      ${aba('versatilidade', 'ti-grid-dots', 'Matriz de Versatilidade')}
      ${aba('dashboard', 'ti-chart-bar', 'Dashboard')}
    </nav>`;
}
function wireFiltrosGrupo(container, state) {
  container.querySelectorAll('[data-grupo]').forEach((btn) => {
    btn.addEventListener('click', () => { grupoAtivo = btn.dataset.grupo; render(container, state); });
  });
}

export async function render(container, state) {
  if (grupoAtivo === 'cronograma') return renderCronograma(container, state);
  if (grupoAtivo === 'fechamento') return renderFechamento(container, state);
  if (grupoAtivo === 'versatilidade') return renderVersatilidade(container, state);
  if (grupoAtivo === 'dashboard') return renderDashboard(container, state);
  return renderSolicitacoes(container, state);
}

// Carrega tudo que Solicitações/Cronograma precisam de uma vez (evita duplicar as mesmas 5 consultas).
async function carregarDados(state) {
  const { supabase, empresaAtual } = state;
  const [treinamentosRes, membrosRes, departamentosRes, processosRes, competenciasRes] = await Promise.all([
    supabase.from('treinamentos').select('*').eq('empresa_id', empresaAtual.id).order('created_at', { ascending: false }),
    supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }),
    supabase.from('departamentos').select('id, nome').eq('empresa_id', empresaAtual.id).order('nome'),
    supabase.from('macrofluxo_processos').select('id, numero, nome').eq('empresa_id', empresaAtual.id).order('ordem'),
    supabase.from('treinamentos_competencias').select('*').eq('empresa_id', empresaAtual.id).order('nome'),
  ]);
  if (treinamentosRes.error) throw treinamentosRes.error;
  const treinamentos = treinamentosRes.data || [];
  const ids = treinamentos.map((t) => t.id);
  const { data: participantesData, error: errPart } = ids.length
    ? await supabase.from('treinamentos_participantes').select('*').in('treinamento_id', ids)
    : { data: [], error: null };
  if (errPart) throw errPart;

  return {
    treinamentos,
    membros: membrosRes.data || [],
    departamentos: departamentosRes.data || [],
    processos: processosRes.data || [],
    competencias: competenciasRes.data || [],
    participantes: participantesData || [],
  };
}

// ==================== SOLICITAÇÕES ====================
async function renderSolicitacoes(container, state) {
  const { supabase } = state;
  container.innerHTML = `<div class="card">${renderFiltrosGrupo(state)}<div id="tr-corpo" style="margin-top:1rem">Carregando...</div></div>`;
  wireFiltrosGrupo(container, state);
  const area = container.querySelector('#tr-corpo');

  let dados;
  try {
    dados = await carregarDados(state);
  } catch (err) {
    area.innerHTML = `<div class="alert alert-warning">Erro ao carregar treinamentos: ${escapeHtml(err.message)}</div>`;
    return;
  }
  const { treinamentos, membros, departamentos, processos, competencias, participantes } = dados;
  const nomePorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));
  const nomeDepto = (id) => departamentos.find((d) => d.id === id)?.nome || '—';
  const participantesPorTreinamento = new Map();
  participantes.forEach((p) => {
    if (!participantesPorTreinamento.has(p.treinamento_id)) participantesPorTreinamento.set(p.treinamento_id, []);
    participantesPorTreinamento.get(p.treinamento_id).push(p);
  });

  function filtrados() {
    const fStatus = container.querySelector('#tr-filtro-status')?.value || '';
    const fTipo = container.querySelector('#tr-filtro-tipo')?.value || '';
    const fDepto = container.querySelector('#tr-filtro-depto')?.value || '';
    return treinamentos.filter((t) => {
      if (fStatus && t.status !== fStatus) return false;
      if (fTipo && t.tipo !== fTipo) return false;
      if (fDepto && t.departamento_id !== fDepto) return false;
      return true;
    });
  }

  function renderTabela() {
    const lista = filtrados();
    const areaTabela = container.querySelector('#tr-tabela-area');
    areaTabela.innerHTML = lista.length ? `
      <table class="table">
        <thead><tr><th>Nº</th><th>Título</th><th>Tipo</th><th>Departamento</th><th>Data prevista</th><th>Participantes</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${lista.map((t) => `
            <tr>
              <td>${escapeHtml(t.numero)}</td>
              <td><strong>${escapeHtml(t.titulo)}</strong></td>
              <td>${TIPO_LABEL[t.tipo] || '—'}</td>
              <td>${escapeHtml(nomeDepto(t.departamento_id))}</td>
              <td>${formatarData(t.data_prevista) || '—'}</td>
              <td>${(participantesPorTreinamento.get(t.id) || []).length}</td>
              <td><span class="badge ${STATUS_BADGE[t.status]}">${STATUS_LABEL[t.status]}</span></td>
              <td class="table-actions">
                ${podeEditarTreinamento(state, t) ? `<button class="icon-btn" data-editar="${t.id}" title="Editar"><i class="ti ti-pencil"></i></button>` : ''}
                ${podeEditarTreinamento(state, t) && t.status === 'em_execucao' ? `<button class="icon-btn" data-concluir="${t.id}" title="Marcar como concluído"><i class="ti ti-check"></i></button>` : ''}
                ${podeEditarTreinamento(state, t) ? `<button class="icon-btn" data-excluir="${t.id}" title="Excluir"><i class="ti ti-trash"></i></button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<div class="empty-state"><i class="ti ti-school"></i>Nenhuma solicitação encontrada com os filtros atuais.</div>';

    areaTabela.querySelectorAll('[data-editar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = lista.find((x) => x.id === btn.dataset.editar);
        const participantesIds = (participantesPorTreinamento.get(t.id) || []).map((p) => p.usuario_id);
        abrirFormularioTreinamento(state, container, { membros, departamentos, processos, competencias }, { ...t, participantesIds });
      });
    });
    areaTabela.querySelectorAll('[data-concluir]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const t = lista.find((x) => x.id === btn.dataset.concluir);
        const payload = { status: 'concluido' };
        if (!t.data_fim) payload.data_fim = new Date().toISOString().slice(0, 10);
        const { error } = await supabase.from('treinamentos').update(payload).eq('id', t.id);
        if (error) return toast('Erro ao concluir: ' + error.message, 'erro');
        toast('Treinamento marcado como concluído. Finalize presença/eficácia na aba Fechamento.', 'sucesso');
        render(container, state);
      });
    });
    areaTabela.querySelectorAll('[data-excluir]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmar('Excluir esta solicitação de treinamento? Os participantes vinculados também são removidos.'))) return;
        const { error } = await supabase.from('treinamentos').delete().eq('id', btn.dataset.excluir);
        if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
        toast('Solicitação excluída.', 'sucesso');
        render(container, state);
      });
    });
  }

  container.innerHTML = `
    <div class="card">
      ${renderFiltrosGrupo(state)}
      <div class="card-header" style="margin-top:1rem">
        <span><i class="ti ti-clipboard-list"></i> Solicitações de Treinamento</span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" id="btn-tr-imprimir"><i class="ti ti-printer"></i> Imprimir</button>
          ${podeCriarSolicitacao(state) ? '<button class="btn btn-primary btn-sm" id="btn-tr-novo"><i class="ti ti-plus"></i> Nova solicitação</button>' : ''}
        </div>
      </div>
      ${treinamentos.length ? `
        <div class="filters filters-compact">
          <select id="tr-filtro-status" class="filter-select filter-select-sm">
            <option value="">Status</option>
            ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
          <select id="tr-filtro-tipo" class="filter-select filter-select-sm">
            <option value="">Tipo</option>
            ${Object.entries(TIPO_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
          <select id="tr-filtro-depto" class="filter-select filter-select-sm">
            <option value="">Departamento</option>
            ${departamentos.map((d) => `<option value="${d.id}">${escapeHtml(d.nome)}</option>`).join('')}
          </select>
        </div>
        <div id="tr-tabela-area"></div>
      ` : `<div class="empty-state"><i class="ti ti-school"></i>Nenhuma solicitação de treinamento cadastrada.${podeCriarSolicitacao(state) ? ' Clique em "Nova solicitação" para começar.' : ''}</div>`}
    </div>`;
  wireFiltrosGrupo(container, state);

  if (treinamentos.length) {
    renderTabela();
    container.querySelectorAll('#tr-filtro-status, #tr-filtro-tipo, #tr-filtro-depto').forEach((el) => el.addEventListener('change', renderTabela));
  }
  container.querySelector('#btn-tr-novo')?.addEventListener('click', () => abrirFormularioTreinamento(state, container, { membros, departamentos, processos, competencias }));
  container.querySelector('#btn-tr-imprimir')?.addEventListener('click', () => imprimirListaTreinamentos(filtrados(), nomeDepto, participantesPorTreinamento));
}

function imprimirListaTreinamentos(lista, nomeDepto, participantesPorTreinamento) {
  imprimirSecao(`
    <h2 style="margin-bottom:4px">Solicitações de Treinamento</h2>
    <p class="text-muted">${lista.length} treinamento(s)</p>
    <hr class="sep">
    ${lista.length ? `
      <table class="table">
        <thead><tr><th>Nº</th><th>Título</th><th>Tipo</th><th>Departamento</th><th>Data prevista</th><th>Carga horária</th><th>Participantes</th><th>Status</th></tr></thead>
        <tbody>${lista.map((t) => `
          <tr>
            <td>${escapeHtml(t.numero)}</td>
            <td>${escapeHtml(t.titulo)}</td>
            <td>${TIPO_LABEL[t.tipo] || '—'}</td>
            <td>${escapeHtml(nomeDepto(t.departamento_id))}</td>
            <td>${formatarData(t.data_prevista) || '—'}</td>
            <td>${t.carga_horaria}h</td>
            <td>${(participantesPorTreinamento.get(t.id) || []).length}</td>
            <td>${STATUS_LABEL[t.status]}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<p>Nenhum treinamento encontrado.</p>'}
  `);
}

function abrirFormularioTreinamento(state, container, ctx, item = null) {
  const { supabase, empresaAtual, user } = state;
  const { membros, departamentos, processos, competencias } = ctx;
  // Nível "próprio": não edita tudo, mas pode criar uma solicitação nova (sempre com ela mesma como
  // solicitante) e editar as solicitações em que já é a solicitante — mesmo padrão de objetivos.js.
  const travarSolicitanteEmSiMesmo = !item && nivelSolicitacoes(state) === 'proprio';
  const nomePorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));
  const selecionados = new Set(item?.participantesIds || []);

  const modal = abrirModal(item ? 'Editar solicitação de treinamento' : 'Nova solicitação de treinamento', `
    <form id="form-treinamento">
      <div class="form-group">
        <label>Título</label>
        <input type="text" id="tr-titulo" required value="${item ? escapeHtml(item.titulo) : ''}">
      </div>
      <div class="form-group">
        <label>Descrição</label>
        <textarea id="tr-descricao">${item ? escapeHtml(item.descricao || '') : ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Tipo</label>
          <select id="tr-tipo" required>${Object.entries(TIPO_LABEL).map(([v, l]) => `<option value="${v}" ${item?.tipo === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <div class="form-group">
          <label>Modalidade</label>
          <select id="tr-modalidade">${Object.entries(MODALIDADE_LABEL).map(([v, l]) => `<option value="${v}" ${(item?.modalidade || 'presencial') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Instrutor</label>
          <select id="tr-instrutor-tipo"><option value="">—</option>${Object.entries(INSTRUTOR_TIPO_LABEL).map(([v, l]) => `<option value="${v}" ${item?.instrutor_tipo === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <div class="form-group">
          <label>Nome do instrutor</label>
          <input type="text" id="tr-instrutor-nome" value="${item ? escapeHtml(item.instrutor_nome || '') : ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Departamento</label>
          <select id="tr-departamento"><option value="">—</option>${departamentos.map((d) => `<option value="${d.id}" ${item?.departamento_id === d.id ? 'selected' : ''}>${escapeHtml(d.nome)}</option>`).join('')}</select>
        </div>
        <div class="form-group">
          <label>Processo (opcional)</label>
          <select id="tr-processo"><option value="">—</option>${processos.map((p) => `<option value="${p.id}" ${item?.processo_id === p.id ? 'selected' : ''}>${escapeHtml(rotuloProcesso(p))}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-group">
        <label>Competência desenvolvida (Matriz de Versatilidade)</label>
        <select id="tr-competencia">
          <option value="">— Não vincula à matriz —</option>
          ${competencias.map((c) => `<option value="${c.id}" ${item?.competencia_id === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`).join('')}
        </select>
        <p class="text-muted" style="font-size:12px;margin-top:4px">Quando este treinamento for fechado com eficácia "Eficaz", o nível dos participantes presentes sobe automaticamente nesta competência.</p>
      </div>
      <div class="form-group">
        <label>Justificativa</label>
        <textarea id="tr-justificativa" placeholder="Por que este treinamento é necessário?">${item ? escapeHtml(item.justificativa || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label>Solicitante</label>
        <select id="tr-solicitante" ${travarSolicitanteEmSiMesmo ? 'disabled' : ''}>
          ${membros.map((m) => `<option value="${m.usuario_id}" ${(item ? item.solicitante_id === m.usuario_id : m.usuario_id === user.id) ? 'selected' : ''}>${escapeHtml(m.nome || m.email)}</option>`).join('')}
        </select>
        ${travarSolicitanteEmSiMesmo ? '<p class="text-muted" style="font-size:12px;margin-top:4px">Seu nível de acesso só permite criar solicitações em seu próprio nome.</p>' : ''}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Carga horária (h)</label>
          <input type="number" id="tr-carga-horaria" min="0" step="0.5" value="${item ? item.carga_horaria : ''}" required>
        </div>
        <div class="form-group">
          <label>Custo (R$)</label>
          <input type="number" id="tr-custo" min="0" step="0.01" value="${item?.custo ?? ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Data prevista</label>
          <input type="date" id="tr-data-prevista" value="${item?.data_prevista || ''}">
        </div>
        <div class="form-group">
          <label>Data início</label>
          <input type="date" id="tr-data-inicio" value="${item?.data_inicio || ''}">
        </div>
        <div class="form-group">
          <label>Data fim</label>
          <input type="date" id="tr-data-fim" value="${item?.data_fim || ''}">
        </div>
      </div>
      <div class="form-group">
        <label>Local</label>
        <input type="text" id="tr-local" value="${item ? escapeHtml(item.local || '') : ''}">
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="tr-status">
          ${Object.entries(STATUS_LABEL).filter(([v]) => v !== 'fechado').map(([v, l]) => `<option value="${v}" ${(item?.status || 'solicitado') === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <p class="text-muted" style="font-size:12px;margin-top:4px">"Fechado" só é definido na aba Fechamento, depois de registrar presença e conclusão.</p>
      </div>
      <div class="form-group" id="tr-motivo-reprovacao-wrap" style="${item?.status === 'reprovado' ? '' : 'display:none'}">
        <label>Motivo da reprovação</label>
        <textarea id="tr-motivo-reprovacao">${item ? escapeHtml(item.motivo_reprovacao || '') : ''}</textarea>
      </div>
      <hr class="sep">
      <div class="form-group">
        <label>Participantes</label>
        <div class="form-row" style="align-items:flex-end">
          <div class="form-group"><select id="tr-participante-select"></select></div>
          <div class="form-group"><button type="button" class="btn btn-secondary" id="btn-tr-add-participante">Adicionar</button></div>
        </div>
        <div id="tr-participantes-lista" style="margin-top:8px"></div>
      </div>
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:1rem">Salvar</button>
    </form>
  `);

  function renderParticipantesSelect() {
    const select = modal.querySelector('#tr-participante-select');
    const disponiveis = membros.filter((m) => !selecionados.has(m.usuario_id));
    select.innerHTML = disponiveis.length
      ? disponiveis.map((m) => `<option value="${m.usuario_id}">${escapeHtml(m.nome || m.email)}</option>`).join('')
      : '<option value="">Todos já adicionados</option>';
  }
  function renderParticipantesLista() {
    const cont = modal.querySelector('#tr-participantes-lista');
    cont.innerHTML = selecionados.size
      ? [...selecionados].map((id) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border);font-size:13px">
          <span>${escapeHtml(nomePorId.get(id) || '—')}</span>
          <button type="button" class="icon-btn" data-remover-participante="${id}"><i class="ti ti-x"></i></button>
        </div>`).join('')
      : '<p class="text-muted" style="font-size:12px">Nenhum participante adicionado ainda.</p>';
    cont.querySelectorAll('[data-remover-participante]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selecionados.delete(btn.dataset.removerParticipante);
        renderParticipantesSelect();
        renderParticipantesLista();
      });
    });
  }
  renderParticipantesSelect();
  renderParticipantesLista();

  modal.querySelector('#btn-tr-add-participante').addEventListener('click', () => {
    const id = modal.querySelector('#tr-participante-select').value;
    if (!id) return;
    selecionados.add(id);
    renderParticipantesSelect();
    renderParticipantesLista();
  });

  modal.querySelector('#tr-status').addEventListener('change', (e) => {
    modal.querySelector('#tr-motivo-reprovacao-wrap').style.display = e.target.value === 'reprovado' ? '' : 'none';
  });

  modal.querySelector('#form-treinamento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const novoStatus = modal.querySelector('#tr-status').value;
    const payload = {
      empresa_id: empresaAtual.id,
      titulo: modal.querySelector('#tr-titulo').value.trim(),
      descricao: modal.querySelector('#tr-descricao').value.trim() || null,
      tipo: modal.querySelector('#tr-tipo').value,
      modalidade: modal.querySelector('#tr-modalidade').value,
      instrutor_tipo: modal.querySelector('#tr-instrutor-tipo').value || null,
      instrutor_nome: modal.querySelector('#tr-instrutor-nome').value.trim() || null,
      departamento_id: modal.querySelector('#tr-departamento').value || null,
      processo_id: modal.querySelector('#tr-processo').value || null,
      competencia_id: modal.querySelector('#tr-competencia').value || null,
      justificativa: modal.querySelector('#tr-justificativa').value.trim() || null,
      solicitante_id: modal.querySelector('#tr-solicitante').value || null,
      carga_horaria: Number(modal.querySelector('#tr-carga-horaria').value) || 0,
      custo: modal.querySelector('#tr-custo').value ? Number(modal.querySelector('#tr-custo').value) : null,
      data_prevista: modal.querySelector('#tr-data-prevista').value || null,
      data_inicio: modal.querySelector('#tr-data-inicio').value || null,
      data_fim: modal.querySelector('#tr-data-fim').value || null,
      local: modal.querySelector('#tr-local').value.trim() || null,
      status: novoStatus,
      motivo_reprovacao: novoStatus === 'reprovado' ? (modal.querySelector('#tr-motivo-reprovacao').value.trim() || null) : null,
    };
    if (novoStatus === 'aprovado' && item?.status !== 'aprovado') {
      payload.aprovado_por = user.id;
      payload.aprovado_em = new Date().toISOString();
    }
    if (!item) payload.created_by = user.id;

    let treinamentoId = item?.id;
    if (item) {
      const { error } = await supabase.from('treinamentos').update(payload).eq('id', item.id);
      if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    } else {
      const { data: novo, error } = await supabase.from('treinamentos').insert(payload).select('id').single();
      if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
      treinamentoId = novo.id;
    }

    const originais = new Set(item?.participantesIds || []);
    const adicionar = [...selecionados].filter((id) => !originais.has(id));
    const remover = [...originais].filter((id) => !selecionados.has(id));
    if (remover.length) {
      const { error: errRem } = await supabase.from('treinamentos_participantes').delete().eq('treinamento_id', treinamentoId).in('usuario_id', remover);
      if (errRem) return toast('Treinamento salvo, mas houve erro ao atualizar participantes: ' + errRem.message, 'erro');
    }
    if (adicionar.length) {
      const { error: errAdd } = await supabase.from('treinamentos_participantes').insert(adicionar.map((usuario_id) => ({ treinamento_id: treinamentoId, usuario_id })));
      if (errAdd) return toast('Treinamento salvo, mas houve erro ao atualizar participantes: ' + errAdd.message, 'erro');
    }

    toast('Solicitação de treinamento salva com sucesso.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}

// ==================== CRONOGRAMA (mesma fonte de dados de Solicitações, agrupada por mês) ====================
async function renderCronograma(container, state) {
  container.innerHTML = `<div class="card">${renderFiltrosGrupo(state)}<div id="tr-cron-corpo" style="margin-top:1rem">Carregando...</div></div>`;
  wireFiltrosGrupo(container, state);
  const area = container.querySelector('#tr-cron-corpo');

  let dados;
  try {
    dados = await carregarDados(state);
  } catch (err) {
    area.innerHTML = `<div class="alert alert-warning">Erro ao carregar cronograma: ${escapeHtml(err.message)}</div>`;
    return;
  }
  const { treinamentos, departamentos } = dados;
  const nomeDepto = (id) => departamentos.find((d) => d.id === id)?.nome || '—';

  if (!treinamentos.length) {
    area.innerHTML = '<div class="empty-state"><i class="ti ti-calendar"></i>Nenhum treinamento cadastrado ainda.</div>';
    return;
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const chaveMes = (t) => (t.data_inicio || t.data_prevista || '').slice(0, 7); // 'AAAA-MM'
  const porMes = new Map();
  treinamentos.forEach((t) => {
    const chave = chaveMes(t) || 'sem-data';
    if (!porMes.has(chave)) porMes.set(chave, []);
    porMes.get(chave).push(t);
  });
  const mesesOrdenados = [...porMes.keys()].sort();
  const rotuloMes = (chave) => {
    if (chave === 'sem-data') return 'Sem data definida';
    const [ano, mes] = chave.split('-');
    const nome = new Date(Number(ano), Number(mes) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  };
  const atrasado = (t) => t.data_prevista && t.data_prevista < hoje && !['concluido', 'fechado', 'cancelado'].includes(t.status);

  area.innerHTML = mesesOrdenados.map((chave) => `
    <div class="cronograma-mes">
      <p class="cronograma-mes-titulo">${rotuloMes(chave)} <span class="text-muted" style="font-weight:400">(${porMes.get(chave).length})</span></p>
      <div class="cronograma-grid">
        ${porMes.get(chave).map((t) => `
          <div class="cronograma-card ${atrasado(t) ? 'cronograma-card-atrasado' : ''}">
            <div class="cronograma-card-status">
              <span class="badge ${STATUS_BADGE[t.status]}">${STATUS_LABEL[t.status]}</span>
              ${atrasado(t) ? '<span class="badge badge-danger">Atrasado</span>' : ''}
            </div>
            <p class="cronograma-card-titulo">${escapeHtml(t.titulo)}</p>
            <p class="cronograma-card-meta">${escapeHtml(t.numero)} · ${TIPO_LABEL[t.tipo] || '—'} · ${escapeHtml(nomeDepto(t.departamento_id))}</p>
            <p class="cronograma-card-meta">${formatarData(t.data_inicio || t.data_prevista) || 'Sem data'} · ${t.carga_horaria}h</p>
          </div>`).join('')}
      </div>
    </div>
  `).join('');
}

// ==================== FECHAMENTO (presença + conclusão + análise de eficácia) ====================
let fechamentoTreinamentoId = null;

async function renderFechamento(container, state) {
  const { supabase, empresaAtual } = state;
  container.innerHTML = `<div class="card">${renderFiltrosGrupo(state)}<div id="tr-fec-corpo" style="margin-top:1rem"></div></div>`;
  wireFiltrosGrupo(container, state);
  const area = container.querySelector('#tr-fec-corpo');

  const { data: treinamentos, error } = await supabase.from('treinamentos').select('id, numero, titulo, status')
    .eq('empresa_id', empresaAtual.id).in('status', ['em_execucao', 'concluido', 'fechado']).order('numero', { ascending: false });
  if (error) {
    area.innerHTML = `<div class="alert alert-warning">Erro ao carregar: ${escapeHtml(error.message)}</div>`;
    return;
  }

  area.innerHTML = `
    <div class="form-group" style="max-width:460px">
      <label>Selecione o treinamento</label>
      <select id="fec-treinamento-select">
        <option value="">— Selecione —</option>
        ${(treinamentos || []).map((t) => `<option value="${t.id}" ${t.id === fechamentoTreinamentoId ? 'selected' : ''}>${escapeHtml(t.numero)} — ${escapeHtml(t.titulo)} (${STATUS_LABEL[t.status]})</option>`).join('')}
      </select>
    </div>
    <div id="fec-corpo-treinamento" style="margin-top:1rem"></div>
  `;

  area.querySelector('#fec-treinamento-select').addEventListener('change', (e) => {
    fechamentoTreinamentoId = e.target.value || null;
    render(container, state);
  });

  if (!treinamentos?.length) {
    area.querySelector('#fec-corpo-treinamento').innerHTML = '<div class="empty-state"><i class="ti ti-checkbox"></i>Nenhum treinamento em execução, concluído ou fechado ainda.</div>';
    return;
  }
  if (!fechamentoTreinamentoId) {
    area.querySelector('#fec-corpo-treinamento').innerHTML = '<div class="empty-state"><i class="ti ti-checkbox"></i>Selecione um treinamento acima para registrar presença, conclusão e eficácia.</div>';
    return;
  }
  await renderCorpoFechamento(area.querySelector('#fec-corpo-treinamento'), state, fechamentoTreinamentoId, container);
}

async function renderCorpoFechamento(area, state, treinamentoId, container) {
  const { supabase, empresaAtual } = state;
  area.innerHTML = 'Carregando...';

  const [{ data: treinamento }, { data: participantesData }, { data: membrosData }] = await Promise.all([
    supabase.from('treinamentos').select('*').eq('id', treinamentoId).single(),
    supabase.from('treinamentos_participantes').select('*').eq('treinamento_id', treinamentoId),
    supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }),
  ]);
  if (!treinamento) {
    area.innerHTML = '<div class="alert alert-warning">Treinamento não encontrado.</div>';
    return;
  }

  const podeEditar = podeEditarTreinamento(state, treinamento);
  const nomePorId = new Map((membrosData || []).map((m) => [m.usuario_id, m.nome || m.email]));
  const participantes = participantesData || [];

  area.innerHTML = `
    <div class="planejamento-box">
      <p class="planejamento-box-titulo"><i class="ti ti-users"></i> Presença e aproveitamento</p>
      ${participantes.length ? `
      <table class="table">
        <thead><tr><th>Participante</th><th>Presente</th><th>Nota</th><th>Observação</th></tr></thead>
        <tbody>
          ${participantes.map((p) => `
            <tr>
              <td>${escapeHtml(nomePorId.get(p.usuario_id) || '—')}</td>
              <td><input type="checkbox" data-presente="${p.usuario_id}" ${p.presente ? 'checked' : ''} ${podeEditar ? '' : 'disabled'}></td>
              <td><input type="number" step="0.1" style="width:70px" data-nota="${p.usuario_id}" value="${p.nota ?? ''}" ${podeEditar ? '' : 'disabled'}></td>
              <td><input type="text" data-obs-participante="${p.usuario_id}" value="${escapeHtml(p.observacao || '')}" ${podeEditar ? '' : 'disabled'}></td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${podeEditar ? '<button type="button" class="btn btn-secondary btn-sm" id="btn-fec-salvar-presenca" style="margin-top:0.75rem">Salvar presença</button>' : ''}
      ` : '<p class="text-muted">Nenhum participante vinculado a este treinamento.</p>'}
    </div>

    <div class="planejamento-box">
      <p class="planejamento-box-titulo"><i class="ti ti-file-check"></i> Conclusão do treinamento</p>
      <textarea id="fec-conclusao" rows="4" placeholder="Resumo de como o treinamento foi realizado, observações gerais...">${escapeHtml(treinamento.conclusao_texto || '')}</textarea>
      <div class="filters" style="margin-top:0.75rem">
        ${podeEditar ? '<button type="button" class="btn btn-secondary btn-sm" id="btn-fec-salvar-conclusao">Salvar conclusão</button>' : ''}
        ${podeEditar && treinamento.status !== 'fechado' ? '<button type="button" class="btn btn-primary btn-sm" id="btn-fec-fechar">Fechar treinamento</button>' : ''}
      </div>
      ${treinamento.status === 'fechado' ? `<p class="text-muted" style="font-size:12px;margin-top:6px">Fechado em ${formatarData((treinamento.fechado_em || '').slice(0, 10))}.</p>` : ''}
    </div>

    <div class="planejamento-box">
      <p class="planejamento-box-titulo"><i class="ti ti-target-arrow"></i> Análise de Eficácia</p>
      <div class="form-group">
        <label>Método de avaliação</label>
        <input type="text" id="fec-eficacia-metodo" placeholder="Ex: prova prática, observação em campo, indicador de qualidade" value="${escapeHtml(treinamento.eficacia_metodo || '')}" ${podeEditar ? '' : 'disabled'}>
      </div>
      <div class="form-group">
        <label>Prazo para avaliar (dias após a conclusão)</label>
        <input type="number" id="fec-eficacia-prazo" min="0" value="${treinamento.eficacia_prazo_dias ?? ''}" ${podeEditar ? '' : 'disabled'}>
      </div>
      <div class="form-group">
        <label>Resultado</label>
        <select id="fec-eficacia-resultado" ${podeEditar ? '' : 'disabled'}>
          <option value="">— Ainda não avaliado —</option>
          ${Object.entries(EFICACIA_LABEL).map(([v, l]) => `<option value="${v}" ${treinamento.eficacia_resultado === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Observações</label>
        <textarea id="fec-eficacia-obs" ${podeEditar ? '' : 'disabled'}>${escapeHtml(treinamento.eficacia_observacoes || '')}</textarea>
      </div>
      ${treinamento.competencia_id
        ? '<p class="text-muted" style="font-size:12px">Resultado "Eficaz" atualiza automaticamente o nível dos participantes presentes na Matriz de Versatilidade.</p>'
        : '<p class="text-muted" style="font-size:12px">Este treinamento não está vinculado a nenhuma competência da Matriz de Versatilidade — o resultado fica só registrado aqui.</p>'}
      ${podeEditar ? '<button type="button" class="btn btn-secondary btn-sm" id="btn-fec-salvar-eficacia" style="margin-top:0.5rem">Salvar análise de eficácia</button>' : ''}
      ${treinamento.eficacia_avaliado_em ? `<p class="text-muted" style="font-size:12px;margin-top:6px">Avaliado em ${formatarData((treinamento.eficacia_avaliado_em || '').slice(0, 10))} por ${escapeHtml(nomePorId.get(treinamento.eficacia_avaliado_por) || '—')}.</p>` : ''}
    </div>
  `;

  if (!podeEditar) return;

  area.querySelector('#btn-fec-salvar-presenca')?.addEventListener('click', async () => {
    const atualizacoes = participantes.map((p) => ({
      id: p.id,
      treinamento_id: p.treinamento_id,
      usuario_id: p.usuario_id,
      presente: area.querySelector(`[data-presente="${p.usuario_id}"]`).checked,
      nota: area.querySelector(`[data-nota="${p.usuario_id}"]`).value ? Number(area.querySelector(`[data-nota="${p.usuario_id}"]`).value) : null,
      observacao: area.querySelector(`[data-obs-participante="${p.usuario_id}"]`).value.trim() || null,
    }));
    const { error } = await supabase.from('treinamentos_participantes').upsert(atualizacoes);
    if (error) return toast('Erro ao salvar presença: ' + error.message, 'erro');
    toast('Presença salva.', 'sucesso');
  });

  area.querySelector('#btn-fec-salvar-conclusao')?.addEventListener('click', async () => {
    const { error } = await supabase.from('treinamentos').update({ conclusao_texto: area.querySelector('#fec-conclusao').value.trim() || null }).eq('id', treinamentoId);
    if (error) return toast('Erro ao salvar conclusão: ' + error.message, 'erro');
    toast('Conclusão salva.', 'sucesso');
  });

  area.querySelector('#btn-fec-fechar')?.addEventListener('click', async () => {
    if (!(await confirmar('Fechar este treinamento? Ele deixa de ser editável na aba Solicitações.'))) return;
    const { error } = await supabase.from('treinamentos').update({
      status: 'fechado',
      fechado_por: state.user.id,
      fechado_em: new Date().toISOString(),
      conclusao_texto: area.querySelector('#fec-conclusao').value.trim() || null,
    }).eq('id', treinamentoId);
    if (error) return toast('Erro ao fechar: ' + error.message, 'erro');
    toast('Treinamento fechado.', 'sucesso');
    render(container, state);
  });

  area.querySelector('#btn-fec-salvar-eficacia')?.addEventListener('click', async () => {
    const resultado = area.querySelector('#fec-eficacia-resultado').value || null;
    const payload = {
      eficacia_metodo: area.querySelector('#fec-eficacia-metodo').value.trim() || null,
      eficacia_prazo_dias: area.querySelector('#fec-eficacia-prazo').value ? Number(area.querySelector('#fec-eficacia-prazo').value) : null,
      eficacia_resultado: resultado,
      eficacia_observacoes: area.querySelector('#fec-eficacia-obs').value.trim() || null,
    };
    if (resultado) {
      payload.eficacia_avaliado_por = state.user.id;
      payload.eficacia_avaliado_em = new Date().toISOString();
    }
    const { error } = await supabase.from('treinamentos').update(payload).eq('id', treinamentoId);
    if (error) return toast('Erro ao salvar análise de eficácia: ' + error.message, 'erro');
    toast('Análise de eficácia salva.' + (resultado === 'eficaz' ? ' Matriz de Versatilidade atualizada para os participantes presentes.' : ''), 'sucesso');
    renderCorpoFechamento(area, state, treinamentoId, container);
  });
}

// ==================== MATRIZ DE VERSATILIDADE ====================
async function renderVersatilidade(container, state) {
  const { supabase, empresaAtual } = state;
  container.innerHTML = `<div class="card">${renderFiltrosGrupo(state)}<div id="tr-vers-corpo" style="margin-top:1rem">Carregando...</div></div>`;
  wireFiltrosGrupo(container, state);
  const area = container.querySelector('#tr-vers-corpo');
  const podeEditar = podeEditarVersatilidade(state);

  let competencias, membros, niveis;
  try {
    const [competenciasRes, membrosRes, niveisRes] = await Promise.all([
      supabase.from('treinamentos_competencias').select('*').eq('empresa_id', empresaAtual.id).order('nome'),
      supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }),
      supabase.from('treinamentos_versatilidade').select('*').eq('empresa_id', empresaAtual.id),
    ]);
    if (competenciasRes.error) throw competenciasRes.error;
    if (niveisRes.error) throw niveisRes.error;
    competencias = competenciasRes.data || [];
    membros = membrosRes.data || [];
    niveis = niveisRes.data || [];
  } catch (err) {
    area.innerHTML = `<div class="alert alert-warning">Erro ao carregar matriz: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const nivelDe = (usuarioId, competenciaId) => niveis.find((n) => n.usuario_id === usuarioId && n.competencia_id === competenciaId)?.nivel ?? 0;
  const competenciasAtivas = competencias.filter((c) => c.ativo);

  area.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      <span style="font-weight:700;font-size:13px;color:var(--navy-titulo)"><i class="ti ti-grid-dots"></i> Matriz de Versatilidade</span>
      ${podeEditar ? '<button class="btn btn-secondary btn-sm" id="btn-vers-nova-competencia"><i class="ti ti-plus"></i> Nova competência</button>' : ''}
    </div>
    ${competenciasAtivas.length ? `
      <div class="versatilidade-legenda">
        ${Object.entries(NIVEL_VERSATILIDADE_LABEL).map(([v, l]) => `<span class="versatilidade-legenda-item"><span class="versatilidade-dot versatilidade-nivel-${v}"></span>${l}</span>`).join('')}
      </div>
      <div class="table-scroll">
        <table class="table versatilidade-tabela">
          <thead>
            <tr>
              <th>Colaborador</th>
              ${competenciasAtivas.map((c) => `<th title="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}${podeEditar ? ` <button type="button" class="icon-btn" data-excluir-competencia="${c.id}" title="Excluir competência"><i class="ti ti-trash"></i></button>` : ''}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${membros.map((m) => `
              <tr>
                <td>${escapeHtml(m.nome || m.email)}</td>
                ${competenciasAtivas.map((c) => `
                  <td>
                    <select class="versatilidade-select versatilidade-nivel-${nivelDe(m.usuario_id, c.id)}" data-usuario="${m.usuario_id}" data-competencia="${c.id}" ${podeEditar ? '' : 'disabled'}>
                      ${Object.entries(NIVEL_VERSATILIDADE_LABEL).map(([v, l]) => `<option value="${v}" ${nivelDe(m.usuario_id, c.id) === Number(v) ? 'selected' : ''}>${v} — ${l}</option>`).join('')}
                    </select>
                  </td>`).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    ` : `<div class="empty-state"><i class="ti ti-grid-dots"></i>Nenhuma competência cadastrada ainda.${podeEditar ? ' Clique em "Nova competência" para começar.' : ''}</div>`}
  `;

  if (!podeEditar) return;

  area.querySelector('#btn-vers-nova-competencia')?.addEventListener('click', () => abrirFormularioCompetencia(state, container));
  area.querySelectorAll('[data-excluir-competencia]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!(await confirmar('Excluir esta competência? Os níveis registrados dos colaboradores nela também são removidos.'))) return;
      const { error } = await supabase.from('treinamentos_competencias').delete().eq('id', btn.dataset.excluirCompetencia);
      if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
      toast('Competência excluída.', 'sucesso');
      render(container, state);
    });
  });
  area.querySelectorAll('.versatilidade-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const payload = {
        empresa_id: empresaAtual.id,
        usuario_id: sel.dataset.usuario,
        competencia_id: sel.dataset.competencia,
        nivel: Number(sel.value),
        atualizado_por: state.user.id,
      };
      const { error } = await supabase.from('treinamentos_versatilidade').upsert(payload, { onConflict: 'usuario_id,competencia_id' });
      if (error) return toast('Erro ao salvar nível: ' + error.message, 'erro');
      sel.className = `versatilidade-select versatilidade-nivel-${sel.value}`;
      toast('Nível atualizado.', 'sucesso');
    });
  });
}

function abrirFormularioCompetencia(state, container) {
  const { supabase, empresaAtual } = state;
  const modal = abrirModal('Nova competência', `
    <form id="form-competencia">
      <div class="form-group">
        <label>Nome</label>
        <input type="text" id="comp-nome" required placeholder="Ex: Operação de empilhadeira">
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);
  modal.querySelector('#form-competencia').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = modal.querySelector('#comp-nome').value.trim();
    if (!nome) return;
    const { error } = await supabase.from('treinamentos_competencias').insert({ empresa_id: empresaAtual.id, nome });
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    toast('Competência criada.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}

// ==================== DASHBOARD ====================
async function renderDashboard(container, state) {
  const { supabase, empresaAtual } = state;
  container.innerHTML = `<div class="card">${renderFiltrosGrupo(state)}<div id="tr-dash-corpo" style="margin-top:1rem">Carregando...</div></div>`;
  wireFiltrosGrupo(container, state);
  const area = container.querySelector('#tr-dash-corpo');

  const { data: treinamentosData } = await supabase.from('treinamentos').select('*').eq('empresa_id', empresaAtual.id);
  const lista = treinamentosData || [];
  const ids = lista.map((t) => t.id);
  const { data: participantesData } = ids.length
    ? await supabase.from('treinamentos_participantes').select('*').in('treinamento_id', ids)
    : { data: [] };
  const participantes = participantesData || [];
  const { data: membros } = await supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id });
  const nomePorId = new Map((membros || []).map((m) => [m.usuario_id, m.nome || m.email]));
  const treinamentoPorId = new Map(lista.map((t) => [t.id, t]));

  const hoje = new Date();
  const mesAtual = hoje.toISOString().slice(0, 7);
  const concluidos = lista.filter((t) => ['concluido', 'fechado'].includes(t.status));
  const horasMes = concluidos
    .filter((t) => (t.data_fim || t.data_inicio || '').slice(0, 7) === mesAtual)
    .reduce((s, t) => s + Number(t.carga_horaria || 0), 0);

  const horasPorColaborador = new Map();
  participantes.forEach((p) => {
    if (!p.presente) return;
    const t = treinamentoPorId.get(p.treinamento_id);
    if (!t || !['concluido', 'fechado'].includes(t.status)) return;
    horasPorColaborador.set(p.usuario_id, (horasPorColaborador.get(p.usuario_id) || 0) + Number(t.carga_horaria || 0));
  });
  const rankingHoras = [...horasPorColaborador.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const planejados = lista.filter((t) => t.status !== 'cancelado').length;
  const realizados = concluidos.length;
  const pctRealizado = planejados ? Math.round((realizados / planejados) * 100) : 0;
  const hojeISO = hoje.toISOString().slice(0, 10);
  const atrasados = lista.filter((t) => t.data_prevista && t.data_prevista < hojeISO && !['concluido', 'fechado', 'cancelado'].includes(t.status)).length;

  const porTipo = {};
  lista.forEach((t) => { porTipo[t.tipo] = (porTipo[t.tipo] || 0) + 1; });

  const eficaciaContagem = { eficaz: 0, parcialmente_eficaz: 0, ineficaz: 0 };
  lista.forEach((t) => { if (t.eficacia_resultado) eficaciaContagem[t.eficacia_resultado]++; });

  area.innerHTML = `
    <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:1.25rem">
      <div class="stat-box" style="padding:14px;border-radius:8px;background:var(--surface-1)"><div class="text-muted" style="font-size:12px">Horas de treinamento no mês</div><div style="font-size:22px;font-weight:700">${horasMes.toFixed(1)}h</div></div>
      <div class="stat-box" style="padding:14px;border-radius:8px;background:var(--surface-1)"><div class="text-muted" style="font-size:12px">Planejados x Realizados</div><div style="font-size:22px;font-weight:700">${planejados} / ${realizados}</div></div>
      <div class="stat-box" style="padding:14px;border-radius:8px;background:var(--surface-1)"><div class="text-muted" style="font-size:12px">% Realizado</div><div style="font-size:22px;font-weight:700">${pctRealizado}%</div></div>
      <div class="stat-box" style="padding:14px;border-radius:8px;background:var(--surface-1)"><div class="text-muted" style="font-size:12px">Atrasados</div><div style="font-size:22px;font-weight:700;color:${atrasados ? '#ef4444' : 'inherit'}">${atrasados}</div></div>
    </div>

    <div class="card" style="padding:14px;margin-bottom:1rem">
      <p style="font-weight:700;color:var(--navy-titulo);margin-bottom:10px">Horas de treinamento por colaborador</p>
      ${rankingHoras.length ? `
        <table class="table">
          <thead><tr><th>Colaborador</th><th>Horas</th></tr></thead>
          <tbody>${rankingHoras.map(([id, h]) => `<tr><td>${escapeHtml(nomePorId.get(id) || '—')}</td><td>${h.toFixed(1)}h</td></tr>`).join('')}</tbody>
        </table>` : '<p class="text-muted">Nenhum treinamento concluído com presença registrada ainda.</p>'}
    </div>

    <div class="card" style="padding:14px;margin-bottom:1rem">
      <p style="font-weight:700;color:var(--navy-titulo);margin-bottom:10px">Treinamentos por tipo</p>
      ${Object.entries(TIPO_LABEL).map(([v, l]) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span>${l}</span><span class="badge badge-neutral">${porTipo[v] || 0}</span></div>
      `).join('')}
    </div>

    <div class="card" style="padding:14px">
      <p style="font-weight:700;color:var(--navy-titulo);margin-bottom:10px">Resultado da análise de eficácia</p>
      ${Object.entries(EFICACIA_LABEL).map(([v, l]) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span>${l}</span><span class="badge ${EFICACIA_BADGE[v]}">${eficaciaContagem[v]}</span></div>
      `).join('')}
    </div>
  `;
}
