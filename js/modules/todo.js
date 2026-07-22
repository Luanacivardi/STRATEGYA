import { abrirModal, fecharModal, toast, escapeHtml, confirmar, dataValida, enviarPorEmail, imprimirSecao, podeEditarRegistro, resolverNivel } from '../ui.js';
import { recalcularPercentualMacro } from './planosAcao.js';
import { listarObjetivos } from './objetivos.js';

const STATUS_LABEL = { pendente: 'Pendente', concluido: 'Concluído' };
const ORIGEM_LABEL = { manual: 'Manual', plano: 'Plano de Ação', ata: 'Ata de Reunião' };

// Tarefas manuais criadas a partir de uma análise da Controladoria (têm conta_id) mostram a tag
// "Controladoria" em vez de "Manual", mas continuam sendo tratadas como 'manual' internamente
// (mesma tabela todo_itens, mesmo fluxo de editar/concluir/excluir).
function labelOrigem(l) {
  if (l.origem === 'manual' && l.raw?.conta_id) return 'Controladoria';
  return ORIGEM_LABEL[l.origem];
}

// Consolida 3 fontes de atividades num único painel de Tarefas: itens manuais, tarefas dos planos de ação,
// e ações das atas de reunião. Cada linha guarda o registro bruto da origem, para permitir concluir/editar
// direto por aqui (persistindo na tabela de origem), além de "voltar" pra origem (aba + filtro).
async function carregarLinhas(supabase, empresaAtual) {
  const [
    { data: todoManual },
    { data: planos },
    { data: atas },
    { data: indicadoresData },
    { data: contasData },
    membros,
    objetivos,
  ] = await Promise.all([
    supabase.from('todo_itens').select('*').eq('empresa_id', empresaAtual.id),
    supabase.from('planos_acao').select('id, numero, titulo, origem, origem_id').eq('empresa_id', empresaAtual.id),
    supabase.from('reunioes_analise_critica').select('id, data').eq('empresa_id', empresaAtual.id),
    supabase.from('indicadores').select('id, nome, objetivo_id').eq('empresa_id', empresaAtual.id),
    supabase.from('contas_gerenciais').select('id, codigo, nome').eq('empresa_id', empresaAtual.id),
    supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }).then((r) => r.data || []),
    listarObjetivos(supabase, empresaAtual.id),
  ]);

  const nomeIndicadorPorId = new Map((indicadoresData || []).map((i) => [i.id, i.nome]));
  const objetivoIdPorIndicador = new Map((indicadoresData || []).map((i) => [i.id, i.objetivo_id]));
  const emailPorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));
  const planoPorId = new Map((planos || []).map((p) => [p.id, p]));
  const contaPorId = new Map((contasData || []).map((c) => [c.id, c]));

  const planoIds = (planos || []).map((p) => p.id);
  const { data: itensPlanos } = planoIds.length
    ? await supabase.from('planos_acao_itens').select('*').in('plano_acao_id', planoIds)
    : { data: [] };

  const reuniaoIds = (atas || []).map((a) => a.id);
  const [{ data: acoesAtas }, { data: racIndicadores }] = reuniaoIds.length
    ? await Promise.all([
        supabase.from('rac_acoes').select('*').in('reuniao_id', reuniaoIds),
        supabase.from('rac_indicadores').select('reuniao_id, indicador_id').in('reuniao_id', reuniaoIds),
      ])
    : [{ data: [] }, { data: [] }];

  const indicadoresPorAta = new Map();
  (racIndicadores || []).forEach((r) => {
    const lista = indicadoresPorAta.get(r.reuniao_id) || [];
    lista.push(r.indicador_id);
    indicadoresPorAta.set(r.reuniao_id, lista);
  });
  const dataPorAta = new Map((atas || []).map((a) => [a.id, a.data]));

  const linhas = [];

  (todoManual || []).forEach((t) => {
    const objetivoId = t.indicador_id ? objetivoIdPorIndicador.get(t.indicador_id) : null;
    const conta = t.conta_id ? contaPorId.get(t.conta_id) : null;
    linhas.push({
      origem: 'manual',
      id: t.id,
      descricao: t.descricao,
      responsavelNome: emailPorId.get(t.responsavel_id) || '—',
      indicadorIds: t.indicador_id ? [t.indicador_id] : [],
      indicadorNome: nomeIndicadorPorId.get(t.indicador_id) || '—',
      objetivoIds: objetivoId ? [objetivoId] : [],
      prazo: t.prazo,
      statusKey: t.status,
      evolucao: t.evolucao,
      refLabel: conta ? `${conta.codigo} — ${conta.nome}` : null,
      raw: t,
    });
  });

  (itensPlanos || []).forEach((i) => {
    const plano = planoPorId.get(i.plano_acao_id);
    const indicadorId = plano?.origem === 'indicador' ? plano.origem_id : null;
    const objetivoId = plano?.origem === 'objetivo' ? plano.origem_id : (indicadorId ? objetivoIdPorIndicador.get(indicadorId) : null);
    linhas.push({
      origem: 'plano',
      id: i.id,
      descricao: i.descricao,
      responsavelNome: emailPorId.get(i.responsavel_id) || '—',
      indicadorIds: indicadorId ? [indicadorId] : [],
      indicadorNome: indicadorId ? (nomeIndicadorPorId.get(indicadorId) || '—') : '—',
      objetivoIds: objetivoId ? [objetivoId] : [],
      prazo: i.prazo,
      statusKey: i.status === 'concluido' ? 'concluido' : 'pendente',
      evolucao: i.evolucao,
      refLabel: plano ? `${plano.numero} — ${plano.titulo}` : null,
      raw: i,
    });
  });

  (acoesAtas || []).forEach((a) => {
    const indicadorIds = indicadoresPorAta.get(a.reuniao_id) || [];
    const objetivoIds = [...new Set(indicadorIds.map((id) => objetivoIdPorIndicador.get(id)).filter(Boolean))];
    linhas.push({
      origem: 'ata',
      id: a.id,
      descricao: a.descricao,
      responsavelNome: emailPorId.get(a.responsavel_id) || '—',
      indicadorIds,
      indicadorNome: indicadorIds.map((id) => nomeIndicadorPorId.get(id)).filter(Boolean).join(', ') || '—',
      objetivoIds,
      prazo: a.prazo,
      statusKey: a.concluida ? 'concluido' : 'pendente',
      evolucao: a.evolucao,
      refLabel: dataPorAta.has(a.reuniao_id) ? `Ata de ${dataPorAta.get(a.reuniao_id)}` : null,
      raw: a,
    });
  });

  linhas.sort((x, y) => (x.prazo || '9999').localeCompare(y.prazo || '9999'));

  return { linhas, membros, indicadores: indicadoresData || [], objetivos };
}

