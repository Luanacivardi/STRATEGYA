import { abrirModal, fecharModal, toast, escapeHtml, confirmar } from '../ui.js';
import { definirFiltroObjetivo } from './planosAcao.js';
import { renderMapa, wireMapa } from './mapaEstrategico.js';

export const PERSPECTIVAS = {
  financeira: 'Financeira',
  clientes: 'Clientes',
  processos_internos: 'Processos Internos',
  aprendizado_crescimento: 'Aprendizado e Crescimento',
};

export const STATUS = {
  nao_iniciado: 'Não iniciado',
  em_andamento: 'Em andamento',
  atingido: 'Atingido',
  atrasado: 'Atrasado',
};

export async function listarObjetivos(supabase, empresaId) {
  const { data, error } = await supabase
    .from('objetivos_estrategicos')
    .select('*')
    .eq('empresa_id', empresaId);
  if (error) throw error;
  return [...data].sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function render(container, state) {
  const { supabase, empresaAtual, papelAtual } = state;
  const podeEditar = papelAtual !== 'usuario';

  let itens, membros, planos;
  try {
    [itens, membros, planos] = await Promise.all([
      listarObjetivos(supabase, empresaAtual.id),
      supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }).then((r) => r.data || []),
      supabase.from('planos_acao').select('id, origem_id').eq('empresa_id', empresaAtual.id).eq('origem', 'objetivo').then((r) => r.data || []),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar objetivos: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const emailPorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));
  const planosPorObjetivo = new Map();
  planos.forEach((p) => planosPorObjetivo.set(p.origem_id, (planosPorObjetivo.get(p.origem_id) || 0) + 1));

  container.innerHTML = `
    ${renderMapa(itens)}
    <div class="card">
      <div class="card-header">
        <span><i class="ti ti-flag"></i> Objetivos Estratégicos</span>
        ${podeEditar ? '<button class="btn btn-primary btn-sm" id="btn-add-objetivo"><i class="ti ti-plus"></i> Novo objetivo</button>' : ''}
      </div>
      ${itens.length ? `
        <table class="table">
          <thead><tr><th>Objetivo</th><th>Perspectiva</th><th>Responsável</th><th>Status</th><th>Plano de Ação</th>${podeEditar ? '<th></th>' : ''}</tr></thead>
          <tbody>
            ${itens.map((o) => `
              <tr>
                <td><strong>${escapeHtml(o.nome)}</strong><br><span class="text-muted">${escapeHtml(o.descricao || '')}</span></td>
                <td>${PERSPECTIVAS[o.perspectiva_bsc]}</td>
                <td>${escapeHtml(emailPorId.get(o.responsavel_id) || '—')}</td>
                <td><span class="badge status-${o.status}">${STATUS[o.status]}</span></td>
                <td>
                  <button class="btn btn-secondary btn-sm" data-ver-planos="${o.id}">
                    ${planosPorObjetivo.get(o.id) ? `${planosPorObjetivo.get(o.id)} plano(s)` : 'Sem plano — criar'}
                  </button>
                </td>
                ${podeEditar ? `<td class="table-actions">
                  <button class="icon-btn" data-editar="${o.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                  <button class="icon-btn" data-excluir="${o.id}" title="Excluir"><i class="ti ti-trash"></i></button>
                </td>` : ''}
              </tr>`).join('')}
          </tbody>
        </table>` : '<div class="empty-state"><i class="ti ti-flag"></i>Nenhum objetivo estratégico cadastrado.</div>'}
    </div>
  `;

  wireMapa(container);

  const btnAdd = container.querySelector('#btn-add-objetivo');
  if (btnAdd) btnAdd.addEventListener('click', () => abrirFormulario(state, container, membros));

  container.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = itens.find((i) => i.id === btn.dataset.editar);
      abrirFormulario(state, container, membros, item);
    });
  });

  container.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Excluir este objetivo? Indicadores e riscos vinculados perderão o vínculo.'))) return;
      const { error } = await supabase.from('objetivos_estrategicos').delete().eq('id', btn.dataset.excluir);
      if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
      toast('Objetivo excluído.', 'sucesso');
      render(container, state);
    });
  });

  container.querySelectorAll('[data-ver-planos]').forEach((btn) => {
    btn.addEventListener('click', () => {
      definirFiltroObjetivo(btn.dataset.verPlanos);
      document.dispatchEvent(new CustomEvent('strategya:mudar-aba', { detail: { aba: 'planos' } }));
    });
  });
}

function abrirFormulario(state, container, membros, item = null) {
  const { supabase, empresaAtual } = state;
  const modal = abrirModal(item ? 'Editar objetivo estratégico' : 'Novo objetivo estratégico', `
    <form id="form-objetivo">
      <div class="form-group">
        <label>Nome</label>
        <input type="text" id="ob-nome" required value="${item ? escapeHtml(item.nome) : ''}">
      </div>
      <div class="form-group">
        <label>Descrição</label>
        <textarea id="ob-descricao">${item ? escapeHtml(item.descricao || '') : ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Perspectiva BSC</label>
          <select id="ob-perspectiva" required>
            ${Object.entries(PERSPECTIVAS).map(([v, l]) => `<option value="${v}" ${item?.perspectiva_bsc === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="ob-status">
            ${Object.entries(STATUS).map(([v, l]) => `<option value="${v}" ${item?.status === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Responsável</label>
        <select id="ob-responsavel">
          <option value="">—</option>
          ${membros.map((m) => `<option value="${m.usuario_id}" ${item?.responsavel_id === m.usuario_id ? 'selected' : ''}>${escapeHtml(m.nome || m.email)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#form-objetivo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      empresa_id: empresaAtual.id,
      nome: modal.querySelector('#ob-nome').value.trim(),
      descricao: modal.querySelector('#ob-descricao').value.trim(),
      perspectiva_bsc: modal.querySelector('#ob-perspectiva').value,
      status: modal.querySelector('#ob-status').value,
      responsavel_id: modal.querySelector('#ob-responsavel').value || null,
    };
    const query = item
      ? supabase.from('objetivos_estrategicos').update(payload).eq('id', item.id)
      : supabase.from('objetivos_estrategicos').insert(payload);
    const { error } = await query;
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    toast('Objetivo salvo com sucesso.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}
