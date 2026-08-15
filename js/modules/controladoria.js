import { abrirModal, fecharModal, toast, escapeHtml, confirmar, imprimirSecao, podeEditarRegistro, resolverNivel, formatarDataHora, buscarTodos } from '../ui.js';
import { coresGrafico } from '../tema.js';

const CATEGORIA_LABEL = { receita: 'Receita', custo: 'Custo', despesa: 'Despesa', investimento: 'Investimento' };
const CATEGORIA_BADGE = { receita: 'badge-success', custo: 'badge-warning', despesa: 'badge-danger', investimento: 'badge-neutral' };
const CATEGORIA_COR = { receita: 'green', custo: 'orange', despesa: 'pink', investimento: 'blue' };

const TIPO_ARQUIVO_LABEL = { pdf: 'PDF', excel: 'Excel', png: 'PNG', jpg: 'JPG', powerpoint: 'PowerPoint' };
const TIPO_ARQUIVO_ICONE = { pdf: 'ti-file-type-pdf', excel: 'ti-file-type-xls', png: 'ti-photo', jpg: 'ti-photo', powerpoint: 'ti-file-type-ppt' };
const EXT_PARA_TIPO = { pdf: 'pdf', xls: 'excel', xlsx: 'excel', png: 'png', jpg: 'jpg', jpeg: 'jpg', ppt: 'powerpoint', pptx: 'powerpoint' };
const PRIORIDADE_LABEL = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
const STATUS_PLANO_LABEL = { nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento', concluido: 'Concluído', atrasado: 'Atrasado' };
const MESES_LABEL = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const fmtCompetencia = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' }) : '—';
// Reaproveita formatarDataHora() de ui.js (mesmo formato "dd/mm/aaaa hh:mm" usado no resto do
// app) em vez de toLocaleString('pt-BR') sem opções, que também mostra segundos e vírgula.
const fmtData = (iso) => iso ? formatarDataHora(iso) : '—';

const fmtMoeda = (v) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPercent = (v) => v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;

// ---------- Máscara de moeda pros inputs de valores (mostra "R$ 1.234,56" enquanto digita) ----------
const centavosParaMoeda = (centavos) => `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Formata um número (vindo do banco) pro valor inicial de um input com máscara de moeda.
const valorInicialMascarado = (v) => (v == null || v === '') ? '' : centavosParaMoeda(Math.round(Number(v) * 100));

// Digita como calculadora: cada dígito novo entra na casa dos centavos, empurrando o resto pra
// esquerda — evita o usuário ter que se preocupar com onde fica a vírgula.
function aplicarMascaraMoeda(input) {
  if (!input) return;
  input.addEventListener('input', () => {
    const digitos = input.value.replace(/\D/g, '');
    input.value = digitos ? centavosParaMoeda(parseInt(digitos, 10)) : '';
  });
}

// Extrai o número puro de um input com máscara de moeda pra mandar pro banco.
const moedaParaNumero = (str) => {
  const digitos = (str || '').replace(/\D/g, '');
  return digitos ? parseInt(digitos, 10) / 100 : null;
};

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

let filtroCategoria = 'todas';
let filtroStatus = 'ativo';
let competenciaAtiva = null; // 'YYYY-MM', escolhida pelo usuário no painel de Resumo Consolidado

export async function render(container, state) {
  const { supabase, empresaAtual } = state;
  const podeEditar = resolverNivel(state, 'controladoria') === 'total';
  const podeEditarRol = resolverNivel(state, 'controladoria', 'rol') === 'total';

  let contas, departamentos, membros, lancamentos;
  try {
    [contas, departamentos, membros, lancamentos] = await Promise.all([
      supabase.from('contas_gerenciais').select('*').eq('empresa_id', empresaAtual.id),
      supabase.from('departamentos').select('*').eq('empresa_id', empresaAtual.id).order('nome').then((r) => { if (r.error) throw r.error; return r.data || []; }),
      supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }).then((r) => { if (r.error) throw r.error; return r.data || []; }),
      buscarTodos(() => supabase.from('contas_lancamentos_mensais').select('*').eq('empresa_id', empresaAtual.id)).then((r) => { if (r.error) throw r.error; return r.data || []; }),
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
          <div class="stat-box accent-${CATEGORIA_COR[t.cat]}">
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
        <div style="display:flex;align-items:center;gap:8px">
          ${podeEditarRol ? '<button class="btn btn-secondary btn-sm" id="btn-config-rol" title="Configurar a Receita (ROL) da empresa, usada no % sobre a ROL de cada conta"><i class="ti ti-settings"></i> ROL da empresa</button>' : ''}
          <input type="month" id="competencia-ativa" value="${competenciaAtiva}">
        </div>
      </div>
      ${doMes.length ? `
        <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:1rem">
          <div class="stat-box accent-blue">
            <div class="text-muted" style="font-size:12px">Orçado no mês</div>
            <div style="font-size:18px;font-weight:700">${fmtMoeda(totalOrcadoMes)}</div>
          </div>
          <div class="stat-box accent-purple">
            <div class="text-muted" style="font-size:12px">Realizado no mês</div>
            <div style="font-size:18px;font-weight:700">${fmtMoeda(totalRealizadoMes)}</div>
          </div>
          <div class="stat-box accent-orange">
            <div class="text-muted" style="font-size:12px">Variação no mês</div>
            <div style="font-size:18px;font-weight:700">${fmtMoeda(variacaoMes.valor)} ${badgeVariacao(variacaoMes.pct)}</div>
          </div>
          <div class="stat-box accent-green">
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
      ` : '<div class="empty-state"><i class="ti ti-chart-bar"></i>Nenhum lançamento de orçado/realizado nesta competência ainda. Lance os valores editando cada conta (ícone do lápis).</div>'}
    </div>

    <div class="card">
      <div class="card-header">
        <span><i class="ti ti-list-details"></i> Contas Gerenciais</span>
        ${podeEditar ? '<button class="btn btn-primary btn-sm" id="btn-add-conta"><i class="ti ti-plus"></i> Nova conta</button>' : ''}
      </div>
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
              <th>Código</th><th>Nome da conta</th><th>Categoria</th><th>Área responsável</th>
              <th>Responsável pela análise</th><th>Meta mensal</th><th>Meta anual</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${contasFiltradas.map((c) => `
              <tr>
                <td><strong>${escapeHtml(c.codigo)}</strong></td>
                <td>${escapeHtml(c.nome)}</td>
                <td><span class="badge ${CATEGORIA_BADGE[c.categoria]}">${CATEGORIA_LABEL[c.categoria]}</span></td>
                <td>${escapeHtml(nomeDeptoPorId.get(c.departamento_id) || '—')}</td>
                <td>${escapeHtml(nomeMembroPorId.get(c.responsavel_analise_id) || '—')}</td>
                <td>${fmtMoeda(c.meta_mensal)}</td>
                <td>${fmtMoeda(c.meta_anual)}</td>
                <td><span class="badge ${c.ativo ? 'badge-success' : 'badge-danger'}">${c.ativo ? 'Ativo' : 'Inativo'}</span></td>
                <td class="table-actions">
                  <button class="icon-btn" data-detalhes="${c.id}" title="Visualizar: análises, gráficos, anexos e planos de ação"><i class="ti ti-eye"></i></button>
                  ${podeEditar ? `
                    <button class="icon-btn" data-editar="${c.id}" title="Editar conta e lançar valores"><i class="ti ti-pencil"></i></button>
                    <button class="icon-btn" data-excluir="${c.id}" title="Excluir"><i class="ti ti-trash"></i></button>
                  ` : ''}
                </td>
              </tr>
            `).join('')}
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

  const inputCompetenciaAtiva = container.querySelector('#competencia-ativa');
  if (inputCompetenciaAtiva) inputCompetenciaAtiva.addEventListener('change', (e) => {
    if (!e.target.value) return;
    competenciaAtiva = e.target.value;
    render(container, state);
  });

  const btnConfigRol = container.querySelector('#btn-config-rol');
  if (btnConfigRol) btnConfigRol.addEventListener('click', () => abrirConfigRol(state));

  const btnAdd = container.querySelector('#btn-add-conta');
  if (btnAdd) btnAdd.addEventListener('click', () => abrirFormulario(state, container, departamentos, membros));

  container.querySelectorAll('[data-detalhes]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const conta = contas.find((c) => c.id === btn.dataset.detalhes);
      abrirDetalheConta(state, container, conta, membros);
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

// ---------- Formulário de conta gerencial (ícone do lápis / "Nova conta") ----------
// Também é onde se edita o Histórico Anual e se lançam/editam os valores mensais — a edição de
// dados vive aqui; o botão de visualização (pasta) só mostra análise e os gráficos resultantes.
async function abrirFormulario(state, container, departamentos, membros, conta = null) {
  const { supabase, empresaAtual, user } = state;

  let lancamentos = [];
  if (conta) {
    try {
      const { data, error } = await supabase.from('contas_lancamentos_mensais').select('*').eq('conta_id', conta.id);
      if (error) throw error;
      lancamentos = data || [];
    } catch (err) {
      return toast('Erro ao carregar lançamentos mensais: ' + err.message, 'erro');
    }
  }

  const anoAtual = new Date().getFullYear();
  const anosHistorico = [anoAtual - 3, anoAtual - 2, anoAtual - 1];
  const historicoAnual = conta?.historico_anual || {};

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
          <input type="text" inputmode="decimal" id="cg-meta-mensal" placeholder="R$ 0,00" value="${valorInicialMascarado(conta?.meta_mensal)}">
        </div>
        <div class="form-group">
          <label>Meta anual (R$)</label>
          <input type="text" inputmode="decimal" id="cg-meta-anual" placeholder="R$ 0,00" value="${valorInicialMascarado(conta?.meta_anual)}">
        </div>
      </div>

      ${conta ? `
      <hr class="sep">
      <label style="font-size:13px;font-weight:600">Histórico Anual</label>
      <table class="table" style="margin-bottom:0.5rem">
        <thead><tr><th>Ano</th><th>Orçado (R$)</th><th>Realizado (R$)</th></tr></thead>
        <tbody>
          ${anosHistorico.map((ano) => `
            <tr>
              <td><strong>${ano}</strong></td>
              <td><input type="text" inputmode="decimal" id="cg-hist-orcado-${ano}" placeholder="R$ 0,00" value="${valorInicialMascarado(historicoAnual[ano]?.orcado)}" style="width:140px"></td>
              <td><input type="text" inputmode="decimal" id="cg-hist-realizado-${ano}" placeholder="R$ 0,00" value="${valorInicialMascarado(historicoAnual[ano]?.realizado)}" style="width:140px"></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="text-muted" style="font-size:12px;margin-bottom:1rem">Usado no gráfico "Histórico Anual" desta conta. Salvo junto com o botão abaixo.</p>
      ` : ''}

      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>

    ${conta ? `
    <hr class="sep">
    <label style="font-size:13px;font-weight:600">Lançamentos Mensais</label>
    <form id="form-lancamento-mensal-edicao" style="margin:0.75rem 0 1rem">
      <div class="form-row">
        <div class="form-group">
          <label>Competência</label>
          <input type="month" id="lm2-competencia" required value="${new Date().toISOString().slice(0, 7)}">
        </div>
        <div class="form-group">
          <label>Orçado (R$)</label>
          <input type="text" inputmode="decimal" id="lm2-orcado" placeholder="R$ 0,00">
        </div>
        <div class="form-group">
          <label>Realizado (R$)</label>
          <input type="text" inputmode="decimal" id="lm2-realizado" placeholder="R$ 0,00">
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" type="submit"><i class="ti ti-device-floppy"></i> Salvar mês</button>
      <span class="text-muted" style="font-size:12px;margin-left:8px">Lançar numa competência que já existe atualiza o valor.</span>
    </form>
    <div id="cg-lancamentos-tabela"></div>
    ` : '<p class="text-muted" style="margin-top:1rem"><i class="ti ti-info-circle"></i> Salve a conta primeiro; reabra a edição pelo ícone do lápis para lançar o histórico anual e os valores mensais.</p>'}
  `);
  modal.classList.add('modal-xl');

  aplicarMascaraMoeda(modal.querySelector('#cg-meta-mensal'));
  aplicarMascaraMoeda(modal.querySelector('#cg-meta-anual'));
  if (conta) {
    anosHistorico.forEach((ano) => {
      aplicarMascaraMoeda(modal.querySelector(`#cg-hist-orcado-${ano}`));
      aplicarMascaraMoeda(modal.querySelector(`#cg-hist-realizado-${ano}`));
    });
    aplicarMascaraMoeda(modal.querySelector('#lm2-orcado'));
    aplicarMascaraMoeda(modal.querySelector('#lm2-realizado'));
  }

  modal.querySelector('#form-conta-gerencial').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      empresa_id: empresaAtual.id,
      codigo: modal.querySelector('#cg-codigo').value.trim(),
      nome: modal.querySelector('#cg-nome').value.trim(),
      categoria: modal.querySelector('#cg-categoria').value,
      departamento_id: modal.querySelector('#cg-departamento').value || null,
      responsavel_analise_id: modal.querySelector('#cg-responsavel').value || null,
      meta_mensal: moedaParaNumero(modal.querySelector('#cg-meta-mensal').value),
      meta_anual: moedaParaNumero(modal.querySelector('#cg-meta-anual').value),
      ativo: modal.querySelector('#cg-ativo').value === 'true',
    };
    if (conta) {
      const historico = {};
      anosHistorico.forEach((ano) => {
        const orcado = moedaParaNumero(modal.querySelector(`#cg-hist-orcado-${ano}`).value);
        const realizado = moedaParaNumero(modal.querySelector(`#cg-hist-realizado-${ano}`).value);
        if (orcado !== null || realizado !== null) {
          historico[ano] = { orcado, realizado };
        }
      });
      payload.historico_anual = historico;
    }
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

  if (!conta) return;

  const renderTabelaLancamentos = () => {
    const area = modal.querySelector('#cg-lancamentos-tabela');
    const ordenado = [...lancamentos].sort((a, b) => b.competencia.localeCompare(a.competencia));
    area.innerHTML = ordenado.length ? `
      <table class="table">
        <thead><tr><th>Competência</th><th>Orçado</th><th>Realizado</th><th>Variação</th><th></th></tr></thead>
        <tbody>
          ${ordenado.map((l) => {
            const v = calcVariacao(l.valor_orcado == null ? null : Number(l.valor_orcado), l.valor_realizado == null ? null : Number(l.valor_realizado));
            return `
            <tr>
              <td>${fmtCompetencia(l.competencia)}</td>
              <td>${fmtMoeda(l.valor_orcado)}</td>
              <td>${fmtMoeda(l.valor_realizado)}</td>
              <td>${fmtMoeda(v.valor)} ${badgeVariacao(v.pct)}</td>
              <td class="table-actions">
                <button class="icon-btn" data-editar-lancamento-edicao="${l.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                <button class="icon-btn" data-excluir-lancamento-edicao="${l.id}" title="Excluir"><i class="ti ti-trash"></i></button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : '<div class="empty-state"><i class="ti ti-chart-bar"></i>Nenhum lançamento mensal registrado ainda.</div>';

    area.querySelectorAll('[data-editar-lancamento-edicao]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const l = lancamentos.find((x) => x.id === btn.dataset.editarLancamentoEdicao);
        modal.querySelector('#lm2-competencia').value = l.competencia.slice(0, 7);
        modal.querySelector('#lm2-orcado').value = valorInicialMascarado(l.valor_orcado);
        modal.querySelector('#lm2-realizado').value = valorInicialMascarado(l.valor_realizado);
      });
    });
    area.querySelectorAll('[data-excluir-lancamento-edicao]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmar('Excluir este lançamento?'))) return;
        const { error } = await supabase.from('contas_lancamentos_mensais').delete().eq('id', btn.dataset.excluirLancamentoEdicao);
        if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
        lancamentos = lancamentos.filter((x) => x.id !== btn.dataset.excluirLancamentoEdicao);
        toast('Lançamento excluído.', 'sucesso');
        renderTabelaLancamentos();
      });
    });
  };
  renderTabelaLancamentos();

  modal.querySelector('#form-lancamento-mensal-edicao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payloadLm = {
      empresa_id: empresaAtual.id,
      conta_id: conta.id,
      competencia: modal.querySelector('#lm2-competencia').value + '-01',
      valor_orcado: moedaParaNumero(modal.querySelector('#lm2-orcado').value),
      valor_realizado: moedaParaNumero(modal.querySelector('#lm2-realizado').value),
      usuario_id: user.id,
    };
    const { data: novo, error } = await supabase.from('contas_lancamentos_mensais').upsert(payloadLm, { onConflict: 'conta_id,competencia' }).select().single();
    if (error) return toast('Erro ao salvar lançamento: ' + error.message, 'erro');
    toast('Lançamento salvo.', 'sucesso');
    const idx = lancamentos.findIndex((l) => l.competencia === novo.competencia);
    if (idx >= 0) lancamentos[idx] = novo; else lancamentos.push(novo);
    renderTabelaLancamentos();
  });
}

