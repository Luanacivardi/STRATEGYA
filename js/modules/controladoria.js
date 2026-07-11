import { abrirModal, fecharModal, toast, escapeHtml, confirmar } from '../ui.js';

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

// ---------- DETALHE DA CONTA: análises periódicas + anexos (relatórios/gráficos) ----------
let abaDetalheAtiva = 'analises';

async function abrirDetalheConta(state, containerPai, conta, membros) {
  abaDetalheAtiva = 'analises';
  const modal = abrirModal(`${conta.codigo} — ${conta.nome}`, '<div id="detalhe-conta-corpo">Carregando...</div>');
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
    <div class="filters" style="margin-bottom:1rem">
      <button class="filter-btn ${abaDetalheAtiva === 'analises' ? 'active' : ''}" data-aba-detalhe="analises"><i class="ti ti-notes"></i> Análises periódicas</button>
      <button class="filter-btn ${abaDetalheAtiva === 'anexos' ? 'active' : ''}" data-aba-detalhe="anexos"><i class="ti ti-paperclip"></i> Relatórios e gráficos</button>
    </div>
    <div id="detalhe-conta-aba"></div>
  `;

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
                <button class="icon-btn" data-baixar-anexo="${a.id}" title="Abrir/baixar"><i class="ti ti-download"></i></button>
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
