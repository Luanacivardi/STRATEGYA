import { abrirModal, fecharModal, toast, escapeHtml, confirmar, imprimirSecao, resolverNivel } from '../ui.js';

// Organograma da empresa: hierarquia de cargos/pessoas. Não é um editor de arrastar-e-soltar —
// você cadastra o cargo e escolhe o superior imediato numa lista, e o desenho é montado
// automaticamente a partir da hierarquia informada.
//
// Tela e impressão: caixas conectadas por linha (organograma clássico), coloridas por ramo —
// cada filho direto da raiz recebe uma cor da paleta da empresa e os descendentes dele herdam
// tons progressivamente mais claros da mesma cor. Continua expansível/recolhível por cargo (ver
// `expandidos`) porque organogramas reais podem ter dezenas de cargos e vários níveis — só assim
// isso continua navegável numa tela comum (a rolagem horizontal própria cobre o resto).

// ids dos cargos com o próprio "ramo" (filhos) visível — controla o recolher/expandir do organograma.
// Recriado a cada troca de empresa/re-render vindo de fora; preservado entre re-renders internos
// (expandir/recolher/editar) pra não fechar tudo de novo a cada ação.
let expandidos = null;

// ---------- Cores dos ramos: paleta dinâmica da empresa (--navy/--gold, definidas por empresa em
// tema.js) combinada com os acentos fixos do sistema, pra ter variedade mesmo com muitos ramos. ----------
function hexParaRgb(hex) {
  const v = hex.replace('#', '');
  return [parseInt(v.substring(0, 2), 16), parseInt(v.substring(2, 4), 16), parseInt(v.substring(4, 6), 16)];
}
function rgbParaHex(r, g, b) {
  return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}
