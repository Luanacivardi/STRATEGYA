import { abrirModal, fecharModal, toast, escapeHtml, confirmar, imprimirSecao } from '../ui.js';

const CATEGORIA_LABEL = { receita: 'Receita', custo: 'Custo', despesa: 'Despesa', investimento: 'Investimento' };
const CATEGORIA_BADGE = { receita: 'badge-success', custo: 'badge-warning', despesa: 'badge-danger', investimento: 'badge-neutral' };

const TIPO_ARQUIVO_LABEL = { pdf: 'PDF', excel: 'Excel', png: 'PNG', jpg: 'JPG', powerpoint: 'PowerPoint' };
const TIPO_ARQUIVO_ICONE = { pdf: 'ti-file-type-pdf', excel: 'ti-file-type-xls', png: 'ti-photo', jpg: 'ti-photo', powerpoint: 'ti-file-type-ppt' };
const EXT_PARA_TIPO = { pdf: 'pdf', xls: 'excel', xlsx: 'excel', png: 'png', jpg: 'jpg', jpeg: 'jpg', ppt: 'powerpoint', pptx: 'powerpoint' };
const PRIORIDADE_LABEL = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };

const fmtCompetencia = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' }) : '—';
const fmtData = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';

const fmtMoeda = (v) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

let filtroCategoria = 'todas';
let filtroStatus = 'ativo';

export async function render(container, state) {
  const { supabase, empresaAtual, papelAtual } = state;
  const podeEditar = papelAtual !== 'usuario';

  let contas, departamentos, membros;
  try {
    [contas, departamentos, membros] = await Promise.all([
      supabase.from('contas_gerenciais').select('*').eq('empresa_id', empresaAtual.id),
      supabase.from('departamentos').select('*').eq('empresa_id', empresaAtual.id).order('nome').then((r) => { if (r.error) throw r.error; return r.data || []; }),
      supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }).then((r) => { if (r.error) throw r.error; return r.data || []; }),
    ]);
    if (contas.error) throw contas.error;
    contas = [...contas.data].sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar contas gerenciais: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const nomeDeptoPorId = new Map(departamentos.map((d) => [d.id, d.nome]));
  const nomeMembroPorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));

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
                  <button class="icon-btn" data-detalhes="${c.id}" title="Análises e anexos"><i class="ti ti-folder-open"></i></button>
                  <button class="icon-btn" data-imprimir-conta="${c.id}" title="Imprimir (último gráfico + análises)"><i class="ti ti-printer"></i></button>
                  ${podeEditar ? `
                    <button class="icon-btn" data-editar="${c.id}" title="Editar"><i class="ti ti-pencil"></i></button>
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

// ---------- Imprimir conta: dados gerais + último gráfico/relatório enviado + análises de todos os meses ----------
async function imprimirConta(state, conta) {
  const { supabase, empresaAtual } = state;

  let departamento, membros, analises, anexos;
  try {
    const [resDepto, membrosData, resAnalises, resAnexos] = await Promise.all([
      conta.departamento_id ? supabase.from('departamentos').select('nome').eq('id', conta.departamento_id).single() : Promise.resolve({ data: null }),
      supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }).then((r) => r.data || []),
      supabase.from('contas_analises').select('*').eq('conta_id', conta.id).order('competencia', { ascending: true }),
      supabase.from('contas_anexos').select('*').eq('conta_id', conta.id).order('created_at', { ascending: false }),
    ]);
    departamento = resDepto.data;
    membros = membrosData;
    if (resAnalises.error) throw resAnalises.error;
    if (resAnexos.error) throw resAnexos.error;
    analises = resAnalises.data || [];
    anexos = resAnexos.data || [];
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
  `);
}

// ---------- DETALHE DA CONTA: análises periódicas + anexos (relatórios/gráficos) ----------
let abaDetalheAtiva = 'analises';

async function abrirDetalheConta(state, containerPai, conta, membros, abaInicial = 'analises') {
  abaDetalheAtiva = abaInicial;
  const modal = abrirModal(`${conta.codigo} — ${conta.nome}`, '<div id="detalhe-conta-corpo">Carregando...</div>');
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
        <button class="filter-btn ${abaDetalheAtiva === 'analises' ? 'active' : ''}" data-aba-detalhe="analises"><i class="ti ti-notes"></i> Análises periódicas</button>
        <button class="filter-btn ${abaDetalheAtiva === 'anexos' ? 'active' : ''}" data-aba-detalhe="anexos"><i class="ti ti-paperclip"></i> Relatórios e gráficos</button>
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
  if (abaDetalheAtiva === 'analises') {
    renderAbaAnalises(state, containerPai, modal, conta, membros, analises, nomeMembroPorId, areaAba);
  } else {
    renderAbaAnexos(state, modal, conta, anexos, nomeMembroPorId, areaAba);
  }
}

