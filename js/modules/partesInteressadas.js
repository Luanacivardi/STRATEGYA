import { abrirModal, fecharModal, toast, escapeHtml, confirmar, resolverNivel } from '../ui.js';

const INFLUENCIA_BADGE = { baixo: 'badge-neutral', medio: 'badge-warning', alto: 'badge-danger' };
const INFLUENCIA_LABEL = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' };

export async function render(container, state) {
  const { supabase, empresaAtual, papelAtual } = state;
  const podeEditar = resolverNivel(state, 'planejamento-estrategico', 'contexto-partes') === 'total';

  const { data, error } = await supabase
    .from('partes_interessadas')
    .select('*')
    .eq('empresa_id', empresaAtual.id);

  if (error) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar: ${escapeHtml(error.message)}</div>`;
    return;
  }
  const itens = [...data].sort((a, b) => a.nome.localeCompare(b.nome));

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
      <span style="font-weight:700;font-size:13px;color:var(--navy-titulo)"><i class="ti ti-users-group"></i> Partes Interessadas</span>
      ${podeEditar ? '<button class="btn btn-primary btn-sm" id="btn-add-parte"><i class="ti ti-plus"></i> Nova parte interessada</button>' : ''}
    </div>
    ${itens.length ? `
      <table class="table">
        <thead><tr><th>Nome</th><th>Necessidades de partes interessadas</th><th>Satisfação de partes interessadas</th><th>Influência</th>${podeEditar ? '<th></th>' : ''}</tr></thead>
        <tbody>
          ${itens.map((p) => `
            <tr>
              <td>${escapeHtml(p.nome)}</td>
              <td>${escapeHtml(p.necessidades || '—')}</td>
              <td>${escapeHtml(p.satisfacao || '—')}</td>
              <td><span class="badge ${INFLUENCIA_BADGE[p.nivel_influencia]}">${INFLUENCIA_LABEL[p.nivel_influencia]}</span></td>
              ${podeEditar ? `<td class="table-actions">
                <button class="icon-btn" data-editar="${p.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                <button class="icon-btn" data-excluir="${p.id}" title="Excluir"><i class="ti ti-trash"></i></button>
              </td>` : ''}
            </tr>`).join('')}
        </tbody>
      </table>` : '<div class="empty-state"><i class="ti ti-users-group"></i>Nenhuma parte interessada cadastrada.</div>'}
  `;

  const btnAdd = container.querySelector('#btn-add-parte');
  if (btnAdd) btnAdd.addEventListener('click', () => abrirFormulario(state, container));

  container.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = itens.find((i) => i.id === btn.dataset.editar);
      abrirFormulario(state, container, item);
    });
  });

  container.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Excluir esta parte interessada?'))) return;
      const { error: errDel } = await supabase.from('partes_interessadas').delete().eq('id', btn.dataset.excluir);
      if (errDel) return toast('Erro ao excluir: ' + errDel.message, 'erro');
      toast('Excluído.', 'sucesso');
      render(container, state);
    });
  });
}

function abrirFormulario(state, container, item = null) {
  const { supabase, empresaAtual } = state;
  const modal = abrirModal(item ? 'Editar parte interessada' : 'Nova parte interessada', `
    <form id="form-parte">
      <div class="form-group">
        <label>Nome</label>
        <input type="text" id="pi-nome" placeholder="Cliente, colaborador, fornecedor..." required value="${item ? escapeHtml(item.nome) : ''}">
      </div>
      <div class="form-group">
        <label>Necessidades de partes interessadas</label>
        <textarea id="pi-necessidades" placeholder="O que essa parte interessada espera/precisa?">${item ? escapeHtml(item.necessidades || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label>Satisfação de partes interessadas</label>
        <textarea id="pi-satisfacao" placeholder="Como essa parte interessada avalia/percebe a empresa hoje?">${item ? escapeHtml(item.satisfacao || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label>Nível de influência/impacto</label>
        <select id="pi-influencia" required>
          <option value="baixo" ${item?.nivel_influencia === 'baixo' ? 'selected' : ''}>Baixo</option>
          <option value="medio" ${item?.nivel_influencia === 'medio' ? 'selected' : ''}>Médio</option>
          <option value="alto" ${item?.nivel_influencia === 'alto' ? 'selected' : ''}>Alto</option>
        </select>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#form-parte').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      empresa_id: empresaAtual.id,
      nome: modal.querySelector('#pi-nome').value.trim(),
      necessidades: modal.querySelector('#pi-necessidades').value.trim(),
      satisfacao: modal.querySelector('#pi-satisfacao').value.trim(),
      nivel_influencia: modal.querySelector('#pi-influencia').value,
    };
    const query = item
      ? supabase.from('partes_interessadas').update(payload).eq('id', item.id)
      : supabase.from('partes_interessadas').insert(payload);
    const { error } = await query;
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    toast('Salvo com sucesso.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}
