import { abrirModal, fecharModal, toast, escapeHtml, confirmar } from '../ui.js';

const TIPO_LABEL = { direcao: 'Direção', principal: 'Processo Principal', apoio: 'Processo de Apoio' };

let modoEdicao = false;

export async function render(container, state) {
  const { supabase, empresaAtual, papelAtual } = state;
  // Só entra em modo edição quem tem permissão de escrita; para quem só visualiza, nunca mostra os controles.
  const temPermissaoEdicao = papelAtual !== 'usuario' || state.nivelEdicao === 'total';
  const podeEditar = temPermissaoEdicao && modoEdicao;
  const podeAtivarEdicao = temPermissaoEdicao;

  const { data, error } = await supabase
    .from('macrofluxo_processos')
    .select('*')
    .eq('empresa_id', empresaAtual.id)
    .order('ordem');

  if (error) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar macrofluxo: ${escapeHtml(error.message)}</div>`;
    return;
  }

  // Itens antigos podem ter todos ordem=0 (campo era ignorado antes); desempata pela criação para manter uma ordem estável.
  const itens = [...data].sort((a, b) => a.ordem - b.ordem || a.created_at.localeCompare(b.created_at));

  const porTipo = (tipo) => itens.filter((i) => i.tipo === tipo);

  const botoesMover = (lista, i, index) => {
    if (!podeEditar) return '';
    return `
      <button class="icon-btn" data-mover="${i.id}" data-direcao="esquerda" title="Mover para trás" ${index === 0 ? 'disabled' : ''}><i class="ti ti-arrow-left"></i></button>
      <button class="icon-btn" data-mover="${i.id}" data-direcao="direita" title="Mover para frente" ${index === lista.length - 1 ? 'disabled' : ''}><i class="ti ti-arrow-right"></i></button>`;
  };

  const renderDirecao = () => {
    const direcao = porTipo('direcao');
    return `
      <div class="macro-direcao-losango-wrap">
        <div class="macro-direcao-losango">
          <div class="macro-direcao-conteudo">
            <span class="macro-direcao-label">Direção</span>
            ${direcao.map((i, idx) => `
              <span class="macro-direcao-chip">
                ${i.numero ? `<strong>${escapeHtml(i.numero)}</strong> — ` : ''}${escapeHtml(i.nome)}
                ${podeEditar ? `
                  ${botoesMover(direcao, i, idx)}
                  <button class="icon-btn" data-editar="${i.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                  <button class="icon-btn" data-excluir="${i.id}" title="Excluir"><i class="ti ti-trash"></i></button>
                ` : ''}
              </span>`).join('')}
            ${podeEditar ? '<button class="icon-btn" data-add-tipo="direcao" title="Adicionar"><i class="ti ti-plus"></i></button>' : ''}
          </div>
        </div>
      </div>`;
  };

  const renderPrincipal = () => {
    const principal = porTipo('principal');
    return `
      <div class="macro-chevron-row">
        ${principal.length ? principal.map((i, idx) => `
          ${idx > 0 ? '<div class="macro-conector-linha"><i class="ti ti-arrow-right"></i></div>' : ''}
          <div class="macro-chevron">
            <div class="macro-item-nome">${i.numero ? `<strong>${escapeHtml(i.numero)}</strong> — ` : ''}${escapeHtml(i.nome)}</div>
            ${i.descricao ? `<div class="macro-item-desc">${escapeHtml(i.descricao)}</div>` : ''}
            ${podeEditar ? `<div class="macro-item-actions">
              ${botoesMover(principal, i, idx)}
              <button class="icon-btn" data-editar="${i.id}" title="Editar"><i class="ti ti-pencil"></i></button>
              <button class="icon-btn" data-excluir="${i.id}" title="Excluir"><i class="ti ti-trash"></i></button>
            </div>` : ''}
          </div>`).join('') : '<span class="text-muted">Nenhum processo cadastrado.</span>'}
        ${podeEditar ? '<button class="btn btn-secondary btn-sm" data-add-tipo="principal"><i class="ti ti-plus"></i> Adicionar processo</button>' : ''}
      </div>`;
  };

  const renderApoio = () => {
    const apoio = porTipo('apoio');
    return `
      <div class="macro-apoio-row">
        ${apoio.length ? apoio.map((i, idx) => `
          <div class="macro-apoio-box">
            <div class="macro-item-nome">${i.numero ? `<strong>${escapeHtml(i.numero)}</strong> — ` : ''}${escapeHtml(i.nome)}</div>
            ${i.descricao ? `<div class="macro-item-desc">${escapeHtml(i.descricao)}</div>` : ''}
            ${podeEditar ? `<div class="macro-item-actions">
              ${botoesMover(apoio, i, idx)}
              <button class="icon-btn" data-editar="${i.id}" title="Editar"><i class="ti ti-pencil"></i></button>
              <button class="icon-btn" data-excluir="${i.id}" title="Excluir"><i class="ti ti-trash"></i></button>
            </div>` : ''}
          </div>`).join('') : '<span class="text-muted">Nenhum processo cadastrado.</span>'}
        ${podeEditar ? '<button class="btn btn-secondary btn-sm" data-add-tipo="apoio"><i class="ti ti-plus"></i> Adicionar processo</button>' : ''}
      </div>`;
  };

  container.innerHTML = `
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px">
      <button class="btn btn-secondary btn-sm" id="btn-macro-tela-cheia"><i class="ti ti-maximize"></i> Tela cheia</button>
      ${podeAtivarEdicao ? `
        <button class="btn ${modoEdicao ? 'btn-primary' : 'btn-secondary'} btn-sm" id="btn-toggle-modo-edicao">
          <i class="ti ${modoEdicao ? 'ti-check' : 'ti-edit'}"></i> ${modoEdicao ? 'Concluir edição' : 'Modo edição'}
        </button>` : ''}
    </div>

    <div class="macro-mapa">
      ${renderDirecao()}

      <div class="macro-principal-wrap">
        <div class="macro-cliente-tab macro-cliente-entrada">
          <span>Expectativas das Partes Interessadas</span>
          <i class="ti ti-arrow-right"></i>
        </div>
        <div class="macro-principal-corpo">
          <div class="macro-mapa-secao-titulo" style="text-align:center">Processos Principais</div>
          ${renderPrincipal()}
        </div>
        <div class="macro-cliente-tab macro-cliente-saida">
          <i class="ti ti-arrow-right"></i>
          <span>Satisfação das Partes Interessadas</span>
        </div>
      </div>

      <div class="macro-conectores-apoio" aria-hidden="true">
        ${'<i class="ti ti-arrow-up"></i>'.repeat(Math.min(Math.max(porTipo('apoio').length, 2), 8))}
      </div>
      <div class="macro-mapa-secao-titulo">Processos de Apoio</div>
      ${renderApoio()}
    </div>
  `;

  container.querySelector('#btn-macro-tela-cheia').addEventListener('click', () => abrirTelaCheiaMacrofluxo(itens));

  const btnToggle = container.querySelector('#btn-toggle-modo-edicao');
  if (btnToggle) btnToggle.addEventListener('click', () => { modoEdicao = !modoEdicao; render(container, state); });

  container.querySelectorAll('[data-add-tipo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const proximaOrdem = porTipo(btn.dataset.addTipo).length;
      abrirFormulario(state, container, btn.dataset.addTipo, null, proximaOrdem);
    });
  });

  container.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = itens.find((i) => i.id === btn.dataset.editar);
      abrirFormulario(state, container, item.tipo, item);
    });
  });

  container.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Excluir este item do macrofluxo?'))) return;
      const { error: errDel } = await supabase.from('macrofluxo_processos').delete().eq('id', btn.dataset.excluir);
      if (errDel) return toast('Erro ao excluir: ' + errDel.message, 'erro');
      toast('Item excluído.', 'sucesso');
      render(container, state);
    });
  });

  container.querySelectorAll('[data-mover]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = itens.find((i) => i.id === btn.dataset.mover);
      const lista = porTipo(item.tipo);
      const index = lista.findIndex((i) => i.id === item.id);
      const alvoIndex = btn.dataset.direcao === 'esquerda' ? index - 1 : index + 1;
      if (alvoIndex < 0 || alvoIndex >= lista.length) return;

      // Itens antigos podem ter ordem repetida (ex: todos 0), então em vez de só trocar os dois
      // valores, renumera a lista inteira do tipo em sequência (0,1,2...) após o swap visual.
      const listaReordenada = [...lista];
      [listaReordenada[index], listaReordenada[alvoIndex]] = [listaReordenada[alvoIndex], listaReordenada[index]];

      const atualizacoes = listaReordenada.map((i, novaOrdem) =>
        supabase.from('macrofluxo_processos').update({ ordem: novaOrdem }).eq('id', i.id));
      const resultados = await Promise.all(atualizacoes);
      const erro = resultados.find((r) => r.error)?.error;
      if (erro) return toast('Erro ao reordenar: ' + erro.message, 'erro');
      render(container, state);
    });
  });
}

// Visualização somente-leitura em tela cheia (mesmo padrão apresentacao-overlay usado em
// Indicadores/Controladoria), pra melhor leitura em reunião ou projeção.
function abrirTelaCheiaMacrofluxo(itens) {
  const porTipo = (tipo) => itens.filter((i) => i.tipo === tipo);
  const rotulo = (i) => `${i.numero ? `<strong>${escapeHtml(i.numero)}</strong> — ` : ''}${escapeHtml(i.nome)}`;

  const direcao = porTipo('direcao');
  const principal = porTipo('principal');
  const apoio = porTipo('apoio');

  const overlay = document.createElement('div');
  overlay.className = 'apresentacao-overlay';
  overlay.innerHTML = `
    <button class="apresentacao-fechar" id="mf-fechar" title="Fechar"><i class="ti ti-x"></i></button>
    <div class="apresentacao-conteudo">
      <h1>Macrofluxo</h1>
      <div class="macro-mapa" style="margin-top:20px">
        <div class="macro-direcao-losango-wrap">
          <div class="macro-direcao-losango">
            <div class="macro-direcao-conteudo">
              <span class="macro-direcao-label">Direção</span>
              ${direcao.map((i) => `<span class="macro-direcao-chip">${rotulo(i)}</span>`).join('')}
            </div>
          </div>
        </div>
        <div class="macro-principal-wrap">
          <div class="macro-cliente-tab macro-cliente-entrada"><span>Expectativas das Partes Interessadas</span><i class="ti ti-arrow-right"></i></div>
          <div class="macro-principal-corpo">
            <div class="macro-mapa-secao-titulo" style="text-align:center">Processos Principais</div>
            <div class="macro-chevron-row">
              ${principal.length ? principal.map((i, idx) => `
                ${idx > 0 ? '<div class="macro-conector-linha"><i class="ti ti-arrow-right"></i></div>' : ''}
                <div class="macro-chevron">
                  <div class="macro-item-nome">${rotulo(i)}</div>
                  ${i.descricao ? `<div class="macro-item-desc">${escapeHtml(i.descricao)}</div>` : ''}
                </div>`).join('') : '<span class="text-muted">Nenhum processo cadastrado.</span>'}
            </div>
          </div>
          <div class="macro-cliente-tab macro-cliente-saida"><i class="ti ti-arrow-right"></i><span>Satisfação das Partes Interessadas</span></div>
        </div>
        <div class="macro-conectores-apoio" aria-hidden="true">
          ${'<i class="ti ti-arrow-up"></i>'.repeat(Math.min(Math.max(apoio.length, 2), 8))}
        </div>
        <div class="macro-mapa-secao-titulo">Processos de Apoio</div>
        <div class="macro-apoio-row">
          ${apoio.length ? apoio.map((i) => `
            <div class="macro-apoio-box">
              <div class="macro-item-nome">${rotulo(i)}</div>
              ${i.descricao ? `<div class="macro-item-desc">${escapeHtml(i.descricao)}</div>` : ''}
            </div>`).join('') : '<span class="text-muted">Nenhum processo cadastrado.</span>'}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const fechar = () => { overlay.remove(); document.removeEventListener('keydown', onEsc); };
  overlay.querySelector('#mf-fechar').addEventListener('click', fechar);
  const onEsc = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', onEsc);
}

