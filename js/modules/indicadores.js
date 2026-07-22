import { abrirModal, fecharModal, toast, escapeHtml, confirmar, dataValida, formatarValor, formatarMesAno, enviarPorEmail, imprimirSecao, podeEditarRegistro, resolverNivel } from '../ui.js';
import { listarObjetivos } from './objetivos.js';

const PERIODICIDADE = { mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual' };
const POLARIDADE = { maior_melhor: 'Maior é melhor', menor_melhor: 'Menor é melhor' };
const CLASSIFICACAO = { com_meta: 'Com meta', monitoramento: 'Monitoramento', complementar: 'Complementar' };
const TIPO_META = { fixa: 'Fixa', variavel: 'Variável por período' };
const UNIDADES = ['%', 'R$', 'un', 'dias', 'horas', 'pontos', 'kg', 'ton', 'm²'];

// Meta variável: as metas ficam em indicador_metas, uma por mês (periodo normalizado no dia 1º).
export function metaEhVariavel(indicador) {
  return indicador.classificacao === 'com_meta' && indicador.tipo_meta === 'variavel';
}

function mesDoPeriodo(periodo) {
  return (periodo || '').slice(0, 7); // 'YYYY-MM'
}

export async function carregarMetasPorMes(supabase, indicadorId) {
  const { data, error } = await supabase.from('indicador_metas').select('*').eq('indicador_id', indicadorId);
  if (error) throw error;
  return new Map((data || []).map((m) => [mesDoPeriodo(m.periodo), Number(m.meta)]));
}

// Meta vigente para um período: fixa usa indicadores.meta; variável usa a meta do mês.
export function metaDoPeriodo(indicador, metasPorMes, periodo) {
  if (indicador.classificacao !== 'com_meta') return null;
  if (indicador.tipo_meta === 'variavel') {
    const m = metasPorMes?.get(mesDoPeriodo(periodo));
    return m === undefined ? null : m;
  }
  return indicador.meta;
}

let chartInstance = null;
let objetivoFiltroId = null;
let indicadorAlvoId = null;

// Chamado ao navegar do Mapa Estratégico (clique num objetivo) para pré-filtrar os indicadores.
// Passar null limpa o filtro (ex: atalho "Indicadores" do Dashboard, ou clique manual na aba).
export function filtrarPorObjetivo(id) {
  objetivoFiltroId = id || null;
}

// Chamado a partir do semáforo de indicadores no Dashboard — abre direto os resultados do indicador clicado.
export function abrirIndicadorPorId(id) {
  indicadorAlvoId = id || null;
}

export async function render(container, state) {
  const { supabase, empresaAtual, papelAtual } = state;
  const podeEditar = resolverNivel(state, 'planejamento-estrategico', 'indicadores') === 'total';
  const podeCriar = podeEditar || resolverNivel(state, 'planejamento-estrategico', 'indicadores') === 'proprio';

  let itens, objetivos, membros;
  try {
    const [resIndicadores, resObjetivos, resMembros] = await Promise.all([
      supabase.from('indicadores').select('*').eq('empresa_id', empresaAtual.id).order('nome'),
      listarObjetivos(supabase, empresaAtual.id),
      supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }).then((r) => r.data || []),
    ]);
    if (resIndicadores.error) throw resIndicadores.error;
    itens = resIndicadores.data;
    objetivos = resObjetivos;
    membros = resMembros;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar indicadores: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const nomeObjetivoPorId = new Map(objetivos.map((o) => [o.id, o.nome]));
  const emailPorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));

  const baseFiltrada = objetivoFiltroId ? itens.filter((i) => i.objetivo_id === objetivoFiltroId) : itens;
  const filtroBanner = objetivoFiltroId ? `
    <div class="alert alert-info" style="display:flex;justify-content:space-between;align-items:center">
      <span>Filtrando indicadores do objetivo <strong>${escapeHtml(nomeObjetivoPorId.get(objetivoFiltroId) || '—')}</strong></span>
      <button class="btn btn-secondary btn-sm" id="btn-limpar-filtro-objetivo">Limpar filtro</button>
    </div>` : '';

  function itensExibidos() {
    const respFiltro = container.querySelector('#in-filtro-responsavel')?.value || '';
    if (!respFiltro) return baseFiltrada;
    return baseFiltrada.filter((i) => i.responsavel_id === respFiltro);
  }

  function renderTabela() {
    const filtrados = itensExibidos();
    const area = container.querySelector('#indicadores-tabela-area');
    area.innerHTML = filtrados.length ? `
        <table class="table">
          <thead><tr><th>Indicador</th><th>Objetivo</th><th>Meta</th><th>Periodicidade</th><th>Responsável</th><th></th></tr></thead>
          <tbody>
            ${filtrados.map((ind) => `
              <tr>
                <td>
                  <strong>${escapeHtml(ind.nome)}</strong>
                  <br><span class="badge badge-neutral">${CLASSIFICACAO[ind.classificacao] || CLASSIFICACAO.com_meta}</span>
                  ${ind.descricao ? `<br><span class="text-muted">${escapeHtml(ind.descricao)}</span>` : ''}
                </td>
                <td>${escapeHtml(nomeObjetivoPorId.get(ind.objetivo_id) || '—')}</td>
                <td>${metaEhVariavel(ind)
                  ? `<span class="badge badge-neutral">Variável por período</span><br><span class="text-muted">${POLARIDADE[ind.polaridade] || ''}</span>`
                  : (ind.classificacao === 'com_meta' && ind.meta !== null
                    ? `${formatarValor(ind.meta, ind.unidade)} ${escapeHtml(ind.unidade || '')}<br><span class="text-muted">${POLARIDADE[ind.polaridade] || ''}</span>`
                    : '<span class="text-muted">—</span>')}</td>
                <td>${PERIODICIDADE[ind.periodicidade]}</td>
                <td>${escapeHtml(emailPorId.get(ind.responsavel_id) || '—')}</td>
                <td class="table-actions">
                  <button class="icon-btn" data-resultados="${ind.id}" title="Resultados"><i class="ti ti-chart-dots"></i></button>
                  <button class="icon-btn" data-apresentar="${ind.id}" title="Apresentar (tela cheia)"><i class="ti ti-presentation"></i></button>
                  ${podeEditarRegistro(state, ind.responsavel_id, 'planejamento-estrategico', 'indicadores') ? `
                    <button class="icon-btn" data-editar="${ind.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                    <button class="icon-btn" data-excluir="${ind.id}" title="Excluir"><i class="ti ti-trash"></i></button>
                  ` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>` : `<div class="empty-state"><i class="ti ti-chart-line"></i>${objetivoFiltroId ? 'Nenhum indicador vinculado a este objetivo.' : 'Nenhum indicador encontrado.'}</div>`;

    area.querySelectorAll('[data-editar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = itens.find((i) => i.id === btn.dataset.editar);
        abrirFormulario(state, container, objetivos, membros, item);
      });
    });

    area.querySelectorAll('[data-excluir]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmar('Excluir este indicador? Todos os resultados apurados serão removidos.'))) return;
        const { error } = await supabase.from('indicadores').delete().eq('id', btn.dataset.excluir);
        if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
        toast('Indicador excluído.', 'sucesso');
        render(container, state);
      });
    });

    area.querySelectorAll('[data-resultados]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = itens.find((i) => i.id === btn.dataset.resultados);
        abrirResultados(state, item);
      });
    });

    area.querySelectorAll('[data-apresentar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = itens.find((i) => i.id === btn.dataset.apresentar);
        abrirApresentacao(state, item);
      });
    });
  }

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span><i class="ti ti-chart-line"></i> Indicadores (KPIs)</span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" id="btn-indicadores-email"><i class="ti ti-mail"></i> Enviar por e-mail</button>
          <button class="btn btn-secondary btn-sm" id="btn-indicadores-pdf"><i class="ti ti-printer"></i> Imprimir lista</button>
          ${podeCriar ? '<button class="btn btn-primary btn-sm" id="btn-add-indicador"><i class="ti ti-plus"></i> Novo indicador</button>' : ''}
        </div>
      </div>
      ${filtroBanner}
      <div class="filters filters-compact">
        <select id="in-filtro-responsavel" class="filter-select filter-select-sm">
          <option value="">Responsável</option>
          ${membros.map((m) => `<option value="${m.usuario_id}">${escapeHtml(m.nome || m.email)}</option>`).join('')}
        </select>
      </div>
      <div id="indicadores-tabela-area"></div>
    </div>
  `;

  renderTabela();

  container.querySelector('#in-filtro-responsavel').addEventListener('change', renderTabela);

  const btnLimparFiltro = container.querySelector('#btn-limpar-filtro-objetivo');
  if (btnLimparFiltro) btnLimparFiltro.addEventListener('click', () => { objetivoFiltroId = null; render(container, state); });

  container.querySelector('#btn-indicadores-pdf').addEventListener('click', () => {
    imprimirListaIndicadores(itensExibidos(), nomeObjetivoPorId, emailPorId);
  });
  container.querySelector('#btn-indicadores-email').addEventListener('click', () => {
    const corpo = itensExibidos().map((ind) => `${ind.nome}\nObjetivo: ${nomeObjetivoPorId.get(ind.objetivo_id) || '—'} | Meta: ${metaEhVariavel(ind) ? 'Variável por período' : (ind.classificacao === 'com_meta' && ind.meta !== null ? formatarValor(ind.meta, ind.unidade) + ' ' + (ind.unidade || '') : '—')} | Responsável: ${emailPorId.get(ind.responsavel_id) || '—'}\n`).join('\n');
    enviarPorEmail('Indicadores (KPIs)', corpo || 'Nenhum indicador encontrado.');
  });

  const btnAdd = container.querySelector('#btn-add-indicador');
  if (btnAdd) btnAdd.addEventListener('click', () => abrirFormulario(state, container, objetivos, membros));

  if (indicadorAlvoId) {
    const alvo = itens.find((i) => i.id === indicadorAlvoId);
    indicadorAlvoId = null;
    if (alvo) abrirResultados(state, alvo);
  }
}

// Documento de impressão da lista de indicadores (respeitando o filtro de objetivo ativo).
function imprimirListaIndicadores(itens, nomeObjetivoPorId, emailPorId) {
  imprimirSecao(`
    <h2 style="margin-bottom:4px">Indicadores (KPIs)</h2>
    <p class="text-muted">${itens.length} indicador(es)</p>
    <hr class="sep">
    ${itens.length ? `
      <table class="table">
        <thead><tr><th>Indicador</th><th>Objetivo</th><th>Meta</th><th>Periodicidade</th><th>Responsável</th></tr></thead>
        <tbody>
          ${itens.map((ind) => `
            <tr>
              <td>${escapeHtml(ind.nome)}${ind.descricao ? `<br><span class="text-muted">${escapeHtml(ind.descricao)}</span>` : ''}</td>
              <td>${escapeHtml(nomeObjetivoPorId.get(ind.objetivo_id) || '—')}</td>
              <td>${metaEhVariavel(ind) ? 'Variável por período' : (ind.classificacao === 'com_meta' && ind.meta !== null ? `${formatarValor(ind.meta, ind.unidade)} ${escapeHtml(ind.unidade || '')}` : '—')}</td>
              <td>${PERIODICIDADE[ind.periodicidade]}</td>
              <td>${escapeHtml(emailPorId.get(ind.responsavel_id) || '—')}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<p>Nenhum indicador encontrado.</p>'}
  `);
}

function abrirFormulario(state, container, objetivos, membros, item = null) {
  const { supabase, empresaAtual, user } = state;
  const travarResponsavelEmSiMesmo = resolverNivel(state, 'planejamento-estrategico', 'indicadores') === 'proprio';
  const classificacaoAtual = item?.classificacao || 'com_meta';
  const tipoMetaAtual = item?.tipo_meta || 'fixa';
  const unidadeAtual = item?.unidade || '';
  const unidadeEhCustom = unidadeAtual && !UNIDADES.includes(unidadeAtual);

  const modal = abrirModal(item ? 'Editar indicador' : 'Novo indicador', `
    <form id="form-indicador">
      <div class="form-group">
        <label>Nome</label>
        <input type="text" id="in-nome" required value="${item ? escapeHtml(item.nome) : ''}">
      </div>
      <div class="form-group">
        <label>Descrição</label>
        <textarea id="in-descricao" placeholder="O que este indicador mede...">${item ? escapeHtml(item.descricao || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label>Fórmula de cálculo</label>
        <input type="text" id="in-formula" placeholder="Ex: (realizado / previsto) x 100" value="${item ? escapeHtml(item.formula || '') : ''}">
      </div>
      <div class="form-group">
        <label>Classificação</label>
        <select id="in-classificacao">
          ${Object.entries(CLASSIFICACAO).map(([v, l]) => `<option value="${v}" ${classificacaoAtual === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Unidade</label>
          <select id="in-unidade">
            <option value="">—</option>
            ${UNIDADES.map((u) => `<option value="${u}" ${unidadeAtual === u ? 'selected' : ''}>${u}</option>`).join('')}
            <option value="outro" ${unidadeEhCustom ? 'selected' : ''}>Outra...</option>
          </select>
          <input type="text" id="in-unidade-custom" placeholder="Digite a unidade" style="margin-top:6px;display:${unidadeEhCustom ? '' : 'none'}" value="${unidadeEhCustom ? escapeHtml(unidadeAtual) : ''}">
        </div>
        <div class="form-group" id="grupo-tipo-meta" style="display:${classificacaoAtual === 'com_meta' ? '' : 'none'}">
          <label>Tipo de meta</label>
          <select id="in-tipo-meta">
            ${Object.entries(TIPO_META).map(([v, l]) => `<option value="${v}" ${tipoMetaAtual === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group" id="grupo-meta" style="display:${classificacaoAtual === 'com_meta' && tipoMetaAtual === 'fixa' ? '' : 'none'}">
        <label>Meta</label>
        <input type="number" step="any" id="in-meta" value="${item?.meta ?? ''}">
      </div>
      <p class="text-muted" id="dica-meta-variavel" style="font-size:12px;display:${classificacaoAtual === 'com_meta' && tipoMetaAtual === 'variavel' ? '' : 'none'}">
        Meta variável: defina a meta de cada período diretamente na tela de <strong>Resultados</strong> do indicador, junto com o lançamento do realizado.
      </p>
      <div class="form-row">
        <div class="form-group">
          <label>Periodicidade</label>
          <select id="in-periodicidade">
            ${Object.entries(PERIODICIDADE).map(([v, l]) => `<option value="${v}" ${item?.periodicidade === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="grupo-polaridade" style="display:${classificacaoAtual === 'com_meta' ? '' : 'none'}">
          <label>Polaridade</label>
          <select id="in-polaridade">
            ${Object.entries(POLARIDADE).map(([v, l]) => `<option value="${v}" ${item?.polaridade === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Objetivo vinculado</label>
          <select id="in-objetivo">
            <option value="">—</option>
            ${objetivos.map((o) => `<option value="${o.id}" ${item?.objetivo_id === o.id ? 'selected' : ''}>${escapeHtml(o.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Responsável pela apuração</label>
          <select id="in-responsavel" ${travarResponsavelEmSiMesmo ? 'disabled' : ''}>
            <option value="">—</option>
            ${membros.map((m) => `<option value="${m.usuario_id}" ${(item ? item.responsavel_id === m.usuario_id : (travarResponsavelEmSiMesmo && m.usuario_id === user.id)) ? 'selected' : ''}>${escapeHtml(m.nome || m.email)}</option>`).join('')}
          </select>
          ${travarResponsavelEmSiMesmo ? '<p class="text-muted" style="font-size:12px;margin-top:4px">Seu nível de acesso só permite criar indicadores com você mesmo como responsável.</p>' : ''}
        </div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  function atualizarCamposMeta() {
    const ehComMeta = modal.querySelector('#in-classificacao').value === 'com_meta';
    const ehVariavel = modal.querySelector('#in-tipo-meta').value === 'variavel';
    modal.querySelector('#grupo-tipo-meta').style.display = ehComMeta ? '' : 'none';
    modal.querySelector('#grupo-meta').style.display = ehComMeta && !ehVariavel ? '' : 'none';
    modal.querySelector('#dica-meta-variavel').style.display = ehComMeta && ehVariavel ? '' : 'none';
    modal.querySelector('#grupo-polaridade').style.display = ehComMeta ? '' : 'none';
  }
  modal.querySelector('#in-classificacao').addEventListener('change', atualizarCamposMeta);
  modal.querySelector('#in-tipo-meta').addEventListener('change', atualizarCamposMeta);

  modal.querySelector('#in-unidade').addEventListener('change', (e) => {
    modal.querySelector('#in-unidade-custom').style.display = e.target.value === 'outro' ? '' : 'none';
  });

  modal.querySelector('#form-indicador').addEventListener('submit', async (e) => {
    e.preventDefault();
    const classificacao = modal.querySelector('#in-classificacao').value;
    const ehComMeta = classificacao === 'com_meta';
    const tipoMeta = modal.querySelector('#in-tipo-meta').value;
    const ehMetaFixa = ehComMeta && tipoMeta === 'fixa';
    if (ehMetaFixa && !modal.querySelector('#in-meta').value) return toast('Informe a meta para um indicador "Com meta" de meta fixa.', 'erro');

    const unidadeSelecionada = modal.querySelector('#in-unidade').value;
    const unidade = unidadeSelecionada === 'outro' ? modal.querySelector('#in-unidade-custom').value.trim() : unidadeSelecionada;

    const payload = {
      empresa_id: empresaAtual.id,
      nome: modal.querySelector('#in-nome').value.trim(),
      descricao: modal.querySelector('#in-descricao').value.trim() || null,
      formula: modal.querySelector('#in-formula').value.trim(),
      classificacao,
      unidade,
      tipo_meta: ehComMeta ? tipoMeta : 'fixa',
      meta: ehMetaFixa ? Number(modal.querySelector('#in-meta').value) : null,
      periodicidade: modal.querySelector('#in-periodicidade').value,
      polaridade: ehComMeta ? modal.querySelector('#in-polaridade').value : null,
      objetivo_id: modal.querySelector('#in-objetivo').value || null,
      responsavel_id: modal.querySelector('#in-responsavel').value || null,
    };
    const query = item
      ? supabase.from('indicadores').update(payload).eq('id', item.id)
      : supabase.from('indicadores').insert(payload);
    const { error } = await query;
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    toast('Indicador salvo com sucesso.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}

async function abrirResultados(state, indicador) {
  const { supabase } = state;
  const podeEditar = podeEditarRegistro(state, indicador.responsavel_id, 'planejamento-estrategico', 'indicadores');
  const ehVariavel = metaEhVariavel(indicador);

  const { data: resultadosData, error } = await supabase
    .from('resultados_indicadores')
    .select('*')
    .eq('indicador_id', indicador.id)
    .order('periodo');

  if (error) return toast('Erro ao carregar resultados: ' + error.message, 'erro');

  let metasPorMes = new Map();
  if (ehVariavel) {
    try {
      metasPorMes = await carregarMetasPorMes(supabase, indicador.id);
    } catch (errMetas) {
      return toast('Erro ao carregar metas por período: ' + errMetas.message, 'erro');
    }
  }

  // Ordenação explícita por período (defensiva: garante ordem cronológica mesmo que
  // algum registro antigo tenha sido salvo antes da validação de ano em dataValida()).
  const resultados = [...resultadosData].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const anos = [...new Set(resultados.map((r) => r.periodo.slice(0, 4)))].sort();
  let anoFiltroAtivo = null; // null = todos os anos

  const modal = abrirModal(`Resultados — ${escapeHtml(indicador.nome)}`, `
    ${podeEditar ? `
      <form id="form-resultado">
        <input type="hidden" id="res-id">
        <div class="form-row" style="align-items:end">
          <div class="form-group">
            <label>Período</label>
            <input type="date" id="res-periodo" required>
          </div>
          <div class="form-group">
            <label>Valor realizado</label>
            <input type="number" step="any" id="res-valor" required>
          </div>
          ${ehVariavel ? `
          <div class="form-group">
            <label>Meta do período</label>
            <input type="number" step="any" id="res-meta" placeholder="Meta deste mês">
          </div>` : ''}
        </div>
        <div class="form-group">
          <label>Observação</label>
          <input type="text" id="res-observacao">
        </div>
        <div class="form-row">
          <div class="form-group"><button class="btn btn-primary btn-block" type="submit" id="btn-salvar-resultado">Adicionar</button></div>
          <div class="form-group" id="grupo-cancelar-edicao" style="display:none">
            <button class="btn btn-secondary btn-block" type="button" id="btn-cancelar-edicao-resultado">Cancelar edição</button>
          </div>
        </div>
      </form>
      <hr class="sep">
    ` : ''}
    ${anos.length > 1 ? `
      <div class="filters" id="resultados-filtro-anos">
        <button type="button" class="filter-btn ano-filtro-btn active" data-ano="">Todos</button>
        ${anos.map((a) => `<button type="button" class="filter-btn ano-filtro-btn" data-ano="${a}">${a}</button>`).join('')}
      </div>
    ` : ''}
    <canvas id="grafico-resultado" height="140"></canvas>
    <hr class="sep">
    <div id="resultados-tabela-area"></div>
  `);

  function renderResultadosFiltrados() {
    const filtrados = anoFiltroAtivo ? resultados.filter((r) => r.periodo.startsWith(anoFiltroAtivo)) : resultados;

    const area = modal.querySelector('#resultados-tabela-area');
    area.innerHTML = filtrados.length ? `
      <table class="table">
        <thead><tr><th>Período</th><th>Realizado</th>${ehVariavel ? '<th>Meta do período</th>' : ''}<th>Observação</th>${podeEditar ? '<th></th>' : ''}</tr></thead>
        <tbody>
          ${filtrados.map((r) => `
            <tr>
              <td>${r.periodo}</td>
              <td>${formatarValor(r.valor_realizado, indicador.unidade)} ${escapeHtml(indicador.unidade || '')}</td>
              ${ehVariavel ? `<td>${(() => { const m = metaDoPeriodo(indicador, metasPorMes, r.periodo); return m === null ? '<span class="text-muted">—</span>' : `${formatarValor(m, indicador.unidade)} ${escapeHtml(indicador.unidade || '')}`; })()}</td>` : ''}
              <td>${escapeHtml(r.observacao || '')}</td>
              ${podeEditar ? `<td class="table-actions">
                <button class="icon-btn" data-editar-resultado="${r.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                <button class="icon-btn" data-excluir-resultado="${r.id}" title="Excluir"><i class="ti ti-trash"></i></button>
              </td>` : ''}
            </tr>`).join('')}
        </tbody>
      </table>` : `<p class="text-muted">Nenhum resultado apurado${anoFiltroAtivo ? ' em ' + anoFiltroAtivo : ' ainda'}.</p>`;

    desenharGrafico(filtrados, indicador, metasPorMes);

    area.querySelectorAll('[data-editar-resultado]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = resultados.find((x) => x.id === btn.dataset.editarResultado);
        modal.querySelector('#res-id').value = r.id;
        modal.querySelector('#res-periodo').value = r.periodo;
        modal.querySelector('#res-valor').value = r.valor_realizado;
        modal.querySelector('#res-observacao').value = r.observacao || '';
        if (ehVariavel) {
          const metaMes = metaDoPeriodo(indicador, metasPorMes, r.periodo);
          modal.querySelector('#res-meta').value = metaMes === null ? '' : metaMes;
        }
        modal.querySelector('#btn-salvar-resultado').textContent = 'Salvar edição';
        modal.querySelector('#grupo-cancelar-edicao').style.display = '';
        modal.querySelector('#res-periodo').focus();
      });
    });

    area.querySelectorAll('[data-excluir-resultado]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmar('Excluir este resultado?'))) return;
        const { error: errDel } = await supabase.from('resultados_indicadores').delete().eq('id', btn.dataset.excluirResultado);
        if (errDel) return toast('Erro ao excluir: ' + errDel.message, 'erro');
        fecharModal();
        abrirResultados(state, indicador);
      });
    });
  }

  modal.querySelectorAll('.ano-filtro-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      anoFiltroAtivo = btn.dataset.ano || null;
      modal.querySelectorAll('.ano-filtro-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderResultadosFiltrados();
    });
  });

  renderResultadosFiltrados();

  const form = modal.querySelector('#form-resultado');
  if (form) {
    const btnCancelar = modal.querySelector('#btn-cancelar-edicao-resultado');
    const grupoCancelar = modal.querySelector('#grupo-cancelar-edicao');
    const btnSalvar = modal.querySelector('#btn-salvar-resultado');

    btnCancelar.addEventListener('click', () => {
      form.reset();
      modal.querySelector('#res-id').value = '';
      btnSalvar.textContent = 'Adicionar';
      grupoCancelar.style.display = 'none';
    });

    // Meta variável: ao escolher o período, sugere a meta já cadastrada para aquele mês.
    if (ehVariavel) {
      modal.querySelector('#res-periodo').addEventListener('change', (e) => {
        const campoMeta = modal.querySelector('#res-meta');
        if (campoMeta.value !== '') return; // não sobrescreve o que a pessoa já digitou
        const metaMes = metaDoPeriodo(indicador, metasPorMes, e.target.value);
        if (metaMes !== null) campoMeta.value = metaMes;
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const periodo = modal.querySelector('#res-periodo').value;
      if (!dataValida(periodo)) return toast('Período inválido: informe uma data real.', 'erro');
      const payload = {
        indicador_id: indicador.id,
        periodo,
        valor_realizado: Number(modal.querySelector('#res-valor').value),
        observacao: modal.querySelector('#res-observacao').value.trim() || null,
      };
      const { error: errIns } = await supabase.from('resultados_indicadores').upsert(payload, { onConflict: 'indicador_id,periodo' });
      if (errIns) return toast('Erro ao salvar resultado: ' + errIns.message, 'erro');

      if (ehVariavel) {
        const metaInformada = modal.querySelector('#res-meta').value;
        if (metaInformada !== '') {
          // Meta guardada por mês (dia 1º), valendo para qualquer lançamento daquele mês.
          const { error: errMeta } = await supabase.from('indicador_metas')
            .upsert({ indicador_id: indicador.id, periodo: periodo.slice(0, 7) + '-01', meta: Number(metaInformada) }, { onConflict: 'indicador_id,periodo' });
          if (errMeta) return toast('Resultado salvo, mas houve erro ao salvar a meta do período: ' + errMeta.message, 'erro');
        }
      }

      toast('Resultado salvo com sucesso.', 'sucesso');
      fecharModal();
      abrirResultados(state, indicador);
    });
  }
}

// Visualização em tela cheia, pensada para projetar numa reunião: nome do indicador em destaque,
// meta/último resultado grandes, gráfico ampliado e um campo de análise (salvo em indicadores.analise)
// para registrar a discussão/interpretação do resultado direto durante a reunião.
// Histórico de análises da apresentação — mais recente primeiro, com data e autor.
function renderHistoricoAnalises(analises, nomeMembroPorId) {
  if (!analises.length) return '<p class="text-muted" style="font-size:13px">Nenhuma análise registrada ainda.</p>';
  return analises.map((a) => `
    <div style="background:var(--bg-white);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
      <div class="text-muted" style="font-size:11px;margin-bottom:4px">
        ${new Date(a.created_at).toLocaleString('pt-BR')} · ${escapeHtml(nomeMembroPorId.get(a.usuario_id) || '—')}
      </div>
      <div style="font-size:14px">${escapeHtml(a.texto)}</div>
    </div>
  `).join('');
}

async function abrirApresentacao(state, indicador) {
  const { supabase, empresaAtual, user } = state;
  const podeEditar = podeEditarRegistro(state, indicador.responsavel_id, 'planejamento-estrategico', 'indicadores');
  const ehVariavel = metaEhVariavel(indicador);

  const [{ data: resultadosData, error }, { data: analisesData, error: errAnalises }, membros] = await Promise.all([
    supabase.from('resultados_indicadores').select('*').eq('indicador_id', indicador.id).order('periodo'),
    supabase.from('indicador_analises').select('*').eq('indicador_id', indicador.id).order('created_at', { ascending: false }),
    supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }).then((r) => r.data || []),
  ]);
  if (error) return toast('Erro ao carregar resultados: ' + error.message, 'erro');
  if (errAnalises) return toast('Erro ao carregar análises: ' + errAnalises.message, 'erro');

  let metasPorMes = new Map();
  if (ehVariavel) {
    try {
      metasPorMes = await carregarMetasPorMes(supabase, indicador.id);
    } catch (errMetas) {
      return toast('Erro ao carregar metas por período: ' + errMetas.message, 'erro');
    }
  }

  const resultados = [...resultadosData].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const ultimo = resultados[resultados.length - 1] || null;
  const metaUltimoPeriodo = ultimo ? metaDoPeriodo(indicador, metasPorMes, ultimo.periodo) : null;
  let analises = analisesData || [];
  const nomeMembroPorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));

  // Observações registradas junto com cada resultado lançado (do mais recente pro mais antigo)
  const observacoes = [...resultados].reverse().filter((r) => (r.observacao || '').trim());

  const overlay = document.createElement('div');
  overlay.className = 'apresentacao-overlay';
  overlay.innerHTML = `
    <button class="apresentacao-fechar" id="apr-fechar" title="Fechar"><i class="ti ti-x"></i></button>
    <div class="apresentacao-conteudo">
      <h1>${escapeHtml(indicador.nome)}</h1>
      <p class="apresentacao-subtitulo">${escapeHtml(indicador.descricao || '')}</p>
      <div class="apresentacao-meta-row">
        <div class="apresentacao-meta-item">
          <span>Meta${ehVariavel ? ' do período' : ''}</span>
          <strong>${ehVariavel
            ? (metaUltimoPeriodo !== null ? `${formatarValor(metaUltimoPeriodo, indicador.unidade)} ${escapeHtml(indicador.unidade || '')}` : 'Variável')
            : (indicador.classificacao === 'com_meta' && indicador.meta !== null ? `${formatarValor(indicador.meta, indicador.unidade)} ${escapeHtml(indicador.unidade || '')}` : '—')}</strong>
        </div>
        <div class="apresentacao-meta-item">
          <span>Último resultado</span>
          <strong>${ultimo ? `${formatarValor(ultimo.valor_realizado, indicador.unidade)} ${escapeHtml(indicador.unidade || '')}` : 'Sem dados'}</strong>
        </div>
        <div class="apresentacao-meta-item">
          <span>Período</span>
          <strong>${ultimo ? formatarMesAno(ultimo.periodo) : '—'}</strong>
        </div>
      </div>
      <div class="apresentacao-grafico-box">
        <canvas id="apresentacao-grafico" height="90"></canvas>
      </div>

      ${observacoes.length ? `
        <div class="apresentacao-analise" style="margin-bottom:1.5rem">
          <label><i class="ti ti-notes"></i> Observações lançadas junto com os resultados</label>
          <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-top:10px">
            ${observacoes.map((r) => `
              <div style="background:var(--bg-white);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
                <div class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">${formatarMesAno(r.periodo)}</div>
                <div style="font-size:14px">${escapeHtml(r.observacao)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="apresentacao-analise">
        <label>Nova análise para discussão</label>
        <textarea id="apr-analise" placeholder="Descreva aqui a análise/interpretação deste indicador..." ${podeEditar ? '' : 'readonly'}></textarea>
        ${podeEditar ? `
          <button class="btn btn-primary" id="apr-salvar-analise"><i class="ti ti-device-floppy"></i> Salvar análise</button>
          <p class="text-muted" style="font-size:12px;margin-top:8px">Ao salvar, esta análise fica registrada abaixo com a data, e também na Ata de Reunião aberta de hoje.</p>
        ` : ''}
        <div id="apr-historico-analises" style="margin-top:1.25rem;display:flex;flex-direction:column;gap:10px">
          ${renderHistoricoAnalises(analises, nomeMembroPorId)}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const fechar = () => overlay.remove();
  overlay.querySelector('#apr-fechar').addEventListener('click', fechar);
  const onEsc = (e) => { if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', onEsc); } };
  document.addEventListener('keydown', onEsc);

  if (window.Chart) {
    new Chart(overlay.querySelector('#apresentacao-grafico'), {
      type: 'line',
      data: {
        labels: resultados.map((r) => formatarMesAno(r.periodo)),
        datasets: [
          { label: 'Realizado', data: resultados.map((r) => r.valor_realizado), borderColor: '#E8B84B', backgroundColor: 'rgba(232,184,75,0.15)', tension: 0.25, borderWidth: 3 },
          { label: 'Meta', data: resultados.map((r) => metaDoPeriodo(indicador, metasPorMes, r.periodo)), borderColor: '#252538', borderDash: [6, 4], pointRadius: 0 },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 14 } } } } },
    });
  }

  const btnSalvarAnalise = overlay.querySelector('#apr-salvar-analise');
  if (btnSalvarAnalise) {
    btnSalvarAnalise.addEventListener('click', async () => {
      const textoArea = overlay.querySelector('#apr-analise');
      const analise = textoArea.value.trim();
      if (!analise) return toast('Escreva a análise antes de salvar.', 'erro');

      const { data: novaAnalise, error: errAnalise } = await supabase
        .from('indicador_analises')
        .insert({ empresa_id: empresaAtual.id, indicador_id: indicador.id, texto: analise, usuario_id: user.id })
        .select()
        .single();
      if (errAnalise) return toast('Erro ao salvar análise: ' + errAnalise.message, 'erro');

      // Mantém indicadores.analise como "última análise" pra quem lê fora da apresentação.
      await supabase.from('indicadores').update({ analise }).eq('id', indicador.id);
      indicador.analise = analise;

      analises = [novaAnalise, ...analises];
      overlay.querySelector('#apr-historico-analises').innerHTML = renderHistoricoAnalises(analises, nomeMembroPorId);
      textoArea.value = '';

      const { error: errAta } = await registrarAnaliseNaAtaDoDia(supabase, empresaAtual.id, indicador.id, analise);
      if (errAta) {
        toast('Análise salva, mas houve erro ao registrar na ata: ' + errAta.message, 'erro');
        return;
      }
      toast('Análise salva — registrada abaixo e na Ata de Reunião aberta de hoje.', 'sucesso');
    });
  }
}

// Encontra a ata aberta de hoje (cria uma nova se não existir) e registra/atualiza a análise
// deste indicador nela (rac_indicadores). Assim, todas as análises escritas no mesmo dia —
// de indicadores diferentes — ficam acumuladas na mesma ata, com status "aberta".
async function registrarAnaliseNaAtaDoDia(supabase, empresaId, indicadorId, texto) {
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: ataExistente, error: errBusca } = await supabase
    .from('reunioes_analise_critica')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('data', hoje)
    .eq('status', 'aberta')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (errBusca) return { error: errBusca };

  let ataId = ataExistente?.id;
  if (!ataId) {
    const { data: novaAta, error: errCriar } = await supabase
      .from('reunioes_analise_critica')
      .insert({ empresa_id: empresaId, data: hoje, status: 'aberta' })
      .select('id')
      .single();
    if (errCriar) return { error: errCriar };
    ataId = novaAta.id;
  }

  const { error: errUpsert } = await supabase
    .from('rac_indicadores')
    .upsert({ reuniao_id: ataId, indicador_id: indicadorId, consideracoes: texto }, { onConflict: 'reuniao_id,indicador_id' });
  return { error: errUpsert };
}

function desenharGrafico(resultados, indicador, metasPorMes = null) {
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  const canvas = document.getElementById('grafico-resultado');
  if (!canvas || !window.Chart) return;
  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: resultados.map((r) => formatarMesAno(r.periodo)),
      datasets: [
        {
          label: 'Realizado',
          data: resultados.map((r) => r.valor_realizado),
          borderColor: '#E8B84B',
          backgroundColor: 'rgba(232,184,75,0.15)',
          tension: 0.25,
        },
        {
          label: 'Meta',
          data: resultados.map((r) => metaDoPeriodo(indicador, metasPorMes, r.periodo)),
          borderColor: '#252538',
          borderDash: [6, 4],
          pointRadius: 0,
        },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });
}
