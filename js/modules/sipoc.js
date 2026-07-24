import { abrirModal, fecharModal, toast, escapeHtml, imprimirSecao, resolverNivel } from '../ui.js';

// SIPOC (Suppliers, Inputs, Process, Outputs, Customers) por processo do Macrofluxo.
// Modelo relacional (não mais texto livre): cada processo tem vários fornecedores/entradas
// cadastrados individualmente. Quando o fornecedor é um processo interno (existe no Macrofluxo),
// essa entrada aparece automaticamente como SAÍDA do processo fornecedor — sem precisar cadastrar
// a mesma informação duas vezes. Saídas para fora do Macrofluxo (Cliente, Governo...) são
// cadastradas manualmente, pois não têm um processo interno de onde derivar.
// Réplica do modelo do Anexo B (Mapa de Processo) usado como referência.

const TIPO_LABEL = { direcao: 'Direção', principal: 'Processo Principal', apoio: 'Processo de Apoio' };
const EXTERNO = '__externo__';

function rotuloProcesso(p) {
  return p.numero ? `${p.numero} — ${p.nome}` : p.nome;
}

async function carregarDados(supabase, empresaId) {
  const [resProcessos, resEntradas, resSaidas, resAtividades, resObjetivos, resIndicadores] = await Promise.all([
    supabase.from('macrofluxo_processos').select('*').eq('empresa_id', empresaId),
    supabase.from('sipoc_entradas').select('*').eq('empresa_id', empresaId),
    supabase.from('sipoc_saidas').select('*').eq('empresa_id', empresaId),
    supabase.from('sipoc').select('*').eq('empresa_id', empresaId),
    supabase.from('objetivos_estrategicos').select('id, nome, processo_id').eq('empresa_id', empresaId).not('processo_id', 'is', null),
    supabase.from('indicadores').select('id, nome, objetivo_id').eq('empresa_id', empresaId).not('objetivo_id', 'is', null),
  ]);
  for (const r of [resProcessos, resEntradas, resSaidas, resAtividades, resObjetivos, resIndicadores]) if (r.error) throw r.error;

  // Mesma ordenação do Macrofluxo: Direção, depois principais, depois apoio.
  const ordemTipo = { direcao: 0, principal: 1, apoio: 2 };
  const processos = [...resProcessos.data].sort((a, b) =>
    ordemTipo[a.tipo] - ordemTipo[b.tipo] || a.ordem - b.ordem || a.created_at.localeCompare(b.created_at));

  // Indicadores agrupados por objetivo, pra montar depois "indicadores dos objetivos deste processo".
  const indicadoresPorObjetivo = new Map();
  for (const i of resIndicadores.data) {
    if (!indicadoresPorObjetivo.has(i.objetivo_id)) indicadoresPorObjetivo.set(i.objetivo_id, []);
    indicadoresPorObjetivo.get(i.objetivo_id).push(i);
  }

  return {
    processos, entradas: resEntradas.data, saidasManuais: resSaidas.data,
    atividadesPorProcesso: new Map(resAtividades.data.map((a) => [a.processo_id, a.atividades])),
    objetivos: resObjetivos.data, indicadoresPorObjetivo,
  };
}

