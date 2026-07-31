import { abrirModal, fecharModal, toast, escapeHtml, confirmar, imprimirSecao, podeEditarRegistro, resolverNivel, formatarDataHora } from '../ui.js';

const CATEGORIA_LABEL = { receita: 'Receita', custo: 'Custo', despesa: 'Despesa', investimento: 'Investimento' };
const CATEGORIA_BADGE = { receita: 'badge-success', custo: 'badge-warning', despesa: 'badge-danger', investimento: 'badge-neutral' };

const TIPO_ARQUIVO_LABEL = { pdf: 'PDF', excel: 'Excel', png: 'PNG', jpg: 'JPG', powerpoint: 'PowerPoint' };
const TIPO_ARQUIVO_ICONE = { pdf: 'ti-file-type-pdf', excel: 'ti-file-type-xls', png: 'ti-photo', jpg: 'ti-photo', powerpoint: 'ti-file-type-ppt' };
const EXT_PARA_TIPO = { pdf: 'pdf', xls: 'excel', xlsx: 'excel', png: 'png', jpg: 'jpg', jpeg: 'jpg', ppt: 'powerpoint', pptx: 'powerpoint' };
const PRIORIDADE_LABEL = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
const STATUS_PLANO_LABEL = { nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento', concluido: 'Concluído', atrasado: 'Atrasado' };

const fmtCompetencia = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' }) : '—';
// Reaproveita formatarDataHora() de ui.js (mesmo formato "dd/mm/aaaa hh:mm" usado no resto do
// app) em vez de toLocaleString('pt-BR') sem opções, que também mostra segundos e vírgula.
const fmtData = (iso) => iso ? formatarDataHora(iso) : '—';

const fmtMoeda = (v) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPercent = (v) => v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;

// Variação = quanto o Realizado desviou do Orçado. Positivo = gastou mais que o planejado.
function calcVariacao(orcado, realizado) {
  if (orcado == null || realizado == null) return { valor: null, pct: null };
  const valor = realizado - orcado;
  const pct = orcado ? valor / orcado : null;
  return { valor, pct };
}

function badgeVariacao(pct) {
  if (pct == null) return '<span class="text-muted">—</span>';
  const cls = pct > 0 ? 'badge-danger' : pct < 0 ? 'badge-success' : 'badge-neutral';
  const sinal = pct > 0 ? '+' : '';
  return `<span class="badge ${cls}">${sinal}${fmtPercent(pct)}</span>`;
}

// Mini gráfico (SVG puro, sem Chart.js) do andamento orçado x realizado dos últimos meses lançados,
// pra dar visibilidade da evolução da conta direto na lista, sem precisar abrir o detalhe.
function sparklineAndamento(lancamentosConta) {
  const pontos = [...(lancamentosConta || [])].sort((a, b) => a.competencia.localeCompare(b.competencia)).slice(-6);
  if (pontos.length < 2) return '<span class="text-muted" style="font-size:11px">sem histórico</span>';

  const w = 92, h = 30, pad = 3;
  const valores = pontos.flatMap((p) => [Number(p.valor_orcado) || 0, Number(p.valor_realizado) || 0]);
  const max = Math.max(1, ...valores);
  const stepX = (w - pad * 2) / (pontos.length - 1);
  const coord = (v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((Number(v) || 0) / max) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const orcadoPts = pontos.map((p, i) => coord(p.valor_orcado, i)).join(' ');
  const realizadoPts = pontos.map((p, i) => coord(p.valor_realizado, i)).join(' ');
  const titulo = `Últimos ${pontos.length} meses: orçado (tracejado) x realizado (sólido)`;

  return `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block" role="img" aria-label="${titulo}">
      <title>${titulo}</title>
      <polyline points="${orcadoPts}" fill="none" stroke="#9a9ab0" stroke-width="1.5" stroke-dasharray="3,2"/>
      <polyline points="${realizadoPts}" fill="none" stroke="#E8B84B" stroke-width="2"/>
    </svg>
  `;
}

let filtroCategoria = 'todas';
let filtroStatus = 'ativo';
let competenciaAtiva = null; // 'YYYY-MM', escolhida pelo usuário no painel de Resumo Consolidado

export async function render(container, state) {
  const { supabase, empresaAtual, user } = state;
  const podeEditar = resolverNivel(state, 'controladoria') === 'total';

  let contas, departamentos, membros, lancamentos;
  try {
    [contas, departamentos, membros, lancamentos] = await Promise.all([
      supabase.from('contas_gerenciais').select('*').eq('empresa_id', empresaAtual.id),
      supabase.from('departamentos').select('*').eq('empresa_id', empresaAtual.id).order('nome').then((r) => { if (r.error) throw r.error; return r.data || []; }),
      supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }).then((r) => { if (r.error) throw r.error; return r.data || []; }),
      supabase.from('contas_lancamentos_mensais').select('*').eq('empresa_id', empresaAtual.id).then((r) => { if (r.error) throw r.error; return r.data || []; }),
    ]);
    if (contas.error) throw contas.error;
    contas = [...contas.data].sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar contas gerenciais: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const nomeDeptoPorId = new Map(departamentos.map((d) => [d.id, d.nome]));
  const nomeMembroPorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));
  const categoriaPorContaId = new Map(contas.map((c) => [c.id, c.categoria]));

  const lancamentosPorConta = new Map();
  lancamentos.forEach((l) => {
    if (!lancamentosPorConta.has(l.conta_id)) lancamentosPorConta.set(l.conta_id, []);
    lancamentosPorConta.get(l.conta_id).push(l);
  });

  const contasFiltradas = contas.filter((c) => {
    if (filtroCategoria !== 'todas' && c.categoria !== filtroCategoria) return false;
    if (filtroStatus === 'ativo' && !c.ativo) return false;
    if (filtroStatus === 'inativo' && c.ativo) return false;
    return true;
  });

  const totais = ['receita', 'custo', 'despesa', 'investimento'].map((cat) => {
    const doCat = contas.filter((c) => c.categoria === cat && c.ativo);
    const metaMensal = doCat.reduce((s, c) => s + (Number(c.meta_mensal) || 0), 0);
    return { cat, qtd: doCat.length, metaMensal };
  });

  // ---------- Resumo Consolidado (equivalente à aba "Resumo" da planilha de controladoria) ----------
  const competenciasComDado = [...new Set(lancamentos.map((l) => l.competencia.slice(0, 7)))].sort();
  if (!competenciaAtiva) competenciaAtiva = competenciasComDado[competenciasComDado.length - 1] || new Date().toISOString().slice(0, 7);
  const anoResumo = competenciaAtiva.slice(0, 4);

  const doMes = lancamentos.filter((l) => l.competencia.slice(0, 7) === competenciaAtiva);
  const totalOrcadoMes = doMes.reduce((s, l) => s + (Number(l.valor_orcado) || 0), 0);
  const totalRealizadoMes = doMes.reduce((s, l) => s + (Number(l.valor_realizado) || 0), 0);
  const variacaoMes = calcVariacao(totalOrcadoMes, totalRealizadoMes);

  const doAnoAteMes = lancamentos.filter((l) => l.competencia.slice(0, 4) === anoResumo && l.competencia.slice(0, 7) <= competenciaAtiva);
  const totalOrcadoAno = doAnoAteMes.reduce((s, l) => s + (Number(l.valor_orcado) || 0), 0);
  const totalRealizadoAno = doAnoAteMes.reduce((s, l) => s + (Number(l.valor_realizado) || 0), 0);
  const variacaoAno = calcVariacao(totalOrcadoAno, totalRealizadoAno);

  const resumoPorCategoria = ['receita', 'custo', 'despesa', 'investimento'].map((cat) => {
    const doCat = doMes.filter((l) => categoriaPorContaId.get(l.conta_id) === cat);
    const orcado = doCat.reduce((s, l) => s + (Number(l.valor_orcado) || 0), 0);
    const realizado = doCat.reduce((s, l) => s + (Number(l.valor_realizado) || 0), 0);
    return { cat, orcado, realizado, variacao: calcVariacao(orcado, realizado) };
  }).filter((r) => r.orcado || r.realizado);

  container.innerHTML = `
    <div class="card">
      <div class="card-header"><span><i class="ti ti-report-money"></i> Resumo por categoria</span></div>
      <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
        ${totais.map((t) => `
          <div class="stat-box" style="padding:14px;border-radius:8px;background:var(--surface-1)">
            <div class="badge ${CATEGORIA_BADGE[t.cat]}" style="margin-bottom:8px">${CATEGORIA_LABEL[t.cat]}</div>
            <div style="font-size:20px;font-weight:700">${t.qtd}</div>
            <div class="text-muted" style="font-size:12px">conta${t.qtd === 1 ? '' : 's'} ativa${t.qtd === 1 ? '' : 's'} · meta mensal ${fmtMoeda(t.metaMensal)}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span><i class="ti ti-chart-bar"></i> Resumo Consolidado</span>
        <input type="month" id="competencia-ativa" value="${competenciaAtiva}">
      </div>
      ${doMes.length ? `
        <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:1rem">
          <div class="stat-box" style="padding:14px;border-radius:8px;background:var(--surface-1)">
            <div class="text-muted" style="font-size:12px">Orçado no mês</div>
            <div style="font-size:18px;font-weight:700">${fmtMoeda(totalOrcadoMes)}</div>
          </div>
          <div class="stat-box" style="padding:14px;border-radius:8px;background:var(--surface-1)">
            <div class="text-muted" style="font-size:12px">Realizado no mês</div>
            <div style="font-size:18px;font-weight:700">${fmtMoeda(totalRealizadoMes)}</div>
          </div>
          <div class="stat-box" style="padding:14px;border-radius:8px;background:var(--surface-1)">
            <div class="text-muted" style="font-size:12px">Variação no mês</div>
            <div style="font-size:18px;font-weight:700">${fmtMoeda(variacaoMes.valor)} ${badgeVariacao(variacaoMes.pct)}</div>
          </div>
          <div class="stat-box" style="padding:14px;border-radius:8px;background:var(--surface-1)">
            <div class="text-muted" style="font-size:12px">Acumulado em ${anoResumo} (até o mês)</div>
            <div style="font-size:18px;font-weight:700">${fmtMoeda(totalRealizadoAno)} <span class="text-muted" style="font-size:12px;font-weight:400">de ${fmtMoeda(totalOrcadoAno)}</span> ${badgeVariacao(variacaoAno.pct)}</div>
          </div>
        </div>
        ${resumoPorCategoria.length ? `
        <table class="table">
          <thead><tr><th>Categoria</th><th>Orçado</th><th>Realizado</th><th>Variação</th></tr></thead>
          <tbody>
            ${resumoPorCategoria.map((r) => `
              <tr>
                <td><span class="badge ${CATEGORIA_BADGE[r.cat]}">${CATEGORIA_LABEL[r.cat]}</span></td>
                <td>${fmtMoeda(r.orcado)}</td>
                <td>${fmtMoeda(r.realizado)}</td>
                <td>${fmtMoeda(r.variacao.valor)} ${badgeVariacao(r.variacao.pct)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>` : ''}
      ` : '<div class="empty-state"><i class="ti ti-chart-bar"></i>Nenhum lançamento de orçado/realizado nesta competência ainda. Lance os valores no detalhe de cada conta.</div>'}
    </div>

    <div class="card">
      <div class="card-header">
        <span><i class="ti ti-list-details"></i> Contas Gerenciais</span>
        ${podeEditar ? '<button class="btn btn-primary btn-sm" id="btn-add-conta"><i class="ti ti-plus"></i> Nova conta</button>' : ''}
      </div>
      <p class="text-muted" style="font-size:12px;margin:-0.75rem 0 1rem">
        As colunas Orçado/Realizado abaixo são de <strong>${fmtCompetencia(competenciaAtiva + '-01')}</strong> — lance direto aqui e clique em <i class="ti ti-device-floppy"></i>, ou mude o mês no seletor do Resumo Consolidado acima.
      </p>
      <div class="filters">
        <button class="filter-btn ${filtroCategoria === 'todas' ? 'active' : ''}" data-filtro-cat="todas">Todas</button>
        <button class="filter-btn ${filtroCategoria === 'receita' ? 'active' : ''}" data-filtro-cat="receita">Receita</button>
        <button class="filter-btn ${filtroCategoria === 'custo' ? 'active' : ''}" data-filtro-cat="custo">Custo</button>
        <button class="filter-btn ${filtroCategoria === 'despesa' ? 'active' : ''}" data-filtro-cat="despesa">Despesa</button>
        <button class="filter-btn ${filtroCategoria === 'investimento' ? 'active' : ''}" data-filtro-cat="investimento">Investimento</button>
      </div>
      <div class="filters">
        <button class="filter-btn ${filtroStatus === 'ativo' ? 'active' : ''}" data-filtro-status="ativo">Ativas</button>
        <button class="filter-btn ${filtroStatus === 'inativo' ? 'active' : ''}" data-filtro-status="inativo">Inativas</button>
        <button class="filter-btn ${filtroStatus === 'todos' ? 'active' : ''}" data-filtro-status="todos">Todas</button>
      </div>
      ${contasFiltradas.length ? `
        <table class="table">
          <thead>
            <tr>
              <th>Código</th><th>Nome da conta</th><th>Categoria</th><th>Responsável</th>
              <th>Andamento</th><th>Orçado (mês)</th><th>Realizado (mês)</th><th>Variação</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${contasFiltradas.map((c) => {
              const lancsConta = lancamentosPorConta.get(c.id) || [];
              const lancMes = lancsConta.find((l) => l.competencia.slice(0, 7) === competenciaAtiva);
              const podeGerenciarConta = podeEditarRegistro(state, c.responsavel_analise_id, 'controladoria');
              const variacaoMesConta = lancMes ? calcVariacao(lancMes.valor_orcado == null ? null : Number(lancMes.valor_orcado), lancMes.valor_realizado == null ? null : Number(lancMes.valor_realizado)) : { valor: null, pct: null };
              return `
              <tr>
                <td><strong>${escapeHtml(c.codigo)}</strong></td>
                <td>${escapeHtml(c.nome)}</td>
                <td><span class="badge ${CATEGORIA_BADGE[c.categoria]}">${CATEGORIA_LABEL[c.categoria]}</span></td>
                <td>${escapeHtml(nomeMembroPorId.get(c.responsavel_analise_id) || '—')}</td>
                <td>${sparklineAndamento(lancsConta)}</td>
                <td><input type="number" step="0.01" class="lm-rapido-input" data-conta-id="${c.id}" data-campo="orcado" value="${lancMes?.valor_orcado ?? ''}" ${podeGerenciarConta ? '' : 'disabled'} style="width:110px" placeholder="—"></td>
                <td><input type="number" step="0.01" class="lm-rapido-input" data-conta-id="${c.id}" data-campo="realizado" value="${lancMes?.valor_realizado ?? ''}" ${podeGerenciarConta ? '' : 'disabled'} style="width:110px" placeholder="—"></td>
                <td>${badgeVariacao(variacaoMesConta.pct)}</td>
                <td><span class="badge ${c.ativo ? 'badge-success' : 'badge-danger'}">${c.ativo ? 'Ativo' : 'Inativo'}</span></td>
                <td class="table-actions">
                  ${podeGerenciarConta ? `<button class="icon-btn" data-salvar-rapido="${c.id}" title="Salvar orçado/realizado de ${fmtCompetencia(competenciaAtiva + '-01')}"><i class="ti ti-device-floppy"></i></button>` : ''}
                  <button class="icon-btn" data-detalhes="${c.id}" title="Orçado x Realizado, análises e anexos"><i class="ti ti-folder-open"></i></button>
                  <button class="icon-btn" data-imprimir-conta="${c.id}" title="Imprimir (orçado x realizado + análises)"><i class="ti ti-printer"></i></button>
                  ${podeEditar ? `
                    <button class="icon-btn" data-editar="${c.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                    <button class="icon-btn" data-excluir="${c.id}" title="Excluir"><i class="ti ti-trash"></i></button>
                  ` : ''}
                </td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>` : '<div class="empty-state"><i class="ti ti-report-money"></i>Nenhuma conta gerencial cadastrada.</div>'}
    </div>
  `;

  container.querySelectorAll('[data-filtro-cat]').forEach((btn) => {
    btn.addEventListener('click', () => { filtroCategoria = btn.dataset.filtroCat; render(container, state); });
  });
  container.querySelectorAll('[data-filtro-status]').forEach((btn) => {
    btn.addEventListener('click', () => { filtroStatus = btn.dataset.filtroStatus; render(container, state); });
  });

  const inputResumoCompetencia = container.querySelector('#competencia-ativa');
  if (inputResumoCompetencia) inputResumoCompetencia.addEventListener('change', (e) => {
    if (!e.target.value) return;
    competenciaAtiva = e.target.value;
    render(container, state);
  });

  container.querySelectorAll('[data-salvar-rapido]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const contaId = btn.dataset.salvarRapido;
      const linha = btn.closest('tr');
      const orcadoVal = linha.querySelector('[data-campo="orcado"]').value;
      const realizadoVal = linha.querySelector('[data-campo="realizado"]').value;
      const payload = {
        empresa_id: empresaAtual.id,
        conta_id: contaId,
        competencia: competenciaAtiva + '-01',
        valor_orcado: orcadoVal === '' ? null : Number(orcadoVal),
        valor_realizado: realizadoVal === '' ? null : Number(realizadoVal),
        usuario_id: user.id,
      };
      const { error } = await supabase.from('contas_lancamentos_mensais').upsert(payload, { onConflict: 'conta_id,competencia' });
      if (error) return toast('Erro ao salvar lançamento: ' + error.message, 'erro');
      toast('Lançamento salvo.', 'sucesso');
      render(container, state);
    });
  });

  const btnAdd = container.querySelector('#btn-add-conta');
  if (btnAdd) btnAdd.addEventListener('click', () => abrirFormulario(state, container, departamentos, membros));

  container.querySelectorAll('[data-detalhes]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const conta = contas.find((c) => c.id === btn.dataset.detalhes);
      abrirDetalheConta(state, container, conta, membros);
    });
  });

  container.querySelectorAll('[data-imprimir-conta]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const conta = contas.find((c) => c.id === btn.dataset.imprimirConta);
      imprimirConta(state, conta);
    });
  });

  container.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const conta = contas.find((c) => c.id === btn.dataset.editar);
      abrirFormulario(state, container, departamentos, membros, conta);
    });
  });

  container.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Excluir esta conta gerencial?'))) return;
      const { error } = await supabase.from('contas_gerenciais').delete().eq('id', btn.dataset.excluir);
      if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
      toast('Conta excluída.', 'sucesso');
      render(container, state);
    });
  });
}

function abrirFormulario(state, container, departamentos, membros, conta = null) {
  const { supabase, empresaAtual } = state;
  const modal = abrirModal(conta ? 'Editar conta gerencial' : 'Nova conta gerencial', `
    <form id="form-conta-gerencial">
      <div class="form-row">
        <div class="form-group">
          <label>Código da conta</label>
          <input type="text" id="cg-codigo" required placeholder="Ex: 3.1.001" value="${conta ? escapeHtml(conta.codigo) : ''}">
        </div>
        <div class="form-group" style="flex:2">
          <label>Nome da conta</label>
          <input type="text" id="cg-nome" required value="${conta ? escapeHtml(conta.nome) : ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Categoria</label>
          <select id="cg-categoria" required>
            ${Object.entries(CATEGORIA_LABEL).map(([v, l]) => `<option value="${v}" ${conta?.categoria === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="cg-ativo">
            <option value="true" ${!conta || conta.ativo ? 'selected' : ''}>Ativo</option>
            <option value="false" ${conta && !conta.ativo ? 'selected' : ''}>Inativo</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Área responsável</label>
          <select id="cg-departamento">
            <option value="">—</option>
            ${departamentos.map((d) => `<option value="${d.id}" ${conta?.departamento_id === d.id ? 'selected' : ''}>${escapeHtml(d.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Responsável pela análise</label>
          <select id="cg-responsavel">
            <option value="">—</option>
            ${membros.map((m) => `<option value="${m.usuario_id}" ${conta?.responsavel_analise_id === m.usuario_id ? 'selected' : ''}>${escapeHtml(m.nome || m.email)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Meta mensal (R$)</label>
          <input type="number" id="cg-meta-mensal" step="0.01" min="0" value="${conta?.meta_mensal ?? ''}">
        </div>
        <div class="form-group">
          <label>Meta anual (R$)</label>
          <input type="number" id="cg-meta-anual" step="0.01" min="0" value="${conta?.meta_anual ?? ''}">
        </div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#form-conta-gerencial').addEventListener('submit', async (e) => {
    e.preventDefault();
    const metaMensal = modal.querySelector('#cg-meta-mensal').value;
    const metaAnual = modal.querySelector('#cg-meta-anual').value;
    const payload = {
      empresa_id: empresaAtual.id,
      codigo: modal.querySelector('#cg-codigo').value.trim(),
      nome: modal.querySelector('#cg-nome').value.trim(),
      categoria: modal.querySelector('#cg-categoria').value,
      departamento_id: modal.querySelector('#cg-departamento').value || null,
      responsavel_analise_id: modal.querySelector('#cg-responsavel').value || null,
      meta_mensal: metaMensal === '' ? null : Number(metaMensal),
      meta_anual: metaAnual === '' ? null : Number(metaAnual),
      ativo: modal.querySelector('#cg-ativo').value === 'true',
    };
    const query = conta
      ? supabase.from('contas_gerenciais').update(payload).eq('id', conta.id)
      : supabase.from('contas_gerenciais').insert(payload);
    const { error } = await query;
    if (error) {
      const msg = error.code === '23505' ? 'Já existe uma conta com esse código nesta empresa.' : error.message;
      return toast('Erro ao salvar: ' + msg, 'erro');
    }
    toast('Salvo com sucesso.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}

// Baixa um arquivo do bucket privado e converte pra data URL (base64), garantindo que a imagem já
// esteja pronta no HTML antes do window.print() disparar — evita imagem "sumida" na impressão por
// o navegador não ter tido tempo de carregar a URL assinada a tempo.
async function baixarComoDataUrl(supabase, caminho) {
  const { data: blob, error } = await supabase.storage.from('contas-anexos').download(caminho);
  if (error || !blob) {
    console.error('Erro ao baixar anexo para impressão:', error);
    return null;
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

// ---------- Imprimir conta: orçado x realizado mensal + último gráfico/relatório + análises + planos de ação ----------
async function imprimirConta(state, conta) {
  const { supabase, empresaAtual } = state;

  let departamento, membros, analises, anexos, lancamentos, planos;
  try {
    const [resDepto, membrosData, resAnalises, resAnexos, resLancamentos, resPlanos] = await Promise.all([
      conta.departamento_id ? supabase.from('departamentos').select('nome').eq('id', conta.departamento_id).single() : Promise.resolve({ data: null }),
      supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }).then((r) => r.data || []),
      supabase.from('contas_analises').select('*').eq('conta_id', conta.id).order('competencia', { ascending: true }),
      supabase.from('contas_anexos').select('*').eq('conta_id', conta.id).order('created_at', { ascending: false }),
      supabase.from('contas_lancamentos_mensais').select('*').eq('conta_id', conta.id).order('competencia', { ascending: true }),
      supabase.from('planos_acao').select('*').eq('origem', 'conta_gerencial').eq('origem_id', conta.id).order('created_at', { ascending: false }),
    ]);
    departamento = resDepto.data;
    membros = membrosData;
    if (resAnalises.error) throw resAnalises.error;
    if (resAnexos.error) throw resAnexos.error;
    if (resLancamentos.error) throw resLancamentos.error;
    if (resPlanos.error) throw resPlanos.error;
    analises = resAnalises.data || [];
    anexos = resAnexos.data || [];
    lancamentos = resLancamentos.data || [];
    planos = resPlanos.data || [];
  } catch (err) {
    return toast('Erro ao preparar impressão: ' + err.message, 'erro');
  }

  const nomeMembroPorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));
  const ultimoAnexo = anexos[0] || null; // já vem ordenado do mais recente pro mais antigo

  let ultimoAnexoHtml = '<p class="text-muted">Nenhum arquivo enviado ainda.</p>';
  if (ultimoAnexo) {
    const ehImagem = ultimoAnexo.arquivo_tipo === 'png' || ultimoAnexo.arquivo_tipo === 'jpg';
    if (ehImagem) {
      const dataUrl = await baixarComoDataUrl(supabase, ultimoAnexo.arquivo_url);
      ultimoAnexoHtml = dataUrl
        ? `<img src="${dataUrl}" alt="${escapeHtml(ultimoAnexo.arquivo_nome)}" style="max-width:100%;max-height:400px">`
        : '<p class="text-muted">Não foi possível carregar o arquivo.</p>';
    } else {
      ultimoAnexoHtml = `<p><i class="ti ${TIPO_ARQUIVO_ICONE[ultimoAnexo.arquivo_tipo]}"></i> ${escapeHtml(ultimoAnexo.arquivo_nome)} (${TIPO_ARQUIVO_LABEL[ultimoAnexo.arquivo_tipo]})</p>`;
    }
    ultimoAnexoHtml += `<p class="text-muted" style="font-size:12px">Competência ${fmtCompetencia(ultimoAnexo.competencia)} · enviado por ${escapeHtml(nomeMembroPorId.get(ultimoAnexo.usuario_id) || '—')} em ${fmtData(ultimoAnexo.created_at)}</p>`;
  }

  imprimirSecao(`
    <h2 style="margin-bottom:4px">${escapeHtml(conta.codigo)} — ${escapeHtml(conta.nome)}</h2>
    <p class="text-muted">Controladoria — Conta Gerencial</p>
    <hr class="sep">
    <table class="print-detalhe-tabela">
      <tbody>
        <tr><th>Categoria</th><td>${CATEGORIA_LABEL[conta.categoria]}</td></tr>
        <tr><th>Área responsável</th><td>${escapeHtml(departamento?.nome || '—')}</td></tr>
        <tr><th>Responsável pela análise</th><td>${escapeHtml(nomeMembroPorId.get(conta.responsavel_analise_id) || '—')}</td></tr>
        <tr><th>Meta mensal</th><td>${fmtMoeda(conta.meta_mensal)}</td></tr>
        <tr><th>Meta anual</th><td>${fmtMoeda(conta.meta_anual)}</td></tr>
        <tr><th>Status</th><td>${conta.ativo ? 'Ativo' : 'Inativo'}</td></tr>
      </tbody>
    </table>

    <h4 style="margin-top:16px">Orçado x Realizado (todos os meses lançados)</h4>
    ${lancamentos.length ? `
      <table class="table">
        <thead><tr><th>Competência</th><th>Orçado</th><th>Realizado</th><th>Variação</th></tr></thead>
        <tbody>
          ${lancamentos.map((l) => {
            const v = calcVariacao(Number(l.valor_orcado), Number(l.valor_realizado));
            return `
            <tr>
              <td>${fmtCompetencia(l.competencia)}</td>
              <td>${fmtMoeda(l.valor_orcado)}</td>
              <td>${fmtMoeda(l.valor_realizado)}</td>
              <td>${fmtMoeda(v.valor)} ${v.pct != null ? `(${fmtPercent(v.pct)})` : ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : '<p class="text-muted">Nenhum lançamento mensal registrado ainda.</p>'}

    <h4 style="margin-top:16px">Último relatório/gráfico enviado</h4>
    ${ultimoAnexoHtml}

    <h4 style="margin-top:16px">Análises registradas (todos os meses)</h4>
    ${analises.length ? `
      <table class="table">
        <thead><tr><th>Competência</th><th>Análise</th><th>Desvio</th><th>Justificativa</th><th>Registrado por</th></tr></thead>
        <tbody>
          ${analises.map((a) => `
            <tr>
              <td>${fmtCompetencia(a.competencia)}</td>
              <td>${escapeHtml(a.texto_analise)}</td>
              <td>${a.houve_desvio ? 'Sim' : 'Não'}</td>
              <td>${escapeHtml(a.justificativa_desvio || '—')}</td>
              <td>${escapeHtml(nomeMembroPorId.get(a.usuario_id) || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>` : '<p class="text-muted">Nenhuma análise registrada ainda.</p>'}

    <h4 style="margin-top:16px">Planos de Ação vinculados</h4>
    ${planos.length ? `
      <table class="table">
        <thead><tr><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Situação</th></tr></thead>
        <tbody>
          ${planos.map((p) => `
            <tr>
              <td>${escapeHtml(p.titulo)}</td>
              <td>${escapeHtml(nomeMembroPorId.get(p.responsavel_id) || '—')}</td>
              <td>${p.quando ? new Date(p.quando + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
              <td>${STATUS_PLANO_LABEL[p.status] || p.status}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>` : '<p class="text-muted">Nenhum plano de ação vinculado a esta conta ainda.</p>'}
  `);
}

// ---------- DETALHE DA CONTA: orçado x realizado + análises periódicas + anexos + planos de ação ----------
let abaDetalheAtiva = 'valores';
let chartInstanceValores = null;

async function abrirDetalheConta(state, containerPai, conta, membros, abaInicial = 'valores') {
  abaDetalheAtiva = abaInicial;
  const modal = abrirModal(`${escapeHtml(conta.codigo)} — ${escapeHtml(conta.nome)}`, '<div id="detalhe-conta-corpo">Carregando...</div>');
  modal.classList.add('modal-xl');
  await renderDetalheConta(state, containerPai, modal, conta, membros);
}

async function renderDetalheConta(state, containerPai, modal, conta, membros) {
  const { supabase, empresaAtual } = state;
  const corpo = modal.querySelector('#detalhe-conta-corpo');

  let analises, anexos;
  try {
    const [resAnalises, resAnexos] = await Promise.all([
      supabase.from('contas_analises').select('*').eq('conta_id', conta.id).order('competencia', { ascending: false }),
      supabase.from('contas_anexos').select('*').eq('conta_id', conta.id).order('created_at', { ascending: false }),
    ]);
    if (resAnalises.error) throw resAnalises.error;
    if (resAnexos.error) throw resAnexos.error;
    analises = resAnalises.data || [];
    anexos = resAnexos.data || [];
  } catch (err) {
    corpo.innerHTML = `<div class="alert alert-warning">Erro ao carregar: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const nomeMembroPorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));

  corpo.innerHTML = `
    <div class="filters" style="margin-bottom:1rem;justify-content:space-between;display:flex;flex-wrap:wrap;gap:8px">
      <div class="filters" style="margin-bottom:0">
        <button class="filter-btn ${abaDetalheAtiva === 'valores' ? 'active' : ''}" data-aba-detalhe="valores"><i class="ti ti-chart-bar"></i> Orçado x Realizado</button>
        <button class="filter-btn ${abaDetalheAtiva === 'analises' ? 'active' : ''}" data-aba-detalhe="analises"><i class="ti ti-notes"></i> Análises periódicas</button>
        <button class="filter-btn ${abaDetalheAtiva === 'anexos' ? 'active' : ''}" data-aba-detalhe="anexos"><i class="ti ti-paperclip"></i> Relatórios e gráficos</button>
        <button class="filter-btn ${abaDetalheAtiva === 'planos' ? 'active' : ''}" data-aba-detalhe="planos"><i class="ti ti-clipboard-list"></i> Planos de Ação</button>
      </div>
      <button class="btn btn-secondary btn-sm" id="btn-imprimir-conta-detalhe"><i class="ti ti-printer"></i> Imprimir</button>
    </div>
    <div id="detalhe-conta-aba"></div>
  `;

  const btnImprimir = corpo.querySelector('#btn-imprimir-conta-detalhe');
  if (btnImprimir) btnImprimir.addEventListener('click', () => imprimirConta(state, conta));

  corpo.querySelectorAll('[data-aba-detalhe]').forEach((btn) => {
    btn.addEventListener('click', () => { abaDetalheAtiva = btn.dataset.abaDetalhe; renderDetalheConta(state, containerPai, modal, conta, membros); });
  });

  const areaAba = corpo.querySelector('#detalhe-conta-aba');
  if (abaDetalheAtiva === 'valores') {
    await renderAbaValores(state, modal, conta, areaAba);
  } else if (abaDetalheAtiva === 'analises') {
    renderAbaAnalises(state, containerPai, modal, conta, membros, analises, nomeMembroPorId, areaAba);
  } else if (abaDetalheAtiva === 'anexos') {
    renderAbaAnexos(state, modal, conta, anexos, nomeMembroPorId, areaAba);
  } else {
    await renderAbaPlanos(state, conta, nomeMembroPorId, areaAba);
  }
}

// ---------- ABA "Orçado x Realizado": lançamento mensal + tabela + gráfico ----------
async function renderAbaValores(state, modal, conta, areaAba) {
  const { supabase, empresaAtual, user } = state;
  const podeGerenciar = podeEditarRegistro(state, conta.responsavel_analise_id, 'controladoria');

  let lancamentos;
  try {
    const { data, error } = await supabase.from('contas_lancamentos_mensais').select('*').eq('conta_id', conta.id).order('competencia', { ascending: false });
    if (error) throw error;
    lancamentos = data || [];
  } catch (err) {
    areaAba.innerHTML = `<div class="alert alert-warning">Erro ao carregar lançamentos: ${escapeHtml(err.message)}</div>`;
    return;
  }

  areaAba.innerHTML = `
    ${podeGerenciar ? `
    <form id="form-lancamento-mensal" style="margin-bottom:1.25rem">
      <div class="form-row">
        <div class="form-group">
          <label>Competência</label>
          <input type="month" id="lm-competencia" required value="${new Date().toISOString().slice(0, 7)}">
        </div>
        <div class="form-group">
          <label>Valor orçado (R$)</label>
          <input type="number" id="lm-orcado" step="0.01">
        </div>
        <div class="form-group">
          <label>Valor realizado (R$)</label>
          <input type="number" id="lm-realizado" step="0.01">
        </div>
      </div>
      <button class="btn btn-primary btn-sm" type="submit"><i class="ti ti-device-floppy"></i> Salvar lançamento</button>
      <span class="text-muted" style="font-size:12px;margin-left:8px">Lançar numa competência que já existe atualiza o valor.</span>
    </form>
    ` : '<p class="text-muted" style="margin-bottom:1rem"><i class="ti ti-lock"></i> Apenas o responsável pela análise desta conta (ou a Qualidade/administração) pode lançar valores.</p>'}

    <canvas id="grafico-conta-valores" height="110"></canvas>

    ${lancamentos.length ? `
      <table class="table" style="margin-top:1rem">
        <thead><tr><th>Competência</th><th>Orçado</th><th>Realizado</th><th>Variação</th>${podeGerenciar ? '<th></th>' : ''}</tr></thead>
        <tbody>
          ${lancamentos.map((l) => {
            const v = calcVariacao(l.valor_orcado == null ? null : Number(l.valor_orcado), l.valor_realizado == null ? null : Number(l.valor_realizado));
            return `
            <tr>
              <td>${fmtCompetencia(l.competencia)}</td>
              <td>${fmtMoeda(l.valor_orcado)}</td>
              <td>${fmtMoeda(l.valor_realizado)}</td>
              <td>${fmtMoeda(v.valor)} ${badgeVariacao(v.pct)}</td>
              ${podeGerenciar ? `
              <td class="table-actions">
                <button class="icon-btn" data-editar-lancamento="${l.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                <button class="icon-btn" data-excluir-lancamento="${l.id}" title="Excluir"><i class="ti ti-trash"></i></button>
              </td>` : ''}
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : '<div class="empty-state" style="margin-top:1rem"><i class="ti ti-chart-bar"></i>Nenhum lançamento mensal registrado ainda.</div>'}
  `;

  const cronologico = [...lancamentos].sort((a, b) => a.competencia.localeCompare(b.competencia));
  if (chartInstanceValores) { chartInstanceValores.destroy(); chartInstanceValores = null; }
  const canvas = areaAba.querySelector('#grafico-conta-valores');
  if (canvas && window.Chart) {
    chartInstanceValores = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: cronologico.map((l) => fmtCompetencia(l.competencia)),
        datasets: [
          { label: 'Orçado', data: cronologico.map((l) => l.valor_orcado), backgroundColor: 'rgba(37,37,56,0.25)', borderColor: '#252538', borderWidth: 1 },
          { label: 'Realizado', data: cronologico.map((l) => l.valor_realizado), backgroundColor: 'rgba(232,184,75,0.65)', borderColor: '#E8B84B', borderWidth: 1 },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } },
    });
  }

  if (!podeGerenciar) return;

  areaAba.querySelector('#form-lancamento-mensal').addEventListener('submit', async (e) => {
    e.preventDefault();
    const orcado = areaAba.querySelector('#lm-orcado').value;
    const realizado = areaAba.querySelector('#lm-realizado').value;
    const payload = {
      empresa_id: empresaAtual.id,
      conta_id: conta.id,
      competencia: areaAba.querySelector('#lm-competencia').value + '-01',
      valor_orcado: orcado === '' ? null : Number(orcado),
      valor_realizado: realizado === '' ? null : Number(realizado),
      usuario_id: user.id,
    };
    const { error } = await supabase.from('contas_lancamentos_mensais').upsert(payload, { onConflict: 'conta_id,competencia' });
    if (error) return toast('Erro ao salvar lançamento: ' + error.message, 'erro');
    toast('Lançamento salvo.', 'sucesso');
    renderAbaValores(state, modal, conta, areaAba);
  });

  areaAba.querySelectorAll('[data-editar-lancamento]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const l = lancamentos.find((x) => x.id === btn.dataset.editarLancamento);
      areaAba.querySelector('#lm-competencia').value = l.competencia.slice(0, 7);
      areaAba.querySelector('#lm-orcado').value = l.valor_orcado ?? '';
      areaAba.querySelector('#lm-realizado').value = l.valor_realizado ?? '';
      areaAba.querySelector('#lm-competencia').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  areaAba.querySelectorAll('[data-excluir-lancamento]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Excluir este lançamento?'))) return;
      const { error } = await supabase.from('contas_lancamentos_mensais').delete().eq('id', btn.dataset.excluirLancamento);
      if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
      toast('Lançamento excluído.', 'sucesso');
      renderAbaValores(state, modal, conta, areaAba);
    });
  });
}

// ---------- ABA "Planos de Ação": lista os planos criados a partir de análises desta conta ----------
async function renderAbaPlanos(state, conta, nomeMembroPorId, areaAba) {
  const { supabase } = state;
  let planos;
  try {
    const { data, error } = await supabase.from('planos_acao').select('*').eq('origem', 'conta_gerencial').eq('origem_id', conta.id).order('created_at', { ascending: false });
    if (error) throw error;
    planos = data || [];
  } catch (err) {
    areaAba.innerHTML = `<div class="alert alert-warning">Erro ao carregar planos de ação: ${escapeHtml(err.message)}</div>`;
    return;
  }

  areaAba.innerHTML = `
    <p class="text-muted" style="font-size:12px;margin-bottom:0.75rem">Planos de ação criados a partir de análises desta conta. Para editar, use o módulo Ações.</p>
    ${planos.length ? `
      <table class="table">
        <thead><tr><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Prioridade</th><th>Situação</th></tr></thead>
        <tbody>
          ${planos.map((p) => `
            <tr>
              <td>${escapeHtml(p.titulo)}</td>
              <td>${escapeHtml(nomeMembroPorId.get(p.responsavel_id) || '—')}</td>
              <td>${p.quando ? new Date(p.quando + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
              <td>${p.prioridade ? PRIORIDADE_LABEL[p.prioridade] : '—'}</td>
              <td><span class="badge status-${p.status}">${STATUS_PLANO_LABEL[p.status] || p.status}</span> ${p.percentual_conclusao ? `<span class="text-muted" style="font-size:12px">(${p.percentual_conclusao}%)</span>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>` : '<div class="empty-state"><i class="ti ti-clipboard-list"></i>Nenhum plano de ação vinculado a esta conta ainda. Crie um a partir de uma análise.</div>'}
  `;
}

function renderAbaAnalises(state, containerPai, modal, conta, membros, analises, nomeMembroPorId, areaAba) {
  const { supabase, empresaAtual, user } = state;
  const podeGerenciar = podeEditarRegistro(state, conta.responsavel_analise_id, 'controladoria');

  areaAba.innerHTML = `
    ${podeGerenciar ? `
    <form id="form-nova-analise" style="margin-bottom:1.25rem">
      <div class="form-row">
        <div class="form-group">
          <label>Competência</label>
          <input type="month" id="an-competencia" required value="${new Date().toISOString().slice(0, 7)}">
        </div>
      </div>
      <div class="form-group">
        <label>Análise</label>
        <textarea id="an-texto" required placeholder="O que os dados de orçado x realizado mostraram para esta conta neste período?"></textarea>
      </div>
      <label class="checkbox-linha" style="display:flex;align-items:center;gap:8px;margin-bottom:0.75rem">
        <input type="checkbox" id="an-houve-desvio">
        <span>Houve desvio em relação à meta</span>
      </label>
      <div class="form-group" id="an-grupo-justificativa" style="display:none">
        <label>Justificativa do desvio</label>
        <textarea id="an-justificativa" placeholder="Por que a conta desviou da meta neste período?"></textarea>
      </div>
      <button class="btn btn-primary btn-sm" type="submit"><i class="ti ti-plus"></i> Registrar análise</button>
    </form>
    ` : '<p class="text-muted" style="margin-bottom:1rem"><i class="ti ti-lock"></i> Apenas o responsável pela análise desta conta (ou a Qualidade/administração) pode registrar novas análises.</p>'}

    ${analises.length ? analises.map((a) => `
      <div class="card" style="padding:12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
          <div>
            <strong>${fmtCompetencia(a.competencia)}</strong>
            ${a.houve_desvio ? '<span class="badge badge-danger" style="margin-left:6px">Desvio</span>' : ''}
            <div class="text-muted" style="font-size:12px">${escapeHtml(nomeMembroPorId.get(a.usuario_id) || '—')} · ${fmtData(a.created_at)}</div>
          </div>
        </div>
        <p style="margin:8px 0 4px">${escapeHtml(a.texto_analise)}</p>
        ${a.houve_desvio && a.justificativa_desvio ? `<p class="text-muted" style="font-size:13px"><strong>Justificativa:</strong> ${escapeHtml(a.justificativa_desvio)}</p>` : ''}
        ${podeGerenciar ? `
        <div class="table-actions" style="margin-top:8px">
          <button class="btn btn-secondary btn-sm" data-criar-plano="${a.id}"><i class="ti ti-clipboard-plus"></i> Criar Plano de Ação</button>
          <button class="btn btn-secondary btn-sm" data-criar-tarefa="${a.id}"><i class="ti ti-checkbox"></i> Criar Tarefa</button>
          <button class="icon-btn" data-excluir-analise="${a.id}" title="Excluir análise"><i class="ti ti-trash"></i></button>
        </div>` : ''}
      </div>
    `).join('') : '<div class="empty-state"><i class="ti ti-notes"></i>Nenhuma análise registrada ainda.</div>'}
  `;

  if (!podeGerenciar) return;

  const chkDesvio = areaAba.querySelector('#an-houve-desvio');
  chkDesvio.addEventListener('change', (e) => {
    areaAba.querySelector('#an-grupo-justificativa').style.display = e.target.checked ? '' : 'none';
  });

  areaAba.querySelector('#form-nova-analise').addEventListener('submit', async (e) => {
    e.preventDefault();
    const houveDesvio = chkDesvio.checked;
    const payload = {
      empresa_id: empresaAtual.id,
      conta_id: conta.id,
      competencia: areaAba.querySelector('#an-competencia').value + '-01',
      texto_analise: areaAba.querySelector('#an-texto').value.trim(),
      houve_desvio: houveDesvio,
      justificativa_desvio: houveDesvio ? areaAba.querySelector('#an-justificativa').value.trim() : null,
      usuario_id: user.id,
    };
    const { error } = await supabase.from('contas_analises').insert(payload);
    if (error) return toast('Erro ao registrar análise: ' + error.message, 'erro');
    toast('Análise registrada.', 'sucesso');
    renderDetalheConta(state, containerPai, modal, conta, membros);
  });

  areaAba.querySelectorAll('[data-criar-plano]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const analise = analises.find((a) => a.id === btn.dataset.criarPlano);
      abrirFormularioPlanoDeAcaoDaAnalise(state, containerPai, conta, analise, membros);
    });
  });
  areaAba.querySelectorAll('[data-criar-tarefa]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const analise = analises.find((a) => a.id === btn.dataset.criarTarefa);
      abrirFormularioTarefaDaAnalise(state, conta, analise, membros);
    });
  });

  areaAba.querySelectorAll('[data-excluir-analise]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Excluir esta análise?'))) return;
      const { error } = await supabase.from('contas_analises').delete().eq('id', btn.dataset.excluirAnalise);
      if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
      toast('Análise excluída.', 'sucesso');
      renderDetalheConta(state, containerPai, modal, conta, membros);
    });
  });
}