function abrirFormulario(state, container, tipo, item = null, proximaOrdem = 0) {
  const { supabase, empresaAtual } = state;
  const modal = abrirModal(item ? `Editar item — ${TIPO_LABEL[tipo]}` : `Novo item — ${TIPO_LABEL[tipo]}`, `
    <form id="form-macro">
      <div class="form-group">
        <label>Número${tipo !== 'direcao' ? ' (usado futuramente para vincular documentos na aba Documentos)' : ''}</label>
        <input type="text" id="macro-numero" placeholder="Ex: 3.1" value="${item ? escapeHtml(item.numero || '') : ''}">
      </div>
      <div class="form-group">
        <label>Nome</label>
        <input type="text" id="macro-nome" required value="${item ? escapeHtml(item.nome) : ''}">
      </div>
      <div class="form-group">
        <label>Descrição (opcional)</label>
        <textarea id="macro-descricao">${item ? escapeHtml(item.descricao || '') : ''}</textarea>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#form-macro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      empresa_id: empresaAtual.id,
      tipo,
      numero: modal.querySelector('#macro-numero').value.trim() || null,
      nome: modal.querySelector('#macro-nome').value.trim(),
      descricao: modal.querySelector('#macro-descricao').value.trim(),
    };
    if (!item) payload.ordem = proximaOrdem;
    const query = item
      ? supabase.from('macrofluxo_processos').update(payload).eq('id', item.id)
      : supabase.from('macrofluxo_processos').insert(payload);
    const { error } = await query;
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    toast('Item salvo com sucesso.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}
