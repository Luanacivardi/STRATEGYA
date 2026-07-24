import { abrirModal, fecharModal, toast, escapeHtml, confirmar, imprimirSecao, resolverNivel } from '../ui.js';

// Organograma da empresa: hierarquia de cargos/pessoas. Não é um editor de arrastar-e-soltar —
// você cadastra o cargo e escolhe o superior imediato numa lista, e o desenho (árvore com caixas
// e linhas de conexão) é montado automaticamente a partir da hierarquia informada.

async function carregarCargos(supabase, empresaId) {
  const { data, error } = await supabase.from('organograma_cargos').select('*').eq('empresa_id', empresaId);
  if (error) throw error;
  return data;
}

// Monta a árvore a partir da lista plana (cada cargo aponta pro superior_id) — cargos sem
// superior, ou cujo superior não existe mais na lista, viram raízes (nível 1 do organograma).
function montarArvore(cargos) {
  const porId = new Map(cargos.map((c) => [c.id, { ...c, filhos: [] }]));
  const raizes = [];
  for (const c of porId.values()) {
    if (c.superior_id && porId.has(c.superior_id)) porId.get(c.superior_id).filhos.push(c);
    else raizes.push(c);
  }
  const ordenar = (lista) => {
    lista.sort((a, b) => a.ordem - b.ordem || a.nome_cargo.localeCompare(b.nome_cargo));
    lista.forEach((c) => ordenar(c.filhos));
    return lista;
  };
  return ordenar(raizes);
}

// ids de todos os descendentes de um cargo — usado pra não deixar escolher um subordinado (direto
// ou indireto) como novo superior dele mesmo, o que criaria um ciclo na hierarquia.
function idsDescendentes(cargo) {
  const ids = [];
  for (const filho of cargo.filhos) {
    ids.push(filho.id, ...idsDescendentes(filho));
  }
  return ids;
}