function renderAbaAnalises(state, containerPai, modal, conta, membros, analises, nomeMembroPorId, areaAba) {
  const { supabase, empresaAtual, user } = state;

  areaAba.innerHTML = `
    <form id="form-nova-analise" style="margin-bottom:1.25rem">
      <div class="form-row">
        <div class="form-group">
          <label>Competência</label>
          <input type="month" id="an-competencia" required value="${new Date().toISOString().slice(0, 7)}">
        </div>
      </div>
      <div class="form-group">
        <label>Análise</label>
        <textarea id="an-texto" required placeholder="O que os dados do Power BI mostraram para esta conta neste período?"></textarea>
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
        <div class="table-actions" style="margin-top:8px">
          <button class="btn btn-secondary btn-sm" data-criar-plano="${a.id}"><i class="ti ti-clipboard-plus"></i> Criar Plano de Ação</button>
          <button class="btn btn-secondary btn-sm" data-criar-tarefa="${a.id}"><i class="ti ti-checkbox"></i> Criar Tarefa</button>
        </div>
      </div>
    `).join('') : '<div class="empty-state"><i class="ti ti-notes"></i>Nenhuma análise registrada ainda.</div>'}
  `;

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
}

function renderAbaAnexos(state, modal, conta, anexos, nomeMembroPorId, areaAba) {
  const { supabase, empresaAtual, user } = state;

  areaAba.innerHTML = `
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
                <button class="icon-btn" data-excluir-anexo="${a.id}" title="Excluir"><i class="ti ti-trash"></i></button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>` : '<div class="empty-state"><i class="ti ti-paperclip"></i>Nenhum arquivo enviado ainda.</div>'}
  `;

  areaAba.querySelector('#form-novo-anexo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const arquivo = areaAba.querySelector('#ax-arquivo').files[0];
    const competencia = areaAba.querySelector('#ax-competencia').value + '-01';
    const ext = arquivo.name.split('.').pop().toLowerCase();
    const tipo = EXT_PARA_TIPO[ext];
    if (!tipo) return toast('Tipo de arquivo não permitido. Use PDF, Excel, PNG, JPG ou PowerPoint.', 'erro');

    const btnSubmit = areaAba.querySelector('#form-novo-anexo button[type="submit"]');
    btnSubmit.disabled = true;

    const nomeSanitizado = arquivo.name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
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

        <div id="av-lista-analises" style="margin-top:1.5rem">
          ${renderListaAnalisesAnexo(analises, nomeMembroPorId)}
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
  chkDesvio.addEventListener('change', (e) => {
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
  };
  wireAcoesAnalise();

  overlay.querySelector('#av-salvar-analise').addEventListener('click', async () => {
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
    overlay.querySelector('#av-lista-analises').innerHTML = renderListaAnalisesAnexo(analises, nomeMembroPorId);
    wireAcoesAnalise();
  });
}

function renderListaAnalisesAnexo(analises, nomeMembroPorId) {
  if (!analises.length) return '<div class="empty-state"><i class="ti ti-notes"></i>Nenhuma análise registrada para este arquivo ainda.</div>';
  return analises.map((a) => `
    <div class="card" style="padding:12px;margin-bottom:10px">
      <div class="text-muted" style="font-size:12px">${escapeHtml(nomeMembroPorId.get(a.usuario_id) || '—')} · ${fmtData(a.created_at)}
        ${a.houve_desvio ? '<span class="badge badge-danger" style="margin-left:6px">Desvio</span>' : ''}
      </div>
      <p style="margin:8px 0 4px">${escapeHtml(a.texto_analise)}</p>
      ${a.houve_desvio && a.justificativa_desvio ? `<p class="text-muted" style="font-size:13px"><strong>Justificativa:</strong> ${escapeHtml(a.justificativa_desvio)}</p>` : ''}
      <div class="table-actions" style="margin-top:8px">
        <button class="btn btn-secondary btn-sm" data-criar-plano-anexo="${a.id}"><i class="ti ti-clipboard-plus"></i> Criar Plano de Ação</button>
        <button class="btn btn-secondary btn-sm" data-criar-tarefa-anexo="${a.id}"><i class="ti ti-checkbox"></i> Criar Tarefa</button>
      </div>
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
            <option value="baixa">Baixa</option>
            <option value="media" selected>Média</option>
            <option value="alta">Alta</option>
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
      competencia: analise.competencia,
      analise_id: analise.id,
    };
    const { error } = await supabase.from('todo_itens').insert(payload);
    if (error) return toast('Erro ao criar tarefa: ' + error.message, 'erro');
    toast('Tarefa criada — disponível no módulo Ações, aba Tarefas.', 'sucesso');
    fecharModal();
  });
}