// Monta, para cada processo, a lista de entradas recebidas e a lista de saídas geradas
// (saídas automáticas — espelho das entradas que outros processos registraram tendo este como
// fornecedor — mais as saídas manuais para destinos externos).
function montarEstrutura({ processos, entradas, saidasManuais, atividadesPorProcesso, objetivos, indicadoresPorObjetivo }) {
  const nomeProcesso = new Map(processos.map((p) => [p.id, rotuloProcesso(p)]));
  const entradasPorProcesso = new Map();
  const saidasAutoPorProcesso = new Map();

  const objetivosPorProcesso = new Map();
  for (const o of objetivos || []) {
    if (!objetivosPorProcesso.has(o.processo_id)) objetivosPorProcesso.set(o.processo_id, []);
    objetivosPorProcesso.get(o.processo_id).push(o);
  }

  for (const e of entradas) {
    if (!entradasPorProcesso.has(e.processo_id)) entradasPorProcesso.set(e.processo_id, []);
    entradasPorProcesso.get(e.processo_id).push(e);
    if (e.fornecedor_processo_id) {
      if (!saidasAutoPorProcesso.has(e.fornecedor_processo_id)) saidasAutoPorProcesso.set(e.fornecedor_processo_id, []);
      saidasAutoPorProcesso.get(e.fornecedor_processo_id).push({ descricao: e.descricao, destino: nomeProcesso.get(e.processo_id) || '—' });
    }
  }

  const saidasManuaisPorProcesso = new Map();
  for (const s of saidasManuais) {
    if (!saidasManuaisPorProcesso.has(s.processo_id)) saidasManuaisPorProcesso.set(s.processo_id, []);
    saidasManuaisPorProcesso.get(s.processo_id).push(s);
  }

  return processos.map((p) => {
    const objetivosDoProcesso = objetivosPorProcesso.get(p.id) || [];
    // Junta os indicadores de todos os objetivos deste processo, sem duplicar (um indicador pode
    // medir mais de um objetivo do mesmo processo).
    const indicadoresDoProcesso = new Map();
    for (const o of objetivosDoProcesso) {
      for (const i of indicadoresPorObjetivo.get(o.id) || []) indicadoresDoProcesso.set(i.id, i);
    }
    return {
      processo: p,
      atividades: atividadesPorProcesso.get(p.id) || '',
      entradas: (entradasPorProcesso.get(p.id) || []).sort((a, b) => a.ordem - b.ordem),
      saidasAuto: saidasAutoPorProcesso.get(p.id) || [],
      saidasManuais: (saidasManuaisPorProcesso.get(p.id) || []).sort((a, b) => a.ordem - b.ordem),
      objetivos: objetivosDoProcesso,
      indicadores: [...indicadoresDoProcesso.values()],
    };
  });
}

export async function render(container, state) {
  const { supabase, empresaAtual } = state;
  const podeEditar = resolverNivel(state, 'planejamento-estrategico', 'contexto-sipoc') === 'total';

  let dados;
  try {
    dados = await carregarDados(supabase, empresaAtual.id);
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar SIPOC: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const linhas = montarEstrutura(dados);

  const listaFornecedores = (linha) => linha.entradas.length
    ? `<ul class="sipoc-lista">${linha.entradas.map((e) => `<li><strong>${escapeHtml(e.fornecedor_processo_id ? (dados.processos.find((p) => p.id === e.fornecedor_processo_id) ? rotuloProcesso(dados.processos.find((p) => p.id === e.fornecedor_processo_id)) : '—') : e.fornecedor_externo)}</strong>: ${escapeHtml(e.descricao)}</li>`).join('')}</ul>`
    : '<span class="text-muted">—</span>';

  const listaSaidas = (linha) => {
    const auto = linha.saidasAuto.map((s) => `<li><span class="sipoc-badge-auto" title="Gerada automaticamente a partir da entrada cadastrada no processo de destino"><i class="ti ti-refresh"></i></span> ${escapeHtml(s.descricao)} → <strong>${escapeHtml(s.destino)}</strong></li>`);
    const manuais = linha.saidasManuais.map((s) => `<li>${escapeHtml(s.descricao)} → <strong>${escapeHtml(s.destino_processo_id ? (dados.processos.find((p) => p.id === s.destino_processo_id) ? rotuloProcesso(dados.processos.find((p) => p.id === s.destino_processo_id)) : '—') : s.destino_externo)}</strong></li>`);
    const todas = [...auto, ...manuais];
    return todas.length ? `<ul class="sipoc-lista">${todas.join('')}</ul>` : '<span class="text-muted">—</span>';
  };

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
      <span style="font-weight:700;font-size:13px;color:var(--navy-titulo)"><i class="ti ti-arrows-right-left"></i> SIPOC por Processo</span>
      <button class="btn btn-secondary btn-sm" id="btn-imprimir-sipoc"><i class="ti ti-printer"></i> Imprimir</button>
    </div>
    ${linhas.length ? `
      <table class="table sipoc-tabela">
        <thead><tr>
          <th>Processo</th>
          <th>Fornecedores (S) e Entradas (I)</th>
          <th>Atividades do Processo (P)</th>
          <th>Saídas (O) e Clientes (C)</th>
          ${podeEditar ? '<th></th>' : ''}
        </tr></thead>
        <tbody>
          ${linhas.map((linha) => `
            <tr>
              <td>
                <strong>${escapeHtml(rotuloProcesso(linha.processo))}</strong>
                <br><span class="text-muted" style="font-size:11px">${TIPO_LABEL[linha.processo.tipo] || ''}</span>
              </td>
              <td>${listaFornecedores(linha)}</td>
              <td>${linha.atividades ? escapeHtml(linha.atividades).replaceAll('\n', '<br>') : '<span class="text-muted">—</span>'}</td>
              <td>${listaSaidas(linha)}</td>
              ${podeEditar ? `<td class="table-actions"><button class="icon-btn" data-editar="${linha.processo.id}" title="Editar SIPOC"><i class="ti ti-pencil"></i></button></td>` : ''}
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="text-muted" style="font-size:12px"><i class="ti ti-refresh"></i> = saída sincronizada automaticamente a partir da entrada cadastrada no processo de destino. Os processos vêm do Macrofluxo — para incluir, renomear ou reordenar, use a aba Macrofluxo.</p>
    ` : '<div class="empty-state"><i class="ti ti-arrows-right-left"></i>Nenhum processo cadastrado no Macrofluxo ainda. Cadastre os processos na aba Macrofluxo para descrever o SIPOC de cada um.</div>'}
  `;

  container.querySelector('#btn-imprimir-sipoc')?.addEventListener('click', () => imprimirSipoc(linhas, dados.processos, empresaAtual.nome));

  container.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const linha = linhas.find((l) => l.processo.id === btn.dataset.editar);
      abrirFormulario(state, container, linha, dados.processos);
    });
  });
}