// Sempre entra e sai em hex — mistura no meio do caminho, sem trocar de formato entre chamadas.
function misturarCores(hexA, hexB, pesoA) {
  const [r1, g1, b1] = hexParaRgb(hexA);
  const [r2, g2, b2] = hexParaRgb(hexB);
  const canal = (a, b) => a * pesoA + b * (1 - pesoA);
  return rgbParaHex(canal(r1, r2), canal(g1, g2), canal(b1, b2));
}
function luminanciaRgb(r, g, b) {
  const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function corTextoParaFundo(hex) {
  const [r, g, b] = hexParaRgb(hex);
  return luminanciaRgb(r, g, b) > 0.6 ? '#1a1a2e' : '#ffffff';
}

function paletaRamos() {
  const raizCss = document.documentElement;
  const navy = getComputedStyle(raizCss).getPropertyValue('--navy').trim() || '#252538';
  const goldDark = getComputedStyle(raizCss).getPropertyValue('--gold-dark').trim() || '#c99d38';
  const navyMid = getComputedStyle(raizCss).getPropertyValue('--navy-mid').trim() || '#2e2e48';
  const sucesso = '#10b981'; // var(--color-success), fixo (não muda por empresa)
  const perigo = '#ef4444'; // var(--color-danger), fixo (não muda por empresa)
  return [
    navy,
    goldDark,
    misturarCores(navy, goldDark, 0.5),
    misturarCores(navy, sucesso, 0.55),
    misturarCores(navy, perigo, 0.55),
    navyMid,
    misturarCores(goldDark, navy, 0.7),
    misturarCores(navy, goldDark, 0.2),
  ];
}

// Tom de um nó dentro do ramo: mais claro quanto mais fundo, com piso pra não lavar demais a cor.
function corDoNo(corRamo, profundidade) {
  const peso = Math.max(0.4, 1 - profundidade * 0.16);
  return peso >= 0.999 ? corRamo : misturarCores(corRamo, '#ffffff', peso);
}

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

  // Primeira carga (ou empresa trocou): abre só a raiz + o primeiro nível — o resto começa
  // recolhido pra não jogar uma árvore de 50+ cargos inteira na tela de uma vez.
  if (!expandidos) expandidos = new Set(raizes.map((r) => r.id));

  const contarDescendentes = (cargo) => cargo.filhos.reduce((n, f) => n + 1 + contarDescendentes(f), 0);
  const paleta = paletaRamos();

  // corRamo null = este cargo é raiz (sem superior): caixa sempre navy, e cada filho direto dele
  // inicia um ramo novo com uma cor da paleta. Dentro de um ramo, a cor se mantém e só clareia
  // conforme a profundidade (profundidadeNoRamo).
  function renderNo(cargo, corRamo, profundidadeNoRamo, ehRaiz) {
    const temFilhos = cargo.filhos.length > 0;
    const aberto = expandidos.has(cargo.id);
    const cor = corRamo ? corDoNo(corRamo, profundidadeNoRamo) : null;
    const corTexto = corRamo ? corTextoParaFundo(cor) : null;
    const estiloCor = corRamo ? `--org-cor:${cor};--org-cor-texto:${corTexto}` : '';

    const box = `
      <div class="org-node ${corRamo ? '' : 'org-node-raiz'}" style="${estiloCor}">
        <div class="org-node-box">
          <div class="org-node-cargo">${escapeHtml(cargo.nome_cargo)}</div>
          ${cargo.nome_pessoa ? `<div class="org-node-pessoa">${escapeHtml(cargo.nome_pessoa)}</div>` : ''}
        </div>
        ${podeEditar ? `
          <div class="org-node-acoes">
            <button type="button" class="icon-btn" data-add-subordinado="${cargo.id}" title="Adicionar subordinado"><i class="ti ti-plus"></i></button>
            <button type="button" class="icon-btn" data-editar="${cargo.id}" title="Editar"><i class="ti ti-pencil"></i></button>
            <button type="button" class="icon-btn" data-excluir="${cargo.id}" title="Excluir"><i class="ti ti-trash"></i></button>
          </div>` : ''}
        ${temFilhos ? `<button type="button" class="org-node-toggle" data-toggle="${cargo.id}" title="${aberto ? 'Recolher' : `Expandir (${contarDescendentes(cargo)} subordinado(s))`}"><i class="ti ${aberto ? 'ti-minus' : 'ti-plus'}"></i></button>` : ''}
      </div>`;

    const filhosHtml = temFilhos && aberto
      ? `<div class="org-chart-filhos">${cargo.filhos.map((f, i) => renderNo(f, corRamo || paleta[i % paleta.length], corRamo ? profundidadeNoRamo + 1 : 0, false)).join('')}</div>`
      : '';

    return `<div class="org-chart-galho${ehRaiz ? ' org-chart-galho--topo' : ''}">${box}${filhosHtml}</div>`;
  }

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      <span style="font-weight:700;font-size:13px;color:var(--navy-titulo)"><i class="ti ti-sitemap"></i> Organograma</span>
      <div style="display:flex;gap:8px">
        ${raizes.length ? `
          <button class="btn btn-secondary btn-sm" id="btn-organograma-expandir-tudo"><i class="ti ti-arrows-maximize"></i> Expandir tudo</button>
          <button class="btn btn-secondary btn-sm" id="btn-organograma-recolher-tudo"><i class="ti ti-arrows-minimize"></i> Recolher tudo</button>
        ` : ''}
        <button class="btn btn-secondary btn-sm" id="btn-imprimir-organograma"><i class="ti ti-printer"></i> Imprimir</button>
        ${podeEditar ? '<button class="btn btn-primary btn-sm" id="btn-add-cargo-topo"><i class="ti ti-plus"></i> Novo cargo</button>' : ''}
      </div>
    </div>
    ${raizes.length
      ? `<div class="org-chart-scroll"><div class="org-chart-raiz-linha">${raizes.map((r) => renderNo(r, null, 0, true)).join('')}</div></div>`
      : `<div class="empty-state"><i class="ti ti-sitemap"></i>Nenhum cargo cadastrado ainda.${podeEditar ? ' Clique em "Novo cargo" para começar.' : ''}</div>`}
  `;

  container.querySelector('#btn-imprimir-organograma')?.addEventListener('click', () => imprimirOrganograma(raizes, empresaAtual.nome));

  container.querySelector('#btn-organograma-expandir-tudo')?.addEventListener('click', () => {
    expandidos = new Set(cargos.filter((c) => cargos.some((f) => f.superior_id === c.id)).map((c) => c.id));
    render(container, state);
  });
  container.querySelector('#btn-organograma-recolher-tudo')?.addEventListener('click', () => {
    expandidos = new Set();
    render(container, state);
  });

  container.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggle;
      if (expandidos.has(id)) expandidos.delete(id); else expandidos.add(id);
      render(container, state);
    });
  });

  if (!podeEditar) return;

  container.querySelector('#btn-add-cargo-topo')?.addEventListener('click', () => abrirFormulario(state, container, cargos, raizes));

  container.querySelectorAll('[data-add-subordinado]').forEach((btn) => {
    btn.addEventListener('click', () => {
      expandidos.add(btn.dataset.addSubordinado); // já abre o ramo pra mostrar o novo subordinado
      abrirFormulario(state, container, cargos, raizes, null, btn.dataset.addSubordinado);
    });
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

// Impressão em lista hierárquica indentada, em folha A4 paisagem com margem pequena (ver
// @page "organograma-print" no CSS) e em colunas — aproveita a largura da paisagem pra caber
// tudo numa folha só, em vez de uma lista estreita e comprida que vira várias páginas em pé
// (um organograma em caixas conectadas como o da tela, com dezenas de cargos, não caberia numa
// folha impressa). Cada cargo vira uma pílula colorida com a mesma cor de ramo usada na tela.
// Cada ramo de topo (diretoria/departamento) é um bloco que não quebra entre colunas
// (break-inside: avoid-column), pra não cortar uma hierarquia no meio.
function imprimirOrganograma(raizes, empresaNome) {
  const paleta = paletaRamos();

  const navyImpressao = getComputedStyle(document.documentElement).getPropertyValue('--navy').trim() || '#252538';
  const linhasRamo = (cargo, nivel, corRamo, profundidadeNoRamo) => {
    const cor = corRamo ? corDoNo(corRamo, profundidadeNoRamo) : navyImpressao;
    const corTexto = corTextoParaFundo(cor);
    return `
    <div class="org-print-linha" style="padding-left:${nivel * 12}px">
      <span class="org-print-chip" style="--org-print-cor:${cor};--org-print-cor-texto:${corTexto}">${escapeHtml(cargo.nome_cargo)}</span>
      ${cargo.nome_pessoa ? `<span class="org-print-pessoa">${escapeHtml(cargo.nome_pessoa)}</span>` : ''}
    </div>
    ${cargo.filhos.map((f, i) => linhasRamo(f, nivel + 1, corRamo || paleta[i % paleta.length], corRamo ? profundidadeNoRamo + 1 : 0)).join('')}
  `;
  };

  imprimirSecao(`
    <div class="org-print-area">
      <h2 style="margin-bottom:2px">Organograma</h2>
      <p class="text-muted" style="margin-bottom:10px">${escapeHtml(empresaNome)}</p>
      ${raizes.length
        ? `<div class="org-print-colunas">${raizes.map((r) => `<div class="org-print-ramo">${linhasRamo(r, 0, null, 0)}</div>`).join('')}</div>`
        : '<p>Nenhum cargo cadastrado.</p>'}
    </div>
  `);
}