export async function render(container, state) {
  const { supabase, empresaAtual } = state;
  const podeEditar = resolverNivel(state, 'planejamento-estrategico', 'contexto-organograma') === 'total';

  let cargos;
  try {
    cargos = await carregarCargos(supabase, empresaAtual.id);
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar organograma: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const raizes = montarArvore(cargos);

  function renderNo(cargo) {
    return `
      <li>
        <div class="org-box" data-id="${cargo.id}">
          <div class="org-box-cargo">${escapeHtml(cargo.nome_cargo)}</div>
          ${cargo.nome_pessoa ? `<div class="org-box-pessoa">${escapeHtml(cargo.nome_pessoa)}</div>` : ''}
          ${podeEditar ? `
            <div class="org-box-acoes">
              <button type="button" class="icon-btn" data-add-subordinado="${cargo.id}" title="Adicionar subordinado"><i class="ti ti-plus"></i></button>
              <button type="button" class="icon-btn" data-editar="${cargo.id}" title="Editar"><i class="ti ti-pencil"></i></button>
              <button type="button" class="icon-btn" data-excluir="${cargo.id}" title="Excluir"><i class="ti ti-trash"></i></button>
            </div>` : ''}
        </div>
        ${cargo.filhos.length ? `<ul>${cargo.filhos.map(renderNo).join('')}</ul>` : ''}
      </li>`;
  }

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      <span style="font-weight:700;font-size:13px;color:var(--navy-titulo)"><i class="ti ti-sitemap"></i> Organograma</span>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" id="btn-imprimir-organograma"><i class="ti ti-printer"></i> Imprimir</button>
        ${podeEditar ? '<button class="btn btn-primary btn-sm" id="btn-add-cargo-topo"><i class="ti ti-plus"></i> Novo cargo</button>' : ''}
      </div>
    </div>
    ${raizes.length
      ? `<div class="org-tree-wrap"><div class="org-tree"><ul>${raizes.map(renderNo).join('')}</ul></div></div>`
      : `<div class="empty-state"><i class="ti ti-sitemap"></i>Nenhum cargo cadastrado ainda.${podeEditar ? ' Clique em "Novo cargo" para começar.' : ''}</div>`}
  `;

  container.querySelector('#btn-imprimir-organograma')?.addEventListener('click', () => imprimirOrganograma(raizes, empresaAtual.nome));

  if (!podeEditar) return;

  container.querySelector('#btn-add-cargo-topo')?.addEventListener('click', () => abrirFormulario(state, container, cargos, raizes));

  container.querySelectorAll('[data-add-subordinado]').forEach((btn) => {
    btn.addEventListener('click', () => abrirFormulario(state, container, cargos, raizes, null, btn.dataset.addSubordinado));
  });

  container.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = cargos.find((c) => c.id === btn.dataset.editar);
      abrirFormulario(state, container, cargos, raizes, item);
    });
  });

  container.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const temFilhos = cargos.some((c) => c.superior_id === btn.dataset.excluir);
      const aviso = temFilhos
        ? 'Excluir este cargo? Os subordinados diretos dele passam a ficar sem superior (topo da hierarquia).'
        : 'Excluir este cargo?';
      if (!(await confirmar(aviso))) return;
      const { error } = await supabase.from('organograma_cargos').delete().eq('id', btn.dataset.excluir);
      if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
      toast('Cargo excluído.', 'sucesso');
      render(container, state);
    });
  });
}

function abrirFormulario(state, container, cargos, raizes, item = null, superiorPreDefinidoId = null) {
  const { supabase, empresaAtual } = state;

  // Ao editar, remove o próprio cargo e todos os seus descendentes da lista de possíveis
  // superiores — senão daria pra criar um ciclo (ex: promover um subordinado a chefe do próprio chefe).
  const idsExcluidos = new Set(item ? [item.id, ...idsDescendentes(buscarNaArvore(raizes, item.id) || { filhos: [] })] : []);
  const opcoesSuperior = cargos.filter((c) => !idsExcluidos.has(c.id));

  const modal = abrirModal(item ? 'Editar cargo' : 'Novo cargo', `
    <form id="form-cargo">
      <div class="form-group">
        <label>Cargo</label>
        <input type="text" id="org-nome-cargo" required value="${item ? escapeHtml(item.nome_cargo) : ''}" placeholder="Ex: Diretor Comercial">
      </div>
      <div class="form-group">
        <label>Pessoa (opcional)</label>
        <input type="text" id="org-nome-pessoa" value="${item ? escapeHtml(item.nome_pessoa || '') : ''}" placeholder="Quem ocupa o cargo hoje">
      </div>
      <div class="form-group">
        <label>Superior imediato</label>
        <select id="org-superior">
          <option value="">— Topo da hierarquia —</option>
          ${opcoesSuperior.map((c) => `<option value="${c.id}" ${(item ? item.superior_id === c.id : superiorPreDefinidoId === c.id) ? 'selected' : ''}>${escapeHtml(c.nome_cargo)}${c.nome_pessoa ? ` (${escapeHtml(c.nome_pessoa)})` : ''}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#form-cargo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      empresa_id: empresaAtual.id,
      nome_cargo: modal.querySelector('#org-nome-cargo').value.trim(),
      nome_pessoa: modal.querySelector('#org-nome-pessoa').value.trim() || null,
      superior_id: modal.querySelector('#org-superior').value || null,
    };
    const { error } = item
      ? await supabase.from('organograma_cargos').update(payload).eq('id', item.id)
      : await supabase.from('organograma_cargos').insert(payload);
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    toast('Cargo salvo com sucesso.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}

// Busca um nó (com seus .filhos já montados) em qualquer nível da árvore, pelo id.
function buscarNaArvore(lista, id) {
  for (const c of lista) {
    if (c.id === id) return c;
    const achado = buscarNaArvore(c.filhos, id);
    if (achado) return achado;
  }
  return null;
}

// Impressão em lista hierárquica indentada (mais confiável em páginas impressas do que a árvore
// de caixas/linhas da tela, que não pagina bem quando é larga).
function imprimirOrganograma(raizes, empresaNome) {
  const linhas = (lista, nivel) => lista.map((c) => `
    <tr>
      <td style="padding-left:${nivel * 24}px">${nivel > 0 ? '↳ ' : ''}${escapeHtml(c.nome_cargo)}</td>
      <td>${escapeHtml(c.nome_pessoa || '—')}</td>
    </tr>
    ${linhas(c.filhos, nivel + 1)}
  `).join('');

  imprimirSecao(`
    <h2 style="margin-bottom:4px">Organograma</h2>
    <p class="text-muted">${escapeHtml(empresaNome)}</p>
    <hr class="sep">
    ${raizes.length ? `
      <table class="print-detalhe-tabela">
        <thead><tr><th>Cargo</th><th>Pessoa</th></tr></thead>
        <tbody>${linhas(raizes, 0)}</tbody>
      </table>
    ` : '<p>Nenhum cargo cadastrado.</p>'}
  `);
}