function exportarCsv(linhas) {
  const cabecalho = ['Origem', 'Descrição', 'Responsável', 'Indicador', 'Prazo', 'Status', 'Evolução'];
  const escaparCsv = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const linhasCsv = linhas.map((l) => [
    labelOrigem(l), l.descricao, l.responsavelNome, l.indicadorNome, l.prazo || '', STATUS_LABEL[l.statusKey], l.evolucao || '',
  ].map(escaparCsv).join(','));
  const csv = [cabecalho.map(escaparCsv).join(','), ...linhasCsv].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tarefas_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function aplicarFiltros(linhas, container) {
  const busca = (container.querySelector('#todo-busca')?.value || '').trim().toLowerCase();
  const respFiltro = container.querySelector('#todo-filtro-responsavel').value;
  const indFiltro = container.querySelector('#todo-filtro-indicador').value;
  const objFiltro = container.querySelector('#todo-filtro-objetivo').value;
  const statusFiltro = container.querySelector('#todo-filtro-status').value;
  const deFiltro = container.querySelector('#todo-filtro-de').value;
  const ateFiltro = container.querySelector('#todo-filtro-ate').value;

  return linhas.filter((l) => {
    if (busca) {
      const alvo = `${l.descricao} ${l.evolucao || ''} ${l.responsavelNome} ${l.indicadorNome}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    if (respFiltro && l.responsavelNome !== respFiltro) return false;
    if (indFiltro && !l.indicadorIds.includes(indFiltro)) return false;
    if (objFiltro && !l.objetivoIds.includes(objFiltro)) return false;
    if (statusFiltro && l.statusKey !== statusFiltro) return false;
    if (deFiltro && (!l.prazo || l.prazo < deFiltro)) return false;
    if (ateFiltro && (!l.prazo || l.prazo > ateFiltro)) return false;
    return true;
  });
}

export async function renderCorpo(container, state) {
  const { supabase, empresaAtual, papelAtual } = state;
  const podeEditar = resolverNivel(state, 'acoes', 'tarefas') === 'total';
  const podeCriar = podeEditar || resolverNivel(state, 'acoes', 'tarefas') === 'proprio';

  let linhas, membros, indicadores, objetivos;
  try {
    const dados = await carregarLinhas(supabase, empresaAtual);
    linhas = dados.linhas;
    membros = dados.membros;
    indicadores = dados.indicadores;
    objetivos = dados.objetivos;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar tarefas: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const selecionadas = new Set(); // chaves "origem:id" das tarefas marcadas para ações em massa

  container.innerHTML = `
    <div class="lista-toolbar">
      <div class="filters filters-compact">
        <input type="text" id="todo-busca" class="filter-select filter-select-sm" placeholder="Buscar por palavra-chave...">
        <select id="todo-filtro-responsavel" class="filter-select filter-select-sm">
          <option value="">Responsável</option>
          ${membros.map((m) => `<option value="${escapeHtml(m.nome || m.email)}">${escapeHtml(m.nome || m.email)}</option>`).join('')}
        </select>
        <select id="todo-filtro-indicador" class="filter-select filter-select-sm">
          <option value="">Indicador</option>
          ${indicadores.map((i) => `<option value="${i.id}">${escapeHtml(i.nome)}</option>`).join('')}
        </select>
        <select id="todo-filtro-objetivo" class="filter-select filter-select-sm">
          <option value="">Objetivo</option>
          ${objetivos.map((o) => `<option value="${o.id}">${escapeHtml(o.nome)}</option>`).join('')}
        </select>
        <select id="todo-filtro-status" class="filter-select filter-select-sm">
          <option value="">Status</option>
          <option value="pendente">Pendente</option>
          <option value="concluido">Concluído</option>
        </select>
        <input type="date" id="todo-filtro-de" class="filter-select filter-select-sm" title="De">
        <input type="date" id="todo-filtro-ate" class="filter-select filter-select-sm" title="Até">
      </div>
      <div class="lista-toolbar-acoes">
        <button class="btn btn-secondary btn-sm" id="btn-todo-csv"><i class="ti ti-download"></i> CSV</button>
        <button class="btn btn-secondary btn-sm" id="btn-todo-email"><i class="ti ti-mail"></i> E-mail</button>
        <button class="btn btn-secondary btn-sm" id="btn-todo-pdf"><i class="ti ti-printer"></i> PDF</button>
        ${podeCriar ? '<button class="btn btn-primary btn-sm" id="btn-todo-add"><i class="ti ti-plus"></i> Nova tarefa</button>' : ''}
      </div>
    </div>
    <div id="todo-tabela-area"></div>
  `;

  // Ações em massa (CSV/PDF/e-mail) agem sobre a seleção quando houver algo marcado,
  // senão sobre todas as linhas visíveis com os filtros atuais.
  function alvoAtual() {
    if (selecionadas.size) {
      const chaves = new Set(selecionadas);
      return linhas.filter((l) => chaves.has(`${l.origem}:${l.id}`));
    }
    return aplicarFiltros(linhas, container);
  }

  function atualizarBotoesAcao() {
    const n = alvoAtual().length;
    container.querySelector('#btn-todo-csv').innerHTML = `<i class="ti ti-download"></i> CSV (${n})`;
    container.querySelector('#btn-todo-email').innerHTML = `<i class="ti ti-mail"></i> E-mail (${n})`;
    container.querySelector('#btn-todo-pdf').innerHTML = `<i class="ti ti-printer"></i> PDF (${n})`;
  }

  function renderTabela() {
    const filtradas = aplicarFiltros(linhas, container);

    const area = container.querySelector('#todo-tabela-area');
    area.innerHTML = filtradas.length ? `
      <table class="table">
        <thead><tr><th><input type="checkbox" id="todo-selecionar-todas"></th><th>Origem</th><th>Descrição</th><th>Responsável</th><th>Indicador</th><th>Prazo</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${filtradas.map((l) => { const chave = `${l.origem}:${l.id}`; return `
            <tr>
              <td><input type="checkbox" class="todo-checkbox" data-chave="${chave}" ${selecionadas.has(chave) ? 'checked' : ''}></td>
              <td><span class="badge badge-neutral">${labelOrigem(l)}</span>${l.refLabel ? `<br><span class="text-muted">${escapeHtml(l.refLabel)}</span>` : ''}</td>
              <td>${escapeHtml(l.descricao)}${l.evolucao ? `<br><span class="text-muted"><i class="ti ti-notes"></i> ${escapeHtml(l.evolucao)}</span>` : ''}</td>
              <td>${escapeHtml(l.responsavelNome)}</td>
              <td>${escapeHtml(l.indicadorNome)}</td>
              <td>${l.prazo || '—'}</td>
              <td><span class="badge ${l.statusKey === 'concluido' ? 'status-concluido' : 'status-nao_iniciado'}">${STATUS_LABEL[l.statusKey]}</span></td>
              <td class="table-actions">
                <button class="icon-btn" data-imprimir-tarefa="${l.origem}:${l.id}" title="Imprimir esta tarefa"><i class="ti ti-printer"></i></button>
                ${podeEditarRegistro(state, l.raw.responsavel_id, 'acoes', 'tarefas') ? `
                  <button class="icon-btn" data-concluir-tarefa="${l.origem}:${l.id}" title="${l.statusKey === 'concluido' ? 'Reabrir' : 'Concluir'}">
                    <i class="ti ${l.statusKey === 'concluido' ? 'ti-rotate-clockwise-2' : 'ti-circle-check'}"></i>
                  </button>
                  <button class="icon-btn" data-editar-tarefa="${l.origem}:${l.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                  ${l.origem === 'manual' ? `<button class="icon-btn" data-excluir-todo="${l.id}" title="Excluir"><i class="ti ti-trash"></i></button>` : ''}
                ` : ''}
              </td>
            </tr>`; }).join('')}
        </tbody>
      </table>` : '<div class="empty-state"><i class="ti ti-checklist"></i>Nenhum item encontrado com esses filtros.</div>';

    const chavesVisiveis = filtradas.map((l) => `${l.origem}:${l.id}`);
    const selecionarTodas = area.querySelector('#todo-selecionar-todas');
    if (selecionarTodas) {
      selecionarTodas.checked = chavesVisiveis.length > 0 && chavesVisiveis.every((c) => selecionadas.has(c));
      selecionarTodas.addEventListener('change', () => {
        chavesVisiveis.forEach((c) => (selecionarTodas.checked ? selecionadas.add(c) : selecionadas.delete(c)));
        atualizarBotoesAcao();
        renderTabela();
      });
    }

    area.querySelectorAll('.todo-checkbox').forEach((chk) => {
      chk.addEventListener('change', () => {
        if (chk.checked) selecionadas.add(chk.dataset.chave);
        else selecionadas.delete(chk.dataset.chave);
        atualizarBotoesAcao();
      });
    });

    area.querySelectorAll('[data-imprimir-tarefa]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [origem, id] = btn.dataset.imprimirTarefa.split(':');
        const linha = linhas.find((l) => l.origem === origem && l.id === id);
        imprimirTarefa(linha);
      });
    });

    area.querySelectorAll('[data-concluir-tarefa]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const [origem, id] = btn.dataset.concluirTarefa.split(':');
        const linha = linhas.find((l) => l.origem === origem && l.id === id);
        await alternarConclusao(state, linha);
        await renderCorpo(container, state);
      });
    });

    area.querySelectorAll('[data-editar-tarefa]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [origem, id] = btn.dataset.editarTarefa.split(':');
        const linha = linhas.find((l) => l.origem === origem && l.id === id);
        abrirDetalheTarefa(state, container, membros, indicadores, linha);
      });
    });

    area.querySelectorAll('[data-excluir-todo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmar('Excluir esta tarefa?'))) return;
        const { error } = await supabase.from('todo_itens').delete().eq('id', btn.dataset.excluirTodo);
        if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
        toast('Item excluído.', 'sucesso');
        renderCorpo(container, state);
      });
    });
  }

  renderTabela();
  atualizarBotoesAcao();

  container.querySelectorAll('#todo-busca, #todo-filtro-responsavel, #todo-filtro-indicador, #todo-filtro-objetivo, #todo-filtro-status, #todo-filtro-de, #todo-filtro-ate').forEach((el) => {
    el.addEventListener('input', () => { renderTabela(); atualizarBotoesAcao(); });
    el.addEventListener('change', () => { renderTabela(); atualizarBotoesAcao(); });
  });

  container.querySelector('#btn-todo-csv').addEventListener('click', () => exportarCsv(alvoAtual()));
  container.querySelector('#btn-todo-pdf').addEventListener('click', () => imprimirTarefasEmLote(alvoAtual()));
  container.querySelector('#btn-todo-email').addEventListener('click', () => {
    const alvo = alvoAtual();
    const corpo = alvo.map((l) => `${labelOrigem(l)} — ${l.descricao}\nResponsável: ${l.responsavelNome} | Prazo: ${l.prazo || '—'} | Status: ${STATUS_LABEL[l.statusKey]}\n`).join('\n');
    enviarPorEmail('Tarefas', corpo || 'Nenhuma tarefa encontrada.');
  });

  const btnAdd = container.querySelector('#btn-todo-add');
  if (btnAdd) btnAdd.addEventListener('click', () => abrirDetalheTarefa(state, container, membros, indicadores));
}

// Impressão em massa (lista selecionada ou todas as filtradas) em folha timbrada, com todos os
// campos organizados numa tabela — usada tanto pelo "Exportar PDF" quanto por "Imprimir selecionadas".
function imprimirTarefasEmLote(linhas) {
  imprimirSecao(`
    <h2 style="margin-bottom:4px">Tarefas</h2>
    <p class="text-muted">${linhas.length} tarefa(s)</p>
    <hr class="sep">
    ${linhas.length ? `
      <table class="table">
        <thead><tr><th>Origem</th><th>Descrição</th><th>Responsável</th><th>Indicador</th><th>Prazo</th><th>Status</th><th>Evolução</th></tr></thead>
        <tbody>
          ${linhas.map((l) => `
            <tr>
              <td>${labelOrigem(l)}${l.refLabel ? `<br><span class="text-muted">${escapeHtml(l.refLabel)}</span>` : ''}</td>
              <td>${escapeHtml(l.descricao)}</td>
              <td>${escapeHtml(l.responsavelNome)}</td>
              <td>${escapeHtml(l.indicadorNome)}</td>
              <td>${l.prazo || '—'}</td>
              <td>${STATUS_LABEL[l.statusKey]}</td>
              <td>${l.evolucao ? escapeHtml(l.evolucao) : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<p>Nenhuma tarefa encontrada.</p>'}
  `);
}

// Imprime uma única tarefa em folha timbrada, com todos os campos numa tabela organizada
// (mesmo mecanismo usado para imprimir uma ata individual: #print-secao + classe imprimindo-secao).
function imprimirTarefa(linha) {
  if (!linha) return;
  imprimirSecao(`
    <h2 style="margin-bottom:4px">Tarefa</h2>
    <p class="text-muted">${labelOrigem(linha)}${linha.refLabel ? ' — ' + escapeHtml(linha.refLabel) : ''}</p>
    <hr class="sep">
    <table class="print-detalhe-tabela">
      <tbody>
        <tr><th>Descrição</th><td>${escapeHtml(linha.descricao)}</td></tr>
        <tr><th>Responsável</th><td>${escapeHtml(linha.responsavelNome)}</td></tr>
        <tr><th>Indicador</th><td>${escapeHtml(linha.indicadorNome)}</td></tr>
        <tr><th>Prazo</th><td>${linha.prazo || '—'}</td></tr>
        <tr><th>Status</th><td>${STATUS_LABEL[linha.statusKey]}</td></tr>
        <tr><th>Evolução / ações realizadas</th><td>${linha.evolucao ? escapeHtml(linha.evolucao) : '—'}</td></tr>
      </tbody>
    </table>
  `);
}

// Concluir/reabrir direto na tabela de Tarefas, sem precisar abrir o item na origem.
async function alternarConclusao(state, linha) {
  const { supabase } = state;
  const concluir = linha.statusKey !== 'concluido';

  if (linha.origem === 'manual') {
    const { error } = await supabase.from('todo_itens').update({ status: concluir ? 'concluido' : 'pendente' }).eq('id', linha.id);
    if (error) return toast('Erro ao atualizar: ' + error.message, 'erro');
  } else if (linha.origem === 'plano') {
    const { error } = await supabase.from('planos_acao_itens')
      .update({ status: concluir ? 'concluido' : 'nao_iniciado', percentual_conclusao: concluir ? 100 : 0 })
      .eq('id', linha.id);
    if (error) return toast('Erro ao atualizar: ' + error.message, 'erro');
    await recalcularPercentualMacro(supabase, linha.raw.plano_acao_id);
  } else if (linha.origem === 'ata') {
    const { error } = await supabase.from('rac_acoes').update({ concluida: concluir }).eq('id', linha.id);
    if (error) return toast('Erro ao atualizar: ' + error.message, 'erro');
  }
  toast(concluir ? 'Tarefa concluída.' : 'Tarefa reaberta.', 'sucesso');
}

// Modal único de detalhe/edição, usado para as 3 origens. Cada origem tem sua tabela e seus
// próprios campos de status; o campo "Evolução" (histórico do que já foi feito) é comum aos três.
function abrirDetalheTarefa(state, container, membros, indicadores, linha = null) {
  const { supabase, empresaAtual, user } = state;
  const origem = linha?.origem || 'manual';
  const raw = linha?.raw;
  const travarResponsavelEmSiMesmo = !linha && resolverNivel(state, 'acoes', 'tarefas') === 'proprio';

  const mostraIndicador = origem === 'manual';
  const mostraStatusManual = origem === 'manual';

  const modal = abrirModal(linha ? 'Editar tarefa' : 'Nova tarefa', `
    <form id="form-tarefa">
      ${linha && linha.refLabel ? `<p class="text-muted" style="margin-bottom:10px"><i class="ti ti-corner-down-right"></i> Origem: ${escapeHtml(linha.refLabel)}</p>` : ''}
      <div class="form-group">
        <label>Descrição</label>
        <textarea id="tarefa-descricao" required>${linha ? escapeHtml(linha.descricao) : ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Responsável</label>
          <select id="tarefa-responsavel" ${travarResponsavelEmSiMesmo ? 'disabled' : ''}>
            <option value="">—</option>
            ${membros.map((m) => `<option value="${m.usuario_id}" ${(travarResponsavelEmSiMesmo ? m.usuario_id === user.id : raw?.responsavel_id === m.usuario_id) ? 'selected' : ''}>${escapeHtml(m.nome || m.email)}</option>`).join('')}
          </select>
          ${travarResponsavelEmSiMesmo ? '<small class="text-muted">Seu nível de acesso só permite criar tarefas com você mesmo como responsável.</small>' : ''}
        </div>
        ${mostraIndicador ? `
        <div class="form-group">
          <label>Indicador (opcional)</label>
          <select id="tarefa-indicador">
            <option value="">—</option>
            ${indicadores.map((i) => `<option value="${i.id}" ${raw?.indicador_id === i.id ? 'selected' : ''}>${escapeHtml(i.nome)}</option>`).join('')}
          </select>
        </div>` : ''}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Prazo</label>
          <input type="date" id="tarefa-prazo" value="${raw?.prazo || ''}">
        </div>
        <div class="form-group">
          <label>Status</label>
          ${mostraStatusManual ? `
            <select id="tarefa-status">
              <option value="pendente" ${!linha || linha.statusKey === 'pendente' ? 'selected' : ''}>Pendente</option>
              <option value="concluido" ${linha?.statusKey === 'concluido' ? 'selected' : ''}>Concluído</option>
            </select>
          ` : `<p class="text-muted" style="margin-top:8px">Use o botão de concluir/reabrir na lista de Tarefas. Aqui é só possível registrar a evolução.</p>`}
        </div>
      </div>
      <div class="form-group">
        <label>Evolução / descrição das ações realizadas</label>
        <textarea id="tarefa-evolucao" placeholder="Registre aqui o andamento da tarefa...">${linha?.evolucao ? escapeHtml(linha.evolucao) : ''}</textarea>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#form-tarefa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const prazo = modal.querySelector('#tarefa-prazo').value;
    if (prazo && !dataValida(prazo)) return toast('Prazo inválido.', 'erro');
    const descricao = modal.querySelector('#tarefa-descricao').value.trim();
    const responsavelId = modal.querySelector('#tarefa-responsavel').value || null;
    const evolucao = modal.querySelector('#tarefa-evolucao').value.trim() || null;

    let error;
    if (origem === 'manual') {
      const payload = {
        empresa_id: empresaAtual.id,
        descricao,
        responsavel_id: responsavelId,
        indicador_id: modal.querySelector('#tarefa-indicador').value || null,
        prazo: prazo || null,
        status: modal.querySelector('#tarefa-status').value,
        evolucao,
      };
      const query = raw
        ? supabase.from('todo_itens').update(payload).eq('id', raw.id)
        : supabase.from('todo_itens').insert(payload);
      ({ error } = await query);
    } else if (origem === 'plano') {
      ({ error } = await supabase.from('planos_acao_itens')
        .update({ descricao, responsavel_id: responsavelId, prazo: prazo || null, evolucao })
        .eq('id', raw.id));
    } else if (origem === 'ata') {
      ({ error } = await supabase.from('rac_acoes')
        .update({ descricao, responsavel_id: responsavelId, prazo: prazo || null, evolucao })
        .eq('id', raw.id));
    }

    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    toast('Tarefa salva com sucesso.', 'sucesso');
    fecharModal();
    renderCorpo(container, state);
  });
}