// ---------- Configuração da ROL (Receita Operacional Líquida) da empresa ----------
// Dado único por empresa (não por conta), usado como denominador do gráfico "% sobre a ROL" de
// todas as contas. Só quem tem nível 'total' em controladoria edita (RLS já garante isso).
async function abrirConfigRol(state) {
  const { supabase, empresaAtual, user } = state;

  let historico, mensal;
  try {
    const [resHist, resMensal] = await Promise.all([
      supabase.from('empresa_rol_historico_anual').select('*').eq('empresa_id', empresaAtual.id),
      supabase.from('empresa_rol_mensal').select('*').eq('empresa_id', empresaAtual.id),
    ]);
    if (resHist.error) throw resHist.error;
    if (resMensal.error) throw resMensal.error;
    historico = resHist.data || [];
    mensal = resMensal.data || [];
  } catch (err) {
    return toast('Erro ao carregar ROL: ' + err.message, 'erro');
  }

  const anoAtual = new Date().getFullYear();
  const anosHistorico = [anoAtual - 3, anoAtual - 2, anoAtual - 1];
  const historicoPorAno = new Map(historico.map((h) => [h.ano, h]));

  const modal = abrirModal('Receita (ROL) da empresa', `
    <p class="text-muted" style="font-size:12px;margin-bottom:1rem">Usada para calcular o gráfico "% sobre a ROL" de cada conta gerencial.</p>
    <form id="form-rol-historico" style="margin-bottom:1.5rem">
      <label style="font-size:13px;font-weight:600">Histórico Anual</label>
      <table class="table" style="margin:0.5rem 0">
        <thead><tr><th>Ano</th><th>Orçado (R$)</th><th>Realizado (R$)</th></tr></thead>
        <tbody>
          ${anosHistorico.map((ano) => `
            <tr>
              <td><strong>${ano}</strong></td>
              <td><input type="text" inputmode="decimal" id="rol-hist-orcado-${ano}" placeholder="R$ 0,00" value="${valorInicialMascarado(historicoPorAno.get(ano)?.valor_orcado)}" style="width:160px"></td>
              <td><input type="text" inputmode="decimal" id="rol-hist-realizado-${ano}" placeholder="R$ 0,00" value="${valorInicialMascarado(historicoPorAno.get(ano)?.valor_realizado)}" style="width:160px"></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <button class="btn btn-primary btn-sm" type="submit"><i class="ti ti-device-floppy"></i> Salvar histórico anual</button>
    </form>
    <hr class="sep">
    <label style="font-size:13px;font-weight:600">Lançamento mensal (${anoAtual} em diante)</label>
    <form id="form-rol-mensal" style="margin:0.75rem 0 1rem">
      <div class="form-row">
        <div class="form-group"><label>Competência</label><input type="month" id="rol-m-competencia" required value="${new Date().toISOString().slice(0, 7)}"></div>
        <div class="form-group"><label>Orçado (R$)</label><input type="text" inputmode="decimal" id="rol-m-orcado" placeholder="R$ 0,00"></div>
        <div class="form-group"><label>Realizado (R$)</label><input type="text" inputmode="decimal" id="rol-m-realizado" placeholder="R$ 0,00"></div>
      </div>
      <button class="btn btn-primary btn-sm" type="submit"><i class="ti ti-plus"></i> Salvar mês</button>
    </form>
    <div id="rol-mensal-tabela"></div>
  `);
  modal.classList.add('modal-xl');

  anosHistorico.forEach((ano) => {
    aplicarMascaraMoeda(modal.querySelector(`#rol-hist-orcado-${ano}`));
    aplicarMascaraMoeda(modal.querySelector(`#rol-hist-realizado-${ano}`));
  });
  aplicarMascaraMoeda(modal.querySelector('#rol-m-orcado'));
  aplicarMascaraMoeda(modal.querySelector('#rol-m-realizado'));

  const renderTabelaMensal = () => {
    const area = modal.querySelector('#rol-mensal-tabela');
    const ordenado = [...mensal].sort((a, b) => b.competencia.localeCompare(a.competencia));
    area.innerHTML = ordenado.length ? `
      <table class="table">
        <thead><tr><th>Competência</th><th>Orçado</th><th>Realizado</th><th></th></tr></thead>
        <tbody>
          ${ordenado.map((m) => `
            <tr>
              <td>${fmtCompetencia(m.competencia)}</td>
              <td>${fmtMoeda(m.valor_orcado)}</td>
              <td>${fmtMoeda(m.valor_realizado)}</td>
              <td class="table-actions">
                <button class="icon-btn" data-editar-rol-mensal="${m.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                <button class="icon-btn" data-excluir-rol-mensal="${m.id}" title="Excluir"><i class="ti ti-trash"></i></button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>` : '<div class="empty-state"><i class="ti ti-report-money"></i>Nenhum mês lançado ainda.</div>';

    area.querySelectorAll('[data-editar-rol-mensal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = mensal.find((x) => x.id === btn.dataset.editarRolMensal);
        modal.querySelector('#rol-m-competencia').value = m.competencia.slice(0, 7);
        modal.querySelector('#rol-m-orcado').value = valorInicialMascarado(m.valor_orcado);
        modal.querySelector('#rol-m-realizado').value = valorInicialMascarado(m.valor_realizado);
      });
    });
    area.querySelectorAll('[data-excluir-rol-mensal]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmar('Excluir este mês da ROL?'))) return;
        const { error } = await supabase.from('empresa_rol_mensal').delete().eq('id', btn.dataset.excluirRolMensal);
        if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
        mensal = mensal.filter((x) => x.id !== btn.dataset.excluirRolMensal);
        toast('Excluído.', 'sucesso');
        renderTabelaMensal();
      });
    });
  };
  renderTabelaMensal();

  modal.querySelector('#form-rol-historico').addEventListener('submit', async (e) => {
    e.preventDefault();
    const linhas = anosHistorico.map((ano) => ({
      empresa_id: empresaAtual.id,
      ano,
      valor_orcado: moedaParaNumero(modal.querySelector(`#rol-hist-orcado-${ano}`).value),
      valor_realizado: moedaParaNumero(modal.querySelector(`#rol-hist-realizado-${ano}`).value),
      usuario_id: user.id,
    }));
    const { error } = await supabase.from('empresa_rol_historico_anual').upsert(linhas, { onConflict: 'empresa_id,ano' });
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    toast('Histórico anual da ROL salvo.', 'sucesso');
  });

  modal.querySelector('#form-rol-mensal').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      empresa_id: empresaAtual.id,
      competencia: modal.querySelector('#rol-m-competencia').value + '-01',
      valor_orcado: moedaParaNumero(modal.querySelector('#rol-m-orcado').value),
      valor_realizado: moedaParaNumero(modal.querySelector('#rol-m-realizado').value),
      usuario_id: user.id,
    };
    const { data: novo, error } = await supabase.from('empresa_rol_mensal').upsert(payload, { onConflict: 'empresa_id,competencia' }).select().single();
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    toast('Mês salvo.', 'sucesso');
    const idx = mensal.findIndex((m) => m.competencia === novo.competencia);
    if (idx >= 0) mensal[idx] = novo; else mensal.push(novo);
    renderTabelaMensal();
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

  // Os gráficos que estão na tela viram imagem no impresso. Antes o relatório saía só com tabelas:
  // quem imprimia perdia justamente a leitura visual (tendência anual, curva do mês, % sobre a ROL)
  // que é o motivo de existir a tela. Só entram os que realmente foram desenhados — conta sem
  // histórico, ou usuário sem permissão de ver a ROL, simplesmente não gera aquele bloco.
  const graficoImg = (chart, titulo, largo = false) => {
    if (!chart) return '';
    return `
      <div class="print-grafico${largo ? ' print-grafico-largo' : ''}">
        <div class="print-grafico-titulo">${titulo}</div>
        <img src="${chart.toBase64Image('image/png', 1)}" alt="${titulo}">
      </div>`;
  };
  const blocosGraficos = [
    graficoImg(graficosConta.historico, 'Histórico Anual'),
    graficoImg(graficosConta.mensal, `Mensal ${new Date().getFullYear()}`),
    graficoImg(graficosConta.rol, '% sobre a ROL', true),
  ].join('');

  imprimirSecao(`
    <h2 style="margin-bottom:4px">${escapeHtml(conta.codigo)} — ${escapeHtml(conta.nome)}</h2>
    <p class="text-muted">Controladoria — Conta Gerencial</p>
    <hr class="sep">
    ${blocosGraficos ? `<div class="print-graficos">${blocosGraficos}</div>` : ''}
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

// ---------- DETALHE DA CONTA (ícone da pasta): análises periódicas (com os 3 gráficos) + anexos + planos de ação ----------
// Data-entry vive no formulário de edição (ícone do lápis) — aqui é só visualização.
let abaDetalheAtiva = 'analises';
// Guardados por nome (e não numa lista) porque a impressão precisa pegar cada gráfico específico —
// e porque, quando uma conta não tem histórico ou não tem ROL, o gráfico correspondente nem existe.
let graficosConta = {};

function destruirGraficosConta() {
  Object.values(graficosConta).forEach((c) => c.destroy());
  graficosConta = {};
}

// Mesmo padrão visual da Apresentação de Indicador (tela cheia, título grande, cartões de
// destaque, gráfico) — usa apresentacao-overlay diretamente em vez do sistema de modal.
async function abrirDetalheConta(state, containerPai, conta, membros, abaInicial = 'analises') {
  abaDetalheAtiva = abaInicial;
  const overlay = document.createElement('div');
  overlay.className = 'apresentacao-overlay apresentacao-overlay-fixo';
  overlay.innerHTML = `
    <button class="apresentacao-fechar" id="detalhe-conta-fechar" title="Fechar"><i class="ti ti-x"></i></button>
    <div class="apresentacao-conteudo" id="detalhe-conta-corpo">Carregando...</div>
  `;
  document.body.appendChild(overlay);

  const fechar = () => { overlay.remove(); document.removeEventListener('keydown', onEsc); destruirGraficosConta(); };
  overlay.querySelector('#detalhe-conta-fechar').addEventListener('click', fechar);
  const onEsc = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', onEsc);

  await renderDetalheConta(state, containerPai, overlay, conta, membros);
}

async function renderDetalheConta(state, containerPai, modal, conta, membros) {
  const { supabase, empresaAtual } = state;
  const corpo = modal.querySelector('#detalhe-conta-corpo');
  const podeVerRol = resolverNivel(state, 'controladoria', 'rol') !== 'sem_acesso';

  let analises, anexos, lancamentosConta, rolMensal, rolHistorico;
  try {
    const [resAnalises, resAnexos, resLancamentos, resRolMensal, resRolHistorico] = await Promise.all([
      supabase.from('contas_analises').select('*').eq('conta_id', conta.id).order('competencia', { ascending: false }),
      supabase.from('contas_anexos').select('*').eq('conta_id', conta.id).order('created_at', { ascending: false }),
      supabase.from('contas_lancamentos_mensais').select('*').eq('conta_id', conta.id),
      podeVerRol ? supabase.from('empresa_rol_mensal').select('*').eq('empresa_id', empresaAtual.id) : Promise.resolve({ data: [] }),
      podeVerRol ? supabase.from('empresa_rol_historico_anual').select('*').eq('empresa_id', empresaAtual.id) : Promise.resolve({ data: [] }),
    ]);
    if (resAnalises.error) throw resAnalises.error;
    if (resAnexos.error) throw resAnexos.error;
    if (resLancamentos.error) throw resLancamentos.error;
    if (resRolMensal.error) throw resRolMensal.error;
    if (resRolHistorico.error) throw resRolHistorico.error;
    analises = resAnalises.data || [];
    anexos = resAnexos.data || [];
    lancamentosConta = resLancamentos.data || [];
    rolMensal = resRolMensal.data || [];
    rolHistorico = resRolHistorico.data || [];
  } catch (err) {
    corpo.innerHTML = `<div class="alert alert-warning">Erro ao carregar: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const nomeMembroPorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));
  const anoAtual = new Date().getFullYear();

  const cronologico = [...lancamentosConta].sort((a, b) => b.competencia.localeCompare(a.competencia));
  const ultimoLancamento = cronologico[0] || null;

  const dadosGraficos = construirDadosGraficosConta(conta, lancamentosConta, rolMensal, rolHistorico);
  const temHistorico = dadosGraficos.historico.orcado.some((v) => v != null) || dadosGraficos.historico.realizado.some((v) => v != null);
  const temMensal = dadosGraficos.mensal.orcado.some((v) => v != null) || dadosGraficos.mensal.realizado.some((v) => v != null);
  const temRol = dadosGraficos.rol.labels.length > 0;

  corpo.innerHTML = `
    <div class="detalhe-conta-topo">
      <h1>${escapeHtml(conta.codigo)} — ${escapeHtml(conta.nome)}</h1>
      <p class="apresentacao-subtitulo">${CATEGORIA_LABEL[conta.categoria]} · ${conta.ativo ? 'Ativo' : 'Inativo'} · Responsável: ${escapeHtml(nomeMembroPorId.get(conta.responsavel_analise_id) || '—')}</p>

      <div class="apresentacao-meta-row">
        <div class="apresentacao-meta-item"><span>Orçado</span><strong>${fmtMoeda(ultimoLancamento?.valor_orcado)}</strong></div>
        <div class="apresentacao-meta-item"><span>Realizado</span><strong>${fmtMoeda(ultimoLancamento?.valor_realizado)}</strong></div>
        <div class="apresentacao-meta-item"><span>Período</span><strong>${ultimoLancamento ? fmtCompetencia(ultimoLancamento.competencia) : '—'}</strong></div>
      </div>

      <div class="apresentacao-grafico-box">
        <div class="conta-graficos">
          <div>
            <p class="conta-grafico-titulo">Histórico Anual</p>
            ${temHistorico ? '<div class="conta-grafico-area"><canvas id="grafico-historico-anual"></canvas></div>' : '<div class="empty-state conta-grafico-vazio"><i class="ti ti-chart-bar"></i>Sem histórico anual lançado (edite a conta pelo lápis).</div>'}
          </div>
          <div>
            <p class="conta-grafico-titulo">Mensal ${anoAtual}</p>
            ${temMensal ? '<div class="conta-grafico-area"><canvas id="grafico-mensal"></canvas></div>' : '<div class="empty-state conta-grafico-vazio"><i class="ti ti-chart-bar"></i>Sem lançamentos mensais este ano (edite a conta pelo lápis).</div>'}
          </div>
          <div class="conta-grafico-largo">
            <p class="conta-grafico-titulo">% sobre a ROL</p>
            ${!podeVerRol ? '<div class="empty-state conta-grafico-vazio"><i class="ti ti-lock"></i>Você não tem permissão para ver a ROL desta empresa.</div>'
              : temRol ? '<div class="conta-grafico-area"><canvas id="grafico-rol"></canvas></div>' : '<div class="empty-state conta-grafico-vazio"><i class="ti ti-chart-line"></i>Configure a ROL da empresa (botão no Resumo Consolidado) e o histórico/mensal desta conta.</div>'}
          </div>
        </div>
      </div>

      <div class="filters" style="margin-bottom:0;justify-content:space-between;display:flex;flex-wrap:wrap;gap:8px">
        <div class="filters" style="margin-bottom:0">
          <button class="filter-btn ${abaDetalheAtiva === 'analises' ? 'active' : ''}" data-aba-detalhe="analises"><i class="ti ti-notes"></i> Análises</button>
          <button class="filter-btn ${abaDetalheAtiva === 'anexos' ? 'active' : ''}" data-aba-detalhe="anexos"><i class="ti ti-paperclip"></i> Relatórios e gráficos enviados</button>
          <button class="filter-btn ${abaDetalheAtiva === 'planos' ? 'active' : ''}" data-aba-detalhe="planos"><i class="ti ti-clipboard-list"></i> Planos de Ação</button>
        </div>
        <button class="btn btn-secondary btn-sm" id="btn-imprimir-conta-detalhe"><i class="ti ti-printer"></i> Imprimir</button>
      </div>
    </div>
    <div class="detalhe-conta-scroll">
      <div id="detalhe-conta-aba"></div>
    </div>
  `;

  desenharGraficosConta(corpo, dadosGraficos);

  const btnImprimir = corpo.querySelector('#btn-imprimir-conta-detalhe');
  if (btnImprimir) btnImprimir.addEventListener('click', () => imprimirConta(state, conta));

  corpo.querySelectorAll('[data-aba-detalhe]').forEach((btn) => {
    btn.addEventListener('click', () => { abaDetalheAtiva = btn.dataset.abaDetalhe; renderDetalheConta(state, containerPai, modal, conta, membros); });
  });

  const areaAba = corpo.querySelector('#detalhe-conta-aba');
  if (abaDetalheAtiva === 'analises') {
    renderAbaAnalises(state, containerPai, modal, conta, membros, analises, nomeMembroPorId, areaAba);
  } else if (abaDetalheAtiva === 'anexos') {
    renderAbaAnexos(state, modal, conta, anexos, nomeMembroPorId, areaAba);
  } else {
    await renderAbaPlanos(state, conta, nomeMembroPorId, areaAba);
  }
}

