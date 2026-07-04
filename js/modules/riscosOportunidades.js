import { abrirModal, fecharModal, toast, escapeHtml, confirmar } from '../ui.js';
import { listarObjetivos } from './objetivos.js';

const NIVEIS = [1, 2, 3, 4, 5];

function corPorScore(score) {
  if (score <= 6) return '#10b981';
  if (score <= 12) return '#E8B84B';
  return '#ef4444';
}

let filtroTipo = 'todos';

export async function render(container, state) {
  const { supabase, empresaAtual, papelAtual } = state;
  const podeEditar = papelAtual !== 'usuario';

  let itens, objetivos;
  try {
    const [resItens, resObjetivos] = await Promise.all([
      supabase.from('riscos_oportunidades').select('*').eq('empresa_id', empresaAtual.id),
      listarObjetivos(supabase, empresaAtual.id),
    ]);
    if (resItens.error) throw resItens.error;
    itens = [...resItens.data].sort((a, b) => a.descricao.localeCompare(b.descricao));
    objetivos = resObjetivos;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar riscos e oportunidades: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const nomeObjetivoPorId = new Map(objetivos.map((o) => [o.id, o.nome]));
  const itensFiltrados = filtroTipo === 'todos' ? itens : itens.filter((i) => i.tipo === filtroTipo);

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span><i class="ti ti-alert-triangle"></i> Matriz de Probabilidade x Impacto</span>
      </div>
      ${renderMatriz(itens)}
    </div>

    <div class="card">
      <div class="card-header">
        <span><i class="ti ti-list-details"></i> Riscos e Oportunidades</span>
        ${podeEditar ? '<button class="btn btn-primary btn-sm" id="btn-add-risco"><i class="ti ti-plus"></i> Novo item</button>' : ''}
      </div>
      <div class="filters">
        <button class="filter-btn ${filtroTipo === 'todos' ? 'active' : ''}" data-filtro="todos">Todos</button>
        <button class="filter-btn ${filtroTipo === 'risco' ? 'active' : ''}" data-filtro="risco">Riscos</button>
        <button class="filter-btn ${filtroTipo === 'oportunidade' ? 'active' : ''}" data-filtro="oportunidade">Oportunidades</button>
      </div>
      ${itensFiltrados.length ? `
        <table class="table">
          <thead><tr><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Prob.</th><th>Impacto</th><th>Score</th><th>Objetivo vinculado</th>${podeEditar ? '<th></th>' : ''}</tr></thead>
          <tbody>
            ${itensFiltrados.map((i) => `
              <tr>
                <td><span class="badge ${i.tipo === 'risco' ? 'badge-danger' : 'badge-success'}">${i.tipo === 'risco' ? 'Risco' : 'Oportunidade'}</span></td>
                <td>${escapeHtml(i.descricao)}</td>
                <td>${escapeHtml(i.categoria || '—')}</td>
                <td>${i.probabilidade}</td>
                <td>${i.impacto}</td>
                <td><span style="display:inline-block;width:28px;height:20px;border-radius:4px;background:${corPorScore(i.probabilidade * i.impacto)};color:#fff;text-align:center;font-size:11px;line-height:20px;font-weight:700">${i.probabilidade * i.impacto}</span></td>
                <td>${escapeHtml(nomeObjetivoPorId.get(i.objetivo_id) || '—')}</td>
                ${podeEditar ? `<td class="table-actions">
                  <button class="icon-btn" data-editar="${i.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                  <button class="icon-btn" data-excluir="${i.id}" title="Excluir"><i class="ti ti-trash"></i></button>
                </td>` : ''}
              </tr>`).join('')}
          </tbody>
        </table>` : '<div class="empty-state"><i class="ti ti-alert-triangle"></i>Nenhum item cadastrado.</div>'}
    </div>
  `;

  container.querySelectorAll('[data-filtro]').forEach((btn) => {
    btn.addEventListener('click', () => { filtroTipo = btn.dataset.filtro; render(container, state); });
  });

  const btnAdd = container.querySelector('#btn-add-risco');
  if (btnAdd) btnAdd.addEventListener('click', () => abrirFormulario(state, container, objetivos));

  container.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = itens.find((i) => i.id === btn.dataset.editar);
      abrirFormulario(state, container, objetivos, item);
    });
  });

  container.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Excluir este item?'))) return;
      const { error } = await supabase.from('riscos_oportunidades').delete().eq('id', btn.dataset.excluir);
      if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
      toast('Item excluído.', 'sucesso');
      render(container, state);
    });
  });
}

function renderMatriz(itens) {
  const contagem = new Map();
  for (const i of itens) {
    const chave = `${i.probabilidade}-${i.impacto}`;
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  }

  const linhas = [...NIVEIS].reverse().map((prob) => {
    const celulas = NIVEIS.map((impacto) => {
      const qtd = contagem.get(`${prob}-${impacto}`) || 0;
      const cor = corPorScore(prob * impacto);
      return `<td style="background:${cor};color:#fff;text-align:center;font-weight:700;font-size:13px;padding:14px 4px;border-radius:4px">${qtd || ''}</td>`;
    }).join('');
    return `<tr><th style="text-align:right;padding-right:8px;font-size:11px;color:var(--text-secondary)">Prob. ${prob}</th>${celulas}</tr>`;
  }).join('');

  return `
    <table style="border-collapse:separate;border-spacing:4px;margin:0 auto">
      <tbody>${linhas}</tbody>
      <tfoot>
        <tr><th></th>${NIVEIS.map((n) => `<th style="font-size:11px;color:var(--text-secondary);padding-top:4px">Imp. ${n}</th>`).join('')}</tr>
      </tfoot>
    </table>
    <p class="text-muted text-center">Cada célula mostra a quantidade de itens com aquela combinação de probabilidade x impacto.</p>
  `;
}

// Usado quando outro módulo (ex: Contexto/SWOT) navega direto para a análise de um item específico
export async function abrirEdicaoPorId(state, container, id) {
  const { supabase, empresaAtual } = state;
  const [{ data: item, error }, objetivos] = await Promise.all([
    supabase.from('riscos_oportunidades').select('*').eq('id', id).single(),
    listarObjetivos(supabase, empresaAtual.id),
  ]);
  if (error || !item) return toast('Não foi possível abrir a análise deste item.', 'erro');
  abrirFormulario(state, container, objetivos, item);
}

function abrirFormulario(state, container, objetivos, item = null) {
  const { supabase, empresaAtual } = state;
  const modal = abrirModal(item ? 'Editar item' : 'Novo risco ou oportunidade', `
    <form id="form-risco">
      <div class="form-group">
        <label>Tipo</label>
        <select id="ro-tipo" required>
          <option value="risco" ${item?.tipo === 'risco' ? 'selected' : ''}>Risco</option>
          <option value="oportunidade" ${item?.tipo === 'oportunidade' ? 'selected' : ''}>Oportunidade</option>
        </select>
      </div>
      <div class="form-group">
        <label>Descrição</label>
        <textarea id="ro-descricao" required>${item ? escapeHtml(item.descricao) : ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Categoria</label>
          <input type="text" id="ro-categoria" placeholder="Operacional, financeiro, mercado..." value="${item ? escapeHtml(item.categoria || '') : ''}">
        </div>
        <div class="form-group">
          <label>Objetivo vinculado</label>
          <select id="ro-objetivo">
            <option value="">—</option>
            ${objetivos.map((o) => `<option value="${o.id}" ${item?.objetivo_id === o.id ? 'selected' : ''}>${escapeHtml(o.nome)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Probabilidade (1 a 5)</label>
          <select id="ro-probabilidade" required>
            ${NIVEIS.map((n) => `<option value="${n}" ${item?.probabilidade === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Impacto (1 a 5)</label>
          <select id="ro-impacto" required>
            ${NIVEIS.map((n) => `<option value="${n}" ${item?.impacto === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#form-risco').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      empresa_id: empresaAtual.id,
      tipo: modal.querySelector('#ro-tipo').value,
      descricao: modal.querySelector('#ro-descricao').value.trim(),
      categoria: modal.querySelector('#ro-categoria').value.trim(),
      objetivo_id: modal.querySelector('#ro-objetivo').value || null,
      probabilidade: Number(modal.querySelector('#ro-probabilidade').value),
      impacto: Number(modal.querySelector('#ro-impacto').value),
    };
    const query = item
      ? supabase.from('riscos_oportunidades').update(payload).eq('id', item.id)
      : supabase.from('riscos_oportunidades').insert(payload);
    const { error } = await query;
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    toast('Salvo com sucesso.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}
