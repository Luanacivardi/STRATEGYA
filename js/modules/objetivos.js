import { abrirModal, fecharModal, toast, escapeHtml, confirmar, imprimirSecao, podeEditarRegistro } from '../ui.js';
import { definirFiltroObjetivo } from './planosAcao.js';
import { renderMapa, wireMapa } from './mapaEstrategico.js';

// Chave interna 'clientes' mantida (não altera dados existentes) — só o rótulo exibido virou "Mercado".
export const PERSPECTIVAS = {
  financeira: 'Financeira',
  clientes: 'Mercado',
  processos_internos: 'Processos Internos',
  aprendizado_crescimento: 'Aprendizado e Crescimento',
};

export const STATUS = {
  nao_iniciado: 'Não iniciado',
  em_andamento: 'Em andamento',
  atingido: 'Atingido',
  atrasado: 'Atrasado',
};

// Categoria usada para identificar itens de Riscos e Oportunidades criados a partir da análise
// feita no formulário do objetivo (permite editar/remover a análise sem tocar em itens manuais).
const CATEGORIA_ANALISE_OBJETIVO = 'Análise do objetivo';

export async function listarObjetivos(supabase, empresaId) {
  const { data, error } = await supabase
    .from('objetivos_estrategicos')
    .select('*')
    .eq('empresa_id', empresaId);
  if (error) throw error;
  return [...data].sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function render(container, state) {
  const { supabase, empresaAtual, papelAtual } = state;
  const podeEditar = papelAtual !== 'usuario' || state.nivelEdicao === 'total';
  // Nível "próprio": não edita tudo, mas pode criar um objetivo novo (sempre com ela mesma como
  // responsável) e editar/excluir os objetivos em que já é a responsável.
  const podeCriar = podeEditar || state.nivelEdicao === 'proprio';

  let itens, membros, planos, riscos;
  try {
    [itens, membros, planos, riscos] = await Promise.all([
      listarObjetivos(supabase, empresaAtual.id),
      supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }).then((r) => r.data || []),
      supabase.from('planos_acao').select('id, origem_id').eq('empresa_id', empresaAtual.id).eq('origem', 'objetivo').then((r) => r.data || []),
      supabase.from('riscos_oportunidades').select('id, tipo, descricao, categoria, objetivo_id').eq('empresa_id', empresaAtual.id).not('objetivo_id', 'is', null).then((r) => r.data || []),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar objetivos: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const emailPorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));
  const planosPorObjetivo = new Map();
  planos.forEach((p) => planosPorObjetivo.set(p.origem_id, (planosPorObjetivo.get(p.origem_id) || 0) + 1));
  const riscosPorObjetivo = new Map();
  riscos.forEach((r) => {
    if (!riscosPorObjetivo.has(r.objetivo_id)) riscosPorObjetivo.set(r.objetivo_id, []);
    riscosPorObjetivo.get(r.objetivo_id).push(r);
  });

  const selecionados = new Set(); // ids marcados para impressão em massa

  function objetivosFiltrados() {
    const respFiltro = container.querySelector('#ob-filtro-responsavel')?.value || '';
    const statusFiltro = container.querySelector('#ob-filtro-status')?.value || '';
    return itens.filter((o) => {
      if (respFiltro && o.responsavel_id !== respFiltro) return false;
      if (statusFiltro && o.status !== statusFiltro) return false;
      return true;
    });
  }

  // Imprime a seleção quando houver algo marcado; senão, imprime tudo que está filtrado na tela.
  function objetivosAlvoImpressao() {
    if (selecionados.size) return itens.filter((o) => selecionados.has(o.id));
    return objetivosFiltrados();
  }

  function atualizarBotaoImprimir() {
    const btn = container.querySelector('#btn-objetivos-pdf');
    if (btn) btn.innerHTML = `<i class="ti ti-printer"></i> Imprimir (${objetivosAlvoImpressao().length})`;
  }

  function renderTabela() {
    const filtrados = objetivosFiltrados();
    const area = container.querySelector('#objetivos-tabela-area');
    area.innerHTML = filtrados.length ? `
        <table class="table">
          <thead><tr><th><input type="checkbox" id="ob-selecionar-todas"></th><th>Objetivo</th><th>Perspectiva</th><th>Responsável</th><th>Status</th><th>Riscos e Oport.</th><th>Plano de Ação</th><th></th></tr></thead>
          <tbody>
            ${filtrados.map((o) => {
              const podeEditarEste = podeEditarRegistro(state, o.responsavel_id);
              return `
              <tr>
                <td><input type="checkbox" class="ob-checkbox" data-id="${o.id}" ${selecionados.has(o.id) ? 'checked' : ''}></td>
                <td><strong>${escapeHtml(o.nome)}</strong><br><span class="text-muted">${escapeHtml(o.descricao || '')}</span></td>
                <td>${PERSPECTIVAS[o.perspectiva_bsc]}</td>
                <td>${escapeHtml(emailPorId.get(o.responsavel_id) || '—')}</td>
                <td><span class="badge status-${o.status}">${STATUS[o.status]}</span></td>
                <td>${(() => {
                  const doObjetivo = riscosPorObjetivo.get(o.id) || [];
                  const nRiscos = doObjetivo.filter((r) => r.tipo === 'risco').length;
                  const nOports = doObjetivo.filter((r) => r.tipo === 'oportunidade').length;
                  if (!nRiscos && !nOports) return '<span class="text-muted">—</span>';
                  return `<a href="#" data-ver-riscos="${o.id}" title="Ver na Matriz de Riscos e Oportunidades" style="display:inline-flex;gap:4px;flex-wrap:wrap">
                    ${nRiscos ? `<span class="badge badge-danger">${nRiscos} risco(s)</span>` : ''}
                    ${nOports ? `<span class="badge badge-success">${nOports} oportunidade(s)</span>` : ''}
                  </a>`;
                })()}</td>
                <td>
                  <button class="btn btn-secondary btn-sm" data-ver-planos="${o.id}">
                    ${planosPorObjetivo.get(o.id) ? `${planosPorObjetivo.get(o.id)} plano(s)` : 'Sem plano — criar'}
                  </button>
                </td>
                <td class="table-actions">
                  ${podeEditarEste ? `
                    <button class="icon-btn" data-editar="${o.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                    <button class="icon-btn" data-excluir="${o.id}" title="Excluir"><i class="ti ti-trash"></i></button>
                  ` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : '<div class="empty-state"><i class="ti ti-flag"></i>Nenhum objetivo encontrado.</div>';

    const idsVisiveis = filtrados.map((o) => o.id);
    const selecionarTodas = area.querySelector('#ob-selecionar-todas');
    if (selecionarTodas) {
      selecionarTodas.checked = idsVisiveis.length > 0 && idsVisiveis.every((id) => selecionados.has(id));
      selecionarTodas.addEventListener('change', () => {
        idsVisiveis.forEach((id) => (selecionarTodas.checked ? selecionados.add(id) : selecionados.delete(id)));
        atualizarBotaoImprimir();
        renderTabela();
      });
    }

    area.querySelectorAll('.ob-checkbox').forEach((chk) => {
      chk.addEventListener('change', () => {
        if (chk.checked) selecionados.add(chk.dataset.id);
        else selecionados.delete(chk.dataset.id);
        atualizarBotaoImprimir();
      });
    });

    area.querySelectorAll('[data-editar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = itens.find((i) => i.id === btn.dataset.editar);
        abrirFormulario(state, container, membros, item, riscosPorObjetivo.get(item.id) || []);
      });
    });

    area.querySelectorAll('[data-excluir]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmar('Excluir este objetivo? Indicadores e riscos vinculados perderão o vínculo.'))) return;
        const { error } = await supabase.from('objetivos_estrategicos').delete().eq('id', btn.dataset.excluir);
        if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
        toast('Objetivo excluído.', 'sucesso');
        render(container, state);
      });
    });

    area.querySelectorAll('[data-ver-planos]').forEach((btn) => {
      btn.addEventListener('click', () => {
        definirFiltroObjetivo(btn.dataset.verPlanos);
        document.dispatchEvent(new CustomEvent('strategya:mudar-aba', { detail: { aba: 'planos' } }));
      });
    });

    area.querySelectorAll('[data-ver-riscos]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('strategya:mudar-aba', { detail: { aba: 'riscos' } }));
      });
    });
  }

  container.innerHTML = `
    ${renderMapa(itens)}
    <div class="card">
      <div class="card-header">
        <span><i class="ti ti-flag"></i> Objetivos Estratégicos</span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" id="btn-objetivos-pdf"><i class="ti ti-printer"></i> Imprimir</button>
          ${podeCriar ? '<button class="btn btn-primary btn-sm" id="btn-add-objetivo"><i class="ti ti-plus"></i> Novo objetivo</button>' : ''}
        </div>
      </div>
      ${itens.length ? `
        <div class="filters filters-compact">
          <select id="ob-filtro-responsavel" class="filter-select filter-select-sm">
            <option value="">Responsável</option>
            ${membros.map((m) => `<option value="${m.usuario_id}">${escapeHtml(m.nome || m.email)}</option>`).join('')}
          </select>
          <select id="ob-filtro-status" class="filter-select filter-select-sm">
            <option value="">Status</option>
            ${Object.entries(STATUS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </div>
        <div id="objetivos-tabela-area"></div>
      ` : '<div class="empty-state"><i class="ti ti-flag"></i>Nenhum objetivo estratégico cadastrado.</div>'}
    </div>
  `;

  wireMapa(container);
  if (itens.length) {
    renderTabela();
    atualizarBotaoImprimir();
    container.querySelectorAll('#ob-filtro-responsavel, #ob-filtro-status').forEach((el) => {
      el.addEventListener('change', () => { renderTabela(); atualizarBotaoImprimir(); });
    });
  }

  const btnAdd = container.querySelector('#btn-add-objetivo');
  if (btnAdd) btnAdd.addEventListener('click', () => abrirFormulario(state, container, membros));

  const btnImprimir = container.querySelector('#btn-objetivos-pdf');
  if (btnImprimir) {
    btnImprimir.addEventListener('click', () => imprimirListaObjetivos(objetivosAlvoImpressao(), emailPorId));
  }
}

// Documento de impressão de uma lista de objetivos (respeita a seleção em massa quando houver,
// senão os filtros de responsável/status ativos na tela).
function imprimirListaObjetivos(itens, emailPorId) {
  imprimirSecao(`
    <h2 style="margin-bottom:4px">Objetivos Estratégicos</h2>
    <p class="text-muted">${itens.length} objetivo(s)</p>
    <hr class="sep">
    ${itens.length ? `
      <table class="table">
        <thead><tr><th>Objetivo</th><th>Perspectiva</th><th>Responsável</th><th>Status</th></tr></thead>
        <tbody>
          ${itens.map((o) => `
            <tr>
              <td>${escapeHtml(o.nome)}${o.descricao ? `<br><span class="text-muted">${escapeHtml(o.descricao)}</span>` : ''}</td>
              <td>${PERSPECTIVAS[o.perspectiva_bsc]}</td>
              <td>${escapeHtml(emailPorId.get(o.responsavel_id) || '—')}</td>
              <td>${STATUS[o.status]}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<p>Nenhum objetivo encontrado.</p>'}
  `);
}

function abrirFormulario(state, container, membros, item = null, riscosVinculados = []) {
  const { supabase, empresaAtual, user } = state;
  // Nível "próprio" só grava se responsavel_id for a própria pessoa (regra do banco) — trava o
  // campo já na tela em vez de deixar escolher outra pessoa e a gravação falhar depois.
  const travarResponsavelEmSiMesmo = state.papelAtual === 'usuario' && state.nivelEdicao === 'proprio';
  // Análises já registradas a partir deste formulário (uma de risco, uma de oportunidade).
  const analiseRisco = riscosVinculados.find((r) => r.tipo === 'risco' && r.categoria === CATEGORIA_ANALISE_OBJETIVO) || null;
  const analiseOportunidade = riscosVinculados.find((r) => r.tipo === 'oportunidade' && r.categoria === CATEGORIA_ANALISE_OBJETIVO) || null;
  const modal = abrirModal(item ? 'Editar objetivo estratégico' : 'Novo objetivo estratégico', `
    <form id="form-objetivo">
      <div class="form-group">
        <label>Nome</label>
        <input type="text" id="ob-nome" required value="${item ? escapeHtml(item.nome) : ''}">
      </div>
      <div class="form-group">
        <label>Descrição</label>
        <textarea id="ob-descricao">${item ? escapeHtml(item.descricao || '') : ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Perspectiva BSC</label>
          <select id="ob-perspectiva" required>
            ${Object.entries(PERSPECTIVAS).map(([v, l]) => `<option value="${v}" ${item?.perspectiva_bsc === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="ob-status">
            ${Object.entries(STATUS).map(([v, l]) => `<option value="${v}" ${item?.status === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Responsável</label>
        <select id="ob-responsavel" ${travarResponsavelEmSiMesmo ? 'disabled' : ''}>
          <option value="">—</option>
          ${membros.map((m) => `<option value="${m.usuario_id}" ${(item ? item.responsavel_id === m.usuario_id : (travarResponsavelEmSiMesmo && m.usuario_id === user.id)) ? 'selected' : ''}>${escapeHtml(m.nome || m.email)}</option>`).join('')}
        </select>
        ${travarResponsavelEmSiMesmo ? '<p class="text-muted" style="font-size:12px;margin-top:4px">Seu nível de acesso só permite criar objetivos com você mesmo como responsável.</p>' : ''}
      </div>
      <hr class="sep">
      <p style="font-weight:700;font-size:13px;color:var(--navy-titulo);margin-bottom:8px"><i class="ti ti-alert-triangle"></i> Análise de Riscos e Oportunidades do objetivo</p>
      <div class="form-group">
        <label>Risco associado a este objetivo</label>
        <textarea id="ob-analise-risco" placeholder="O que pode impedir ou atrapalhar o alcance deste objetivo?">${analiseRisco ? escapeHtml(analiseRisco.descricao) : ''}</textarea>
      </div>
      <div class="form-group">
        <label>Oportunidade associada a este objetivo</label>
        <textarea id="ob-analise-oportunidade" placeholder="Que oportunidade este objetivo pode gerar ou aproveitar?">${analiseOportunidade ? escapeHtml(analiseOportunidade.descricao) : ''}</textarea>
      </div>
      <p class="text-muted" style="font-size:12px">Quando preenchidas, as análises são enviadas para a Matriz de Riscos e Oportunidades vinculadas a este objetivo (probabilidade e impacto entram como 3 x 3 — ajuste depois na aba Riscos e Oportunidades). Se apagar o texto, o item correspondente é removido da matriz.</p>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#form-objetivo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      empresa_id: empresaAtual.id,
      nome: modal.querySelector('#ob-nome').value.trim(),
      descricao: modal.querySelector('#ob-descricao').value.trim(),
      perspectiva_bsc: modal.querySelector('#ob-perspectiva').value,
      status: modal.querySelector('#ob-status').value,
      responsavel_id: modal.querySelector('#ob-responsavel').value || null,
    };
    let objetivoId = item?.id;
    if (item) {
      const { error } = await supabase.from('objetivos_estrategicos').update(payload).eq('id', item.id);
      if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    } else {
      const { data: novo, error } = await supabase.from('objetivos_estrategicos').insert(payload).select('id').single();
      if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
      objetivoId = novo.id;
    }

    const analises = [
      { tipo: 'risco', texto: modal.querySelector('#ob-analise-risco').value.trim(), existente: analiseRisco },
      { tipo: 'oportunidade', texto: modal.querySelector('#ob-analise-oportunidade').value.trim(), existente: analiseOportunidade },
    ];
    let sincronizouMatriz = false;
    for (const a of analises) {
      let errSync = null;
      if (a.texto && a.existente) {
        if (a.texto !== a.existente.descricao) {
          ({ error: errSync } = await supabase.from('riscos_oportunidades').update({ descricao: a.texto }).eq('id', a.existente.id));
        }
        sincronizouMatriz = true;
      } else if (a.texto) {
        ({ error: errSync } = await supabase.from('riscos_oportunidades').insert({
          empresa_id: empresaAtual.id,
          tipo: a.tipo,
          descricao: a.texto,
          categoria: CATEGORIA_ANALISE_OBJETIVO,
          objetivo_id: objetivoId,
          probabilidade: 3,
          impacto: 3,
        }));
        sincronizouMatriz = true;
      } else if (a.existente) {
        ({ error: errSync } = await supabase.from('riscos_oportunidades').delete().eq('id', a.existente.id));
      }
      if (errSync) return toast('Objetivo salvo, mas houve erro ao sincronizar com Riscos e Oportunidades: ' + errSync.message, 'erro');
    }

    toast('Objetivo salvo com sucesso.' + (sincronizouMatriz ? ' Análise enviada para a Matriz de Riscos e Oportunidades.' : ''), 'sucesso');
    fecharModal();
    render(container, state);
  });
}