// ---------- Monta os dados dos 3 gráficos (Histórico Anual, Mensal do ano corrente, % sobre a ROL) ----------
function construirDadosGraficosConta(conta, lancamentosConta, rolMensal, rolHistorico) {
  const anoAtual = new Date().getFullYear();
  const anosHistorico = [anoAtual - 3, anoAtual - 2, anoAtual - 1];
  const historicoAnual = conta.historico_anual || {};
  const rolHistPorAno = new Map(rolHistorico.map((r) => [r.ano, r]));

  const lancDoAnoAtual = lancamentosConta.filter((l) => l.competencia.slice(0, 4) === String(anoAtual));
  const lancPorMes = new Map(lancDoAnoAtual.map((l) => [l.competencia.slice(5, 7), l]));
  const somaAnoAtual = lancDoAnoAtual.reduce((acc, l) => {
    acc.orcado += Number(l.valor_orcado) || 0;
    acc.realizado += Number(l.valor_realizado) || 0;
    return acc;
  }, { orcado: 0, realizado: 0 });

  // ---- Histórico Anual ----
  const historicoLabels = [...anosHistorico.map(String), String(anoAtual)];
  const historicoOrcado = [...anosHistorico.map((a) => historicoAnual[a]?.orcado ?? null), lancDoAnoAtual.length ? somaAnoAtual.orcado : null];
  const historicoRealizado = [...anosHistorico.map((a) => historicoAnual[a]?.realizado ?? null), lancDoAnoAtual.length ? somaAnoAtual.realizado : null];

  // ---- Mensal (ano corrente) ----
  // Sem o sufixo do ano: o título do gráfico já diz "Mensal <ano>", e com "jan/26" em cada uma das
  // 12 colunas o Chart.js só conseguia mostrar metade dos rótulos. (O gráfico de % sobre a ROL
  // mantém o sufixo — lá os rótulos misturam anos fechados com meses do ano corrente.)
  const mensalLabels = [...MESES_LABEL];
  const mensalOrcado = MESES_LABEL.map((_, i) => {
    const l = lancPorMes.get(String(i + 1).padStart(2, '0'));
    return l?.valor_orcado ?? null;
  });
  const mensalRealizado = MESES_LABEL.map((_, i) => {
    const l = lancPorMes.get(String(i + 1).padStart(2, '0'));
    return l?.valor_realizado ?? null;
  });

  // ---- % sobre a ROL ----
  const rolLabels = [];
  const rolPctOrcado = [];
  const rolPctRealizado = [];
  anosHistorico.forEach((ano) => {
    const rolAno = rolHistPorAno.get(ano);
    const hist = historicoAnual[ano];
    if (!rolAno || !hist) return;
    rolLabels.push(String(ano));
    rolPctOrcado.push(rolAno.valor_orcado ? (hist.orcado / rolAno.valor_orcado) * 100 : null);
    rolPctRealizado.push(rolAno.valor_realizado ? (hist.realizado / rolAno.valor_realizado) * 100 : null);
  });
  const rolMensalPorCompetencia = new Map(rolMensal.map((r) => [r.competencia.slice(0, 7), r]));
  [...lancPorMes.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([mm, lanc]) => {
    const rolMes = rolMensalPorCompetencia.get(`${anoAtual}-${mm}`);
    if (!rolMes) return;
    rolLabels.push(`${MESES_LABEL[Number(mm) - 1]}/${String(anoAtual).slice(2)}`);
    rolPctOrcado.push(rolMes.valor_orcado ? (Number(lanc.valor_orcado || 0) / Number(rolMes.valor_orcado)) * 100 : null);
    rolPctRealizado.push(rolMes.valor_realizado ? (Number(lanc.valor_realizado || 0) / Number(rolMes.valor_realizado)) * 100 : null);
  });

  return {
    historico: { labels: historicoLabels, orcado: historicoOrcado, realizado: historicoRealizado },
    mensal: { labels: mensalLabels, orcado: mensalOrcado, realizado: mensalRealizado },
    rol: { labels: rolLabels, pctOrcado: rolPctOrcado, pctRealizado: rolPctRealizado },
  };
}