// Impressão no formato do Anexo B (Mapa de Processo) usado como referência: uma página por
// processo, com uma tabela de 5 colunas (Processo de Entrada | Entrada | Atividade do Processo |
// Saída | Processo de Saída). Entradas e saídas são listadas cada uma na sua coluna, lado a lado,
// sem relação linha a linha entre elas (podem ter quantidades diferentes) — a Atividade ocupa uma
// única célula central que se estende por todas as linhas da página (rowspan).
function imprimirSipoc(linhas, processos, empresaNome) {
  const nomeFornecedor = (item, campoInternoId, campoExterno) => (item[campoInternoId]
    ? rotuloProcesso(processos.find((p) => p.id === item[campoInternoId]) || { nome: '—' })
    : item[campoExterno]);

  const paginas = linhas.map((linha) => {
    const entradas = linha.entradas.map((e) => ({ origem: nomeFornecedor(e, 'fornecedor_processo_id', 'fornecedor_externo'), texto: e.descricao }));
    const saidas = [
      ...linha.saidasAuto.map((s) => ({ texto: s.descricao, destino: s.destino })),
      ...linha.saidasManuais.map((s) => ({ texto: s.descricao, destino: nomeFornecedor(s, 'destino_processo_id', 'destino_externo') })),
    ];
    const totalLinhas = Math.max(entradas.length, saidas.length, 1);

    const linhasTabela = Array.from({ length: totalLinhas }).map((_, i) => `
      <tr>
        <td>${entradas[i] ? escapeHtml(entradas[i].origem) : ''}</td>
        <td>${entradas[i] ? escapeHtml(entradas[i].texto) : ''}</td>
        ${i === 0 ? `<td rowspan="${totalLinhas}" class="sipoc-print-atividade">${linha.atividades ? escapeHtml(linha.atividades).replaceAll('\n', '<br>') : '<span class="text-muted">—</span>'}</td>` : ''}
        <td>${saidas[i] ? escapeHtml(saidas[i].texto) : ''}</td>
        <td>${saidas[i] ? escapeHtml(saidas[i].destino) : ''}</td>
      </tr>`).join('');

    return `
      <div class="sipoc-print-pagina">
        <div class="sipoc-print-cabecalho">
          <h2>SIPOC — ${escapeHtml(rotuloProcesso(linha.processo))}</h2>
          <span class="sipoc-print-tipo">${TIPO_LABEL[linha.processo.tipo] || ''}</span>
        </div>
        <table class="sipoc-print-tabela">
          <thead><tr>
            <th>Processo de Entrada</th>
            <th>Entrada</th>
            <th>Atividade do Processo</th>
            <th>Saída</th>
            <th>Processo de Saída</th>
          </tr></thead>
          <tbody>${linhasTabela}</tbody>
        </table>
        <div class="sipoc-print-caixas">
          <div class="sipoc-print-caixa">
            <h3><i class="ti ti-flag"></i> Objetivos Estratégicos deste processo</h3>
            ${linha.objetivos.length
              ? `<ul>${linha.objetivos.map((o) => `<li>${escapeHtml(o.nome)}</li>`).join('')}</ul>`
              : '<p class="sipoc-print-caixa-vazia">Nenhum objetivo vinculado a este processo.</p>'}
          </div>
          <div class="sipoc-print-caixa">
            <h3><i class="ti ti-chart-line"></i> Indicadores que medem esses objetivos</h3>
            ${linha.indicadores.length
              ? `<ul>${linha.indicadores.map((i) => `<li>${escapeHtml(i.nome)}</li>`).join('')}</ul>`
              : '<p class="sipoc-print-caixa-vazia">Nenhum indicador vinculado.</p>'}
          </div>
        </div>
      </div>`;
  }).join('');

  imprimirSecao(`
    <p class="text-muted" style="margin-bottom:14px">${escapeHtml(empresaNome)} · SIPOC por Processo</p>
    ${paginas}
  `);
}