function renderAbaAnexos(state, modal, conta, anexos, nomeMembroPorId, areaAba) {
  const { supabase, empresaAtual, user } = state;
  const podeGerenciar = podeEditarRegistro(state, conta.responsavel_analise_id, 'controladoria');

  areaAba.innerHTML = `
    ${podeGerenciar ? `
    <form id="form-novo-anexo" style="margin-bottom:1.25rem">
      <div class="form-row">
        <div class="form-group">
          <label>Competência</label>
          <input type="month" id="ax-competencia" required value="${new Date().toISOString().slice(0, 7)}">
        </div>
        <div class="form-group" style="flex:2">
          <label>Arquivo (PDF, Excel, PNG, JPG ou PowerPoint)</label>
          <input type="file" id="ax-arquivo" required accept=".pdf,.xls,.xlsx,.png,.jpg,.jpeg,.ppt,.pptx">
        </div>
      </div>
      <button class="btn btn-primary btn-sm" type="submit"><i class="ti ti-upload"></i> Enviar</button>
    </form>
    ` : '<p class="text-muted" style="margin-bottom:1rem"><i class="ti ti-lock"></i> Apenas o responsável pela análise desta conta (ou a Qualidade/administração) pode enviar novos arquivos.</p>'}

    <p class="text-muted" style="font-size:12px;margin-bottom:0.5rem">Histórico de uploads</p>
    ${anexos.length ? `
      <table class="table">
        <thead><tr><th>Arquivo</th><th>Tipo</th><th>Competência</th><th>Enviado por</th><th>Data do upload</th><th></th></tr></thead>
        <tbody>
          ${anexos.map((a) => `
            <tr>
              <td><i class="ti ${TIPO_ARQUIVO_ICONE[a.arquivo_tipo]}"></i> ${escapeHtml(a.arquivo_nome)}</td>
              <td><span class="badge badge-neutral">${TIPO_ARQUIVO_LABEL[a.arquivo_tipo]}</span></td>
              <td>${fmtCompetencia(a.competencia)}</td>
              <td>${escapeHtml(nomeMembroPorId.get(a.usuario_id) || '—')}</td>
              <td>${fmtData(a.created_at)}</td>
              <td class="table-actions">
                <button class="icon-btn" data-visualizar-anexo="${a.id}" title="Visualizar e analisar"><i class="ti ti-eye"></i></button>
                <button class="icon-btn" data-baixar-anexo="${a.id}" title="Baixar"><i class="ti ti-download"></i></button>
                ${podeGerenciar ? `<button class="icon-btn" data-excluir-anexo="${a.id}" title="Excluir"><i class="ti ti-trash"></i></button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>` : '<div class="empty-state"><i class="ti ti-paperclip"></i>Nenhum arquivo enviado ainda.</div>'}
  `;

  if (podeGerenciar) areaAba.querySelector('#form-novo-anexo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const arquivo = areaAba.querySelector('#ax-arquivo').files[0];
    const competencia = areaAba.querySelector('#ax-competencia').value + '-01';
    const ext = arquivo.name.split('.').pop().toLowerCase();
    const tipo = EXT_PARA_TIPO[ext];
    if (!tipo) return toast('Tipo de arquivo não permitido. Use PDF, Excel, PNG, JPG ou PowerPoint.', 'erro');

    const btnSubmit = areaAba.querySelector('#form-novo-anexo button[type="submit"]');
    btnSubmit.disabled = true;

    const nomeSanitizado = arquivo.name
      .normalize('NFD').replace(new RegExp(String.fromCharCode(0x5b) + '\\u0300-\\u036f' + String.fromCharCode(0x5d), 'g'), '') // remove acentos
      .replace(/[^a-zA-Z0-9._-]/g, '_'); // troca espaços e demais caracteres especiais por "_"
    const caminho = `${empresaAtual.id}/${conta.id}/${Date.now()}_${nomeSanitizado}`;
    const { error: errUpload } = await supabase.storage.from('contas-anexos').upload(caminho, arquivo);
    if (errUpload) {
      btnSubmit.disabled = false;
      return toast('Erro ao enviar arquivo: ' + errUpload.message, 'erro');
    }

    const { error: errInsert } = await supabase.from('contas_anexos').insert({
      empresa_id: empresaAtual.id,
      conta_id: conta.id,
      competencia,
      arquivo_url: caminho,
      arquivo_nome: arquivo.name,
      arquivo_tipo: tipo,
      usuario_id: user.id,
    });
    btnSubmit.disabled = false;
    if (errInsert) return toast('Arquivo enviado, mas houve erro ao registrar: ' + errInsert.message, 'erro');

    toast('Arquivo enviado com sucesso.', 'sucesso');
    renderDetalheConta(state, null, modal, conta, [...nomeMembroPorId].map(([usuario_id, nome]) => ({ usuario_id, nome })));
  });

  areaAba.querySelectorAll('[data-visualizar-anexo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const anexo = anexos.find((a) => a.id === btn.dataset.visualizarAnexo);
      const membros = [...nomeMembroPorId].map(([usuario_id, nome]) => ({ usuario_id, nome }));
      abrirVisualizacaoAnexo(state, conta, anexo, membros);
    });
  });

  areaAba.querySelectorAll('[data-baixar-anexo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const anexo = anexos.find((a) => a.id === btn.dataset.baixarAnexo);
      const { data, error } = await supabase.storage.from('contas-anexos').createSignedUrl(anexo.arquivo_url, 300);
      if (error) return toast('Erro ao gerar link: ' + error.message, 'erro');
      window.open(data.signedUrl, '_blank');
    });
  });

  areaAba.querySelectorAll('[data-excluir-anexo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Excluir este arquivo do histórico?'))) return;
      const anexo = anexos.find((a) => a.id === btn.dataset.excluirAnexo);
      await supabase.storage.from('contas-anexos').remove([anexo.arquivo_url]);
      const { error } = await supabase.from('contas_anexos').delete().eq('id', anexo.id);
      if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
      toast('Arquivo excluído.', 'sucesso');
      renderDetalheConta(state, null, modal, conta, [...nomeMembroPorId].map(([usuario_id, nome]) => ({ usuario_id, nome })));
    });
  });
}