function desenharGraficosConta(areaAba, dados) {
  destruirGraficosConta();
  if (!window.Chart) return;

  const cores = coresGrafico();

  const canvasHistorico = areaAba.querySelector('#grafico-historico-anual');
  if (canvasHistorico) {
    graficosConta.historico = (new Chart(canvasHistorico, {
      type: 'bar',
      data: {
        labels: dados.historico.labels,
        datasets: [
          { label: 'Orçado', data: dados.historico.orcado, backgroundColor: cores.primariaTransparente },
          { label: 'Realizado', data: dados.historico.realizado, backgroundColor: cores.destaqueForte },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } },
    }));
  }

  const canvasMensal = areaAba.querySelector('#grafico-mensal');
  if (canvasMensal) {
    graficosConta.mensal = (new Chart(canvasMensal, {
      type: 'bar',
      data: {
        labels: dados.mensal.labels,
        datasets: [
          { label: 'Orçado', data: dados.mensal.orcado, backgroundColor: cores.primariaTransparente },
          { label: 'Realizado', data: dados.mensal.realizado, backgroundColor: cores.destaqueForte },
        ],
      },
      // maxRotation 0: com 12 meses o Chart.js virava os rótulos na diagonal para caber. Preferimos
      // que ele omita alguns rótulos (autoSkip) a deixar todos inclinados e difíceis de ler.
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { beginAtZero: true },
          x: { ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 4 } },
        },
      },
    }));
  }

  const canvasRol = areaAba.querySelector('#grafico-rol');
  if (canvasRol) {
    graficosConta.rol = (new Chart(canvasRol, {
      type: 'line',
      data: {
        labels: dados.rol.labels,
        datasets: [
          { label: '% ROL Orçado', data: dados.rol.pctOrcado, borderColor: cores.primaria, backgroundColor: 'transparent', tension: 0.25 },
          { label: '% ROL Realizado', data: dados.rol.pctRealizado, borderColor: cores.destaque, backgroundColor: 'transparent', tension: 0.25 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => `${v}%` } } } },
    }));
  }
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
    <div class="table-actions" style="margin-bottom:1.25rem">
      <button class="btn btn-secondary btn-sm" id="btn-criar-plano-direto"><i class="ti ti-clipboard-plus"></i> Criar Plano de Ação</button>
      <button class="btn btn-secondary btn-sm" id="btn-criar-tarefa-direto"><i class="ti ti-checkbox"></i> Criar Tarefa</button>
    </div>
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

  // Criar plano de ação/tarefa direto da conta, sem precisar ter uma análise registrada ainda.
  const btnCriarPlanoDireto = areaAba.querySelector('#btn-criar-plano-direto');
  if (btnCriarPlanoDireto) btnCriarPlanoDireto.addEventListener('click', () => {
    abrirFormularioPlanoDeAcaoDaAnalise(state, containerPai, conta, null, membros);
  });
  const btnCriarTarefaDireto = areaAba.querySelector('#btn-criar-tarefa-direto');
  if (btnCriarTarefaDireto) btnCriarTarefaDireto.addEventListener('click', () => {
    abrirFormularioTarefaDaAnalise(state, conta, null, membros);
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
  const modal = abrirModal(`Criar Plano de Ação — ${conta.codigo}`, `
    <form id="form-plano-da-analise">
      <div class="form-group">
        <label>Problema identificado</label>
        <textarea id="pda-problema" required placeholder="Ex: Custo com frete acima da meta mensal há 3 meses consecutivos">${escapeHtml(analise?.texto_analise || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Causa</label>
        <textarea id="pda-causa" placeholder="${analise?.justificativa_desvio ? '' : 'Causa raiz do desvio'}">${escapeHtml(analise?.justificativa_desvio || '')}</textarea>
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
          <input type="text" inputmode="decimal" id="pda-impacto" placeholder="R$ 0,00">
        </div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Criar Plano de Ação</button>
    </form>
  `);

  aplicarMascaraMoeda(modal.querySelector('#pda-impacto'));

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
      quanto_custa: moedaParaNumero(modal.querySelector('#pda-impacto').value),
      origem: 'conta_gerencial',
      origem_id: conta.id,
      analise_origem_id: analise?.id || null,
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
  const modal = abrirModal(`Criar Tarefa — ${conta.codigo}`, `
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
      competencia: analise?.competencia || null,
      analise_id: analise?.id || null,
    };
    const { error } = await supabase.from('todo_itens').insert(payload);
    if (error) return toast('Erro ao criar tarefa: ' + error.message, 'erro');
    toast('Tarefa criada — disponível no módulo Ações, aba Tarefas.', 'sucesso');
    fecharModal();
  });
}