function abrirFormulario(state, container, linha, todosProcessos) {
  const { supabase, empresaAtual } = state;
  const outrosProcessos = todosProcessos.filter((p) => p.id !== linha.processo.id);

  // Cópias de trabalho em memória — só gravadas no banco ao clicar em Salvar.
  const entradas = linha.entradas.map((e) => ({ ...e }));
  const saidasManuais = linha.saidasManuais.map((s) => ({ ...s }));

  const opcoesFornecedor = (selecionadoId) => `
    <option value="">Selecione...</option>
    <option value="${EXTERNO}">Externo (digitar nome)</option>
    ${outrosProcessos.map((p) => `<option value="${p.id}" ${selecionadoId === p.id ? 'selected' : ''}>${escapeHtml(rotuloProcesso(p))}</option>`).join('')}
  `;

  const modal = abrirModal(`SIPOC — ${escapeHtml(rotuloProcesso(linha.processo))}`, `
    <div class="form-group">
      <label><i class="ti ti-truck-delivery"></i> Fornecedores e Entradas</label>
      <p class="text-muted" style="font-size:12px;margin-top:-4px">Quem fornece o quê para este processo. Se o fornecedor for outro processo do Macrofluxo, a entrada aparece automaticamente como saída dele.</p>
      <div id="sipoc-entradas-lista"></div>
      <div class="form-row" style="align-items:end">
        <div class="form-group">
          <label style="font-weight:400;font-size:12px">Fornecedor</label>
          <select id="ne-fornecedor">${opcoesFornecedor(null)}</select>
          <input type="text" id="ne-fornecedor-externo" placeholder="Ex: Cliente, Mercado, Governo..." style="margin-top:6px;display:none">
        </div>
        <div class="form-group">
          <label style="font-weight:400;font-size:12px">Entrada</label>
          <input type="text" id="ne-entrada-descricao" placeholder="O que este fornecedor entrega...">
        </div>
        <div class="form-group"><button type="button" class="btn btn-secondary btn-block" id="btn-add-entrada">Adicionar</button></div>
      </div>
    </div>
    <hr class="sep">
    <div class="form-group">
      <label><i class="ti ti-settings"></i> Atividades do Processo</label>
      <textarea id="sipoc-atividades" placeholder="Principais atividades/etapas do processo...">${escapeHtml(linha.atividades || '')}</textarea>
    </div>
    <hr class="sep">
    <div class="form-group">
      <label><i class="ti ti-refresh"></i> Saídas automáticas</label>
      <p class="text-muted" style="font-size:12px;margin-top:-4px">Geradas a partir das entradas cadastradas nos outros processos. Para alterar, edite a entrada no processo de destino.</p>
      ${linha.saidasAuto.length
        ? `<ul class="sipoc-lista">${linha.saidasAuto.map((s) => `<li>${escapeHtml(s.descricao)} → <strong>${escapeHtml(s.destino)}</strong></li>`).join('')}</ul>`
        : '<p class="text-muted" style="font-size:13px">Nenhuma ainda — apareça aqui quando outro processo cadastrar este como fornecedor.</p>'}
    </div>
    <hr class="sep">
    <div class="form-group">
      <label><i class="ti ti-send"></i> Saídas adicionais (destinos externos ao Macrofluxo)</label>
      <p class="text-muted" style="font-size:12px;margin-top:-4px">Use para saídas que vão para fora do Macrofluxo (Cliente, Governo, Transportadoras...). Saídas para outro processo interno não se cadastram aqui — cadastre a entrada correspondente no processo de destino.</p>
      <div id="sipoc-saidas-lista"></div>
      <div class="form-row" style="align-items:end">
        <div class="form-group">
          <label style="font-weight:400;font-size:12px">Destino</label>
          <select id="ns-destino">${opcoesFornecedor(null)}</select>
          <input type="text" id="ns-destino-externo" placeholder="Ex: Cliente, Governo, Transportadoras..." style="margin-top:6px;display:none">
        </div>
        <div class="form-group">
          <label style="font-weight:400;font-size:12px">Saída</label>
          <input type="text" id="ns-saida-descricao" placeholder="O que é entregue a este destino...">
        </div>
        <div class="form-group"><button type="button" class="btn btn-secondary btn-block" id="btn-add-saida">Adicionar</button></div>
      </div>
    </div>
    <button class="btn btn-primary btn-block" type="button" id="btn-salvar-sipoc"><i class="ti ti-device-floppy"></i> Salvar</button>
  `);
  modal.classList.add('modal-xl');

  const rotuloFornecedor = (item, campoInternoId, campoExterno) => item[campoInternoId]
    ? escapeHtml(rotuloProcesso(todosProcessos.find((p) => p.id === item[campoInternoId]) || { nome: '—' }))
    : escapeHtml(item[campoExterno]);

  function renderEntradas() {
    const area = modal.querySelector('#sipoc-entradas-lista');
    area.innerHTML = entradas.length ? `
      <table class="table">
        <thead><tr><th>Fornecedor</th><th>Entrada</th><th></th></tr></thead>
        <tbody>${entradas.map((e, idx) => `
          <tr>
            <td>${rotuloFornecedor(e, 'fornecedor_processo_id', 'fornecedor_externo')}</td>
            <td>${escapeHtml(e.descricao)}</td>
            <td class="table-actions"><button type="button" class="icon-btn" data-remover-entrada="${idx}" title="Remover"><i class="ti ti-trash"></i></button></td>
          </tr>`).join('')}</tbody>
      </table>` : '<p class="text-muted" style="font-size:13px">Nenhum fornecedor cadastrado ainda.</p>';

    area.querySelectorAll('[data-remover-entrada]').forEach((btn) => btn.addEventListener('click', () => {
      entradas.splice(Number(btn.dataset.removerEntrada), 1);
      renderEntradas();
    }));
  }

  function renderSaidasManuais() {
    const area = modal.querySelector('#sipoc-saidas-lista');
    area.innerHTML = saidasManuais.length ? `
      <table class="table">
        <thead><tr><th>Destino</th><th>Saída</th><th></th></tr></thead>
        <tbody>${saidasManuais.map((s, idx) => `
          <tr>
            <td>${rotuloFornecedor(s, 'destino_processo_id', 'destino_externo')}</td>
            <td>${escapeHtml(s.descricao)}</td>
            <td class="table-actions"><button type="button" class="icon-btn" data-remover-saida="${idx}" title="Remover"><i class="ti ti-trash"></i></button></td>
          </tr>`).join('')}</tbody>
      </table>` : '<p class="text-muted" style="font-size:13px">Nenhuma saída adicional cadastrada ainda.</p>';

    area.querySelectorAll('[data-remover-saida]').forEach((btn) => btn.addEventListener('click', () => {
      saidasManuais.splice(Number(btn.dataset.removerSaida), 1);
      renderSaidasManuais();
    }));
  }

  renderEntradas();
  renderSaidasManuais();

  modal.querySelector('#ne-fornecedor').addEventListener('change', (e) => {
    modal.querySelector('#ne-fornecedor-externo').style.display = e.target.value === EXTERNO ? '' : 'none';
  });
  modal.querySelector('#ns-destino').addEventListener('change', (e) => {
    modal.querySelector('#ns-destino-externo').style.display = e.target.value === EXTERNO ? '' : 'none';
  });

  modal.querySelector('#btn-add-entrada').addEventListener('click', () => {
    const fornecedorSel = modal.querySelector('#ne-fornecedor').value;
    const descricao = modal.querySelector('#ne-entrada-descricao').value.trim();
    if (!fornecedorSel) return toast('Selecione o fornecedor.', 'erro');
    if (fornecedorSel === EXTERNO && !modal.querySelector('#ne-fornecedor-externo').value.trim()) return toast('Digite o nome do fornecedor externo.', 'erro');
    if (!descricao) return toast('Descreva a entrada.', 'erro');
    entradas.push({
      id: null,
      fornecedor_processo_id: fornecedorSel === EXTERNO ? null : fornecedorSel,
      fornecedor_externo: fornecedorSel === EXTERNO ? modal.querySelector('#ne-fornecedor-externo').value.trim() : null,
      descricao,
      ordem: entradas.length,
    });
    modal.querySelector('#ne-fornecedor').value = '';
    modal.querySelector('#ne-fornecedor-externo').value = '';
    modal.querySelector('#ne-fornecedor-externo').style.display = 'none';
    modal.querySelector('#ne-entrada-descricao').value = '';
    renderEntradas();
  });

  modal.querySelector('#btn-add-saida').addEventListener('click', () => {
    const destinoSel = modal.querySelector('#ns-destino').value;
    const descricao = modal.querySelector('#ns-saida-descricao').value.trim();
    if (!destinoSel) return toast('Selecione o destino.', 'erro');
    if (destinoSel === EXTERNO && !modal.querySelector('#ns-destino-externo').value.trim()) return toast('Digite o nome do destino externo.', 'erro');
    if (!descricao) return toast('Descreva a saída.', 'erro');
    saidasManuais.push({
      id: null,
      destino_processo_id: destinoSel === EXTERNO ? null : destinoSel,
      destino_externo: destinoSel === EXTERNO ? modal.querySelector('#ns-destino-externo').value.trim() : null,
      descricao,
      ordem: saidasManuais.length,
    });
    modal.querySelector('#ns-destino').value = '';
    modal.querySelector('#ns-destino-externo').value = '';
    modal.querySelector('#ns-destino-externo').style.display = 'none';
    modal.querySelector('#ns-saida-descricao').value = '';
    renderSaidasManuais();
  });

  modal.querySelector('#btn-salvar-sipoc').addEventListener('click', async () => {
    const atividades = modal.querySelector('#sipoc-atividades').value.trim();

    const { error: errAtividades } = await supabase.from('sipoc')
      .upsert({ empresa_id: empresaAtual.id, processo_id: linha.processo.id, atividades: atividades || null }, { onConflict: 'processo_id' });
    if (errAtividades) return toast('Erro ao salvar atividades: ' + errAtividades.message, 'erro');

    // Substitui todas as entradas/saídas manuais deste processo pelo estado atual da edição
    // (mais simples e seguro que tentar diffar linha a linha, e o volume por processo é pequeno).
    const { error: errDelEntradas } = await supabase.from('sipoc_entradas').delete().eq('processo_id', linha.processo.id);
    if (errDelEntradas) return toast('Erro ao salvar entradas: ' + errDelEntradas.message, 'erro');
    if (entradas.length) {
      const { error: errInsEntradas } = await supabase.from('sipoc_entradas').insert(entradas.map((e, idx) => ({
        empresa_id: empresaAtual.id,
        processo_id: linha.processo.id,
        fornecedor_processo_id: e.fornecedor_processo_id,
        fornecedor_externo: e.fornecedor_externo,
        descricao: e.descricao,
        ordem: idx,
      })));
      if (errInsEntradas) return toast('Erro ao salvar entradas: ' + errInsEntradas.message, 'erro');
    }

    const { error: errDelSaidas } = await supabase.from('sipoc_saidas').delete().eq('processo_id', linha.processo.id);
    if (errDelSaidas) return toast('Erro ao salvar saídas: ' + errDelSaidas.message, 'erro');
    if (saidasManuais.length) {
      const { error: errInsSaidas } = await supabase.from('sipoc_saidas').insert(saidasManuais.map((s, idx) => ({
        empresa_id: empresaAtual.id,
        processo_id: linha.processo.id,
        destino_processo_id: s.destino_processo_id,
        destino_externo: s.destino_externo,
        descricao: s.descricao,
        ordem: idx,
      })));
      if (errInsSaidas) return toast('Erro ao salvar saídas: ' + errInsSaidas.message, 'erro');
    }

    toast('SIPOC salvo com sucesso.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}