// ---------- Visualizar anexo (imagem/relatório) em tela cheia + registrar análise vinculada a ele ----------
// Mesmo padrão visual do botão "Apresentar" dos Indicadores (apresentacao-overlay).
async function abrirVisualizacaoAnexo(state, conta, anexo, membros) {
  const { supabase, user } = state;
  const nomeMembroPorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));
  const ehImagem = anexo.arquivo_tipo === 'png' || anexo.arquivo_tipo === 'jpg';
  const podeGerenciar = podeEditarRegistro(state, conta.responsavel_analise_id, 'controladoria');

  let analises;
  try {
    const { data, error } = await supabase.from('contas_analises').select('*').eq('anexo_id', anexo.id).order('created_at', { ascending: false });
    if (error) throw error;
    analises = data || [];
  } catch (err) {
    return toast('Erro ao carregar análises: ' + err.message, 'erro');
  }

  const { data: signed, error: errSigned } = await supabase.storage.from('contas-anexos').createSignedUrl(anexo.arquivo_url, 600);

  const overlay = document.createElement('div');
  overlay.className = 'apresentacao-overlay';
  overlay.innerHTML = `
    <button class="apresentacao-fechar" id="av-fechar" title="Fechar"><i class="ti ti-x"></i></button>
    <div class="apresentacao-conteudo">
      <h1>${escapeHtml(anexo.arquivo_nome)}</h1>
      <p class="apresentacao-subtitulo">${escapeHtml(conta.codigo)} — ${escapeHtml(conta.nome)}</p>
      <div class="apresentacao-meta-row">
        <div class="apresentacao-meta-item"><span>Competência</span><strong>${fmtCompetencia(anexo.competencia)}</strong></div>
        <div class="apresentacao-meta-item"><span>Enviado por</span><strong style="font-size:16px">${escapeHtml(nomeMembroPorId.get(anexo.usuario_id) || '—')}</strong></div>
        <div class="apresentacao-meta-item"><span>Data do upload</span><strong style="font-size:16px">${fmtData(anexo.created_at)}</strong></div>
      </div>
      <div class="apresentacao-grafico-box" style="text-align:center">
        ${errSigned ? '<p class="text-muted">Não foi possível carregar o arquivo.</p>'
          : ehImagem
            ? `<img src="${signed.signedUrl}" alt="${escapeHtml(anexo.arquivo_nome)}" style="max-width:100%;max-height:60vh;border-radius:8px">`
            : `<a href="${signed.signedUrl}" target="_blank" class="btn btn-primary"><i class="ti ti-external-link"></i> Abrir ${TIPO_ARQUIVO_LABEL[anexo.arquivo_tipo]}</a>`}
      </div>
      <div class="apresentacao-analise">
        ${podeGerenciar ? `
        <label>Registrar análise deste ${ehImagem ? 'gráfico' : 'arquivo'}</label>
        <textarea id="av-texto" placeholder="O que este gráfico/relatório mostra? Está dentro da meta?"></textarea>
        <label class="checkbox-linha" style="display:flex;align-items:center;gap:8px;margin:-4px 0 12px">
          <input type="checkbox" id="av-houve-desvio">
          <span style="font-weight:400">Houve desvio em relação à meta</span>
        </label>
        <div id="av-grupo-justificativa" style="display:none;margin-bottom:12px">
          <label style="font-size:13px">Justificativa do desvio</label>
          <textarea id="av-justificativa" style="min-height:80px"></textarea>
        </div>
        <button class="btn btn-primary" id="av-salvar-analise"><i class="ti ti-device-floppy"></i> Registrar análise</button>
        ` : '<p class="text-muted"><i class="ti ti-lock"></i> Apenas o responsável pela análise desta conta (ou a Qualidade/administração) pode registrar análises.</p>'}

        <div id="av-lista-analises" style="margin-top:1.5rem">
          ${renderListaAnalisesAnexo(analises, nomeMembroPorId, podeGerenciar)}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const fechar = () => { overlay.remove(); document.removeEventListener('keydown', onEsc); };
  overlay.querySelector('#av-fechar').addEventListener('click', fechar);
  const onEsc = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', onEsc);

  const chkDesvio = overlay.querySelector('#av-houve-desvio');
  chkDesvio?.addEventListener('change', (e) => {
    overlay.querySelector('#av-grupo-justificativa').style.display = e.target.checked ? '' : 'none';
  });

  const wireAcoesAnalise = () => {
    overlay.querySelectorAll('[data-criar-plano-anexo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const analise = analises.find((a) => a.id === btn.dataset.criarPlanoAnexo);
        abrirFormularioPlanoDeAcaoDaAnalise(state, null, conta, analise, membros);
      });
    });
    overlay.querySelectorAll('[data-criar-tarefa-anexo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const analise = analises.find((a) => a.id === btn.dataset.criarTarefaAnexo);
        abrirFormularioTarefaDaAnalise(state, conta, analise, membros);
      });
    });
    overlay.querySelectorAll('[data-excluir-analise-anexo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmar('Excluir esta análise?'))) return;
        const { error } = await supabase.from('contas_analises').delete().eq('id', btn.dataset.excluirAnaliseAnexo);
        if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
        toast('Análise excluída.', 'sucesso');
        analises = analises.filter((a) => a.id !== btn.dataset.excluirAnaliseAnexo);
        overlay.querySelector('#av-lista-analises').innerHTML = renderListaAnalisesAnexo(analises, nomeMembroPorId, podeGerenciar);
        wireAcoesAnalise();
      });
    });
  };
  wireAcoesAnalise();

  overlay.querySelector('#av-salvar-analise')?.addEventListener('click', async () => {
    const texto = overlay.querySelector('#av-texto').value.trim();
    if (!texto) return toast('Escreva a análise antes de registrar.', 'erro');
    const houveDesvio = chkDesvio.checked;
    const payload = {
      empresa_id: state.empresaAtual.id,
      conta_id: conta.id,
      anexo_id: anexo.id,
      competencia: anexo.competencia,
      texto_analise: texto,
      houve_desvio: houveDesvio,
      justificativa_desvio: houveDesvio ? overlay.querySelector('#av-justificativa').value.trim() : null,
      usuario_id: user.id,
    };
    const { data: nova, error } = await supabase.from('contas_analises').insert(payload).select().single();
    if (error) return toast('Erro ao registrar análise: ' + error.message, 'erro');
    toast('Análise registrada.', 'sucesso');
    analises = [nova, ...analises];
    overlay.querySelector('#av-texto').value = '';
    overlay.querySelector('#av-houve-desvio').checked = false;
    overlay.querySelector('#av-grupo-justificativa').style.display = 'none';
    overlay.querySelector('#av-justificativa').value = '';
    overlay.querySelector('#av-lista-analises').innerHTML = renderListaAnalisesAnexo(analises, nomeMembroPorId, podeGerenciar);
    wireAcoesAnalise();
  });
}

function renderListaAnalisesAnexo(analises, nomeMembroPorId, podeGerenciar = true) {
  if (!analises.length) return '<div class="empty-state"><i class="ti ti-notes"></i>Nenhuma análise registrada para este arquivo ainda.</div>';
  return analises.map((a) => `
    <div class="card" style="padding:12px;margin-bottom:10px">
      <div class="text-muted" style="font-size:12px">${escapeHtml(nomeMembroPorId.get(a.usuario_id) || '—')} · ${fmtData(a.created_at)}
        ${a.houve_desvio ? '<span class="badge badge-danger" style="margin-left:6px">Desvio</span>' : ''}
      </div>
      <p style="margin:8px 0 4px">${escapeHtml(a.texto_analise)}</p>
      ${a.houve_desvio && a.justificativa_desvio ? `<p class="text-muted" style="font-size:13px"><strong>Justificativa:</strong> ${escapeHtml(a.justificativa_desvio)}</p>` : ''}
      ${podeGerenciar ? `
      <div class="table-actions" style="margin-top:8px">
        <button class="btn btn-secondary btn-sm" data-criar-plano-anexo="${a.id}"><i class="ti ti-clipboard-plus"></i> Criar Plano de Ação</button>
        <button class="btn btn-secondary btn-sm" data-criar-tarefa-anexo="${a.id}"><i class="ti ti-checkbox"></i> Criar Tarefa</button>
        <button class="icon-btn" data-excluir-analise-anexo="${a.id}" title="Excluir análise"><i class="ti ti-trash"></i></button>
      </div>` : ''}
    </div>
  `).join('');
}

// ---------- "Criar Plano de Ação" a partir de uma análise ----------
function abrirFormularioPlanoDeAcaoDaAnalise(state, containerPai, conta, analise, membros) {
  const { supabase, empresaAtual } = state;
  const modal = abrirModal(`Criar Plano de Ação — ${escapeHtml(conta.codigo)}`, `
    <form id="form-plano-da-analise">
      <div class="form-group">
        <label>Problema identificado</label>
        <textarea id="pda-problema" required placeholder="Ex: Custo com frete acima da meta mensal há 3 meses consecutivos">${escapeHtml(analise.texto_analise)}</textarea>
      </div>
      <div class="form-group">
        <label>Causa</label>
        <textarea id="pda-causa" placeholder="${analise.justificativa_desvio ? '' : 'Causa raiz do desvio'}">${escapeHtml(analise.justificativa_desvio || '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Responsável</label>
          <select id="pda-responsavel">
            <option value="">—</option>
            ${membros.map((m) => `<option value="${m.usuario_id}" ${conta.responsavel_analise_id === m.usuario_id ? 'selected' : ''}>${escapeHtml(m.nome || m.email)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Prazo</label>
          <input type="date" id="pda-prazo">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Prioridade</label>
          <select id="pda-prioridade">
            ${Object.entries(PRIORIDADE_LABEL).map(([v, l]) => `<option value="${v}" ${v === 'media' ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Impacto financeiro (R$)</label>
          <input type="number" id="pda-impacto" step="0.01" min="0">
        </div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Criar Plano de Ação</button>
    </form>
  `);

  modal.querySelector('#form-plano-da-analise').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      empresa_id: empresaAtual.id,
      titulo: modal.querySelector('#pda-problema').value.trim(),
      o_que: modal.querySelector('#pda-problema').value.trim(),
      por_que: modal.querySelector('#pda-causa').value.trim(),
      responsavel_id: modal.querySelector('#pda-responsavel').value || null,
      quando: modal.querySelector('#pda-prazo').value || null,
      prioridade: modal.querySelector('#pda-prioridade').value,
      quanto_custa: modal.querySelector('#pda-impacto').value || null,
      origem: 'conta_gerencial',
      origem_id: conta.id,
      analise_origem_id: analise.id,
    };
    const { error } = await supabase.from('planos_acao').insert(payload);
    if (error) return toast('Erro ao criar plano de ação: ' + error.message, 'erro');
    toast('Plano de ação criado — disponível no módulo Ações.', 'sucesso');
    fecharModal();
  });
}

// ---------- "Criar Tarefa" a partir de uma análise ----------
function abrirFormularioTarefaDaAnalise(state, conta, analise, membros) {
  const { supabase, empresaAtual } = state;
  const modal = abrirModal(`Criar Tarefa — ${escapeHtml(conta.codigo)}`, `
    <form id="form-tarefa-da-analise">
      <div class="form-group">
        <label>Descrição</label>
        <input type="text" id="td-descricao" required list="td-exemplos" placeholder="Ex: Revisar orçamento, Renegociar fornecedor...">
        <datalist id="td-exemplos">
          <option value="Revisar orçamento">
          <option value="Renegociar fornecedor">
          <option value="Reduzir consumo de material">
          <option value="Revisar produtividade">
        </datalist>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Responsável</label>
          <select id="td-responsavel">
            <option value="">—</option>
            ${membros.map((m) => `<option value="${m.usuario_id}" ${conta.responsavel_analise_id === m.usuario_id ? 'selected' : ''}>${escapeHtml(m.nome || m.email)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Prazo</label>
          <input type="date" id="td-prazo">
        </div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Criar Tarefa</button>
    </form>
  `);

  modal.querySelector('#form-tarefa-da-analise').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      empresa_id: empresaAtual.id,
      descricao: modal.querySelector('#td-descricao').value.trim(),
      responsavel_id: modal.querySelector('#td-responsavel').value || null,
      prazo: modal.querySelector('#td-prazo').value || null,
      conta_id: conta.id,
      competencia: analise.competencia,
      analise_id: analise.id,
    };
    const { error } = await supabase.from('todo_itens').insert(payload);
    if (error) return toast('Erro ao criar tarefa: ' + error.message, 'erro');
    toast('Tarefa criada — disponível no módulo Ações, aba Tarefas.', 'sucesso');
    fecharModal();
  });
}
