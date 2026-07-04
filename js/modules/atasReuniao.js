import { abrirModal, fecharModal, toast, escapeHtml, confirmar, dataValida, enviarPorEmail, imprimirSecao } from '../ui.js';

export async function render(container, state) {
  const { supabase, empresaAtual, papelAtual } = state;
  const podeEditar = papelAtual !== 'usuario';

  let atas, indicadores, membros, indicadoresPorAta, acoesPorAta;
  try {
    const [resAtas, resIndicadores, resMembros] = await Promise.all([
      supabase.from('reunioes_analise_critica').select('*').eq('empresa_id', empresaAtual.id).order('data', { ascending: false }),
      supabase.from('indicadores').select('id, nome').eq('empresa_id', empresaAtual.id).order('nome'),
      supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }).then((r) => r.data || []),
    ]);
    if (resAtas.error) throw resAtas.error;
    atas = resAtas.data;
    indicadores = resIndicadores.data || [];
    membros = resMembros;

    indicadoresPorAta = new Map();
    acoesPorAta = new Map();
    if (atas.length) {
      const ids = atas.map((a) => a.id);
      const [{ data: racIndicadores }, { data: racAcoes }] = await Promise.all([
        supabase.from('rac_indicadores').select('reuniao_id, indicador_id').in('reuniao_id', ids),
        supabase.from('rac_acoes').select('reuniao_id, concluida').in('reuniao_id', ids),
      ]);
      const nomeIndicadorPorId = new Map(indicadores.map((i) => [i.id, i.nome]));
      (racIndicadores || []).forEach((r) => {
        const lista = indicadoresPorAta.get(r.reuniao_id) || [];
        lista.push(nomeIndicadorPorId.get(r.indicador_id) || '—');
        indicadoresPorAta.set(r.reuniao_id, lista);
      });
      (racAcoes || []).forEach((a) => {
        const contagem = acoesPorAta.get(a.reuniao_id) || { total: 0, concluidas: 0 };
        contagem.total += 1;
        if (a.concluida) contagem.concluidas += 1;
        acoesPorAta.set(a.reuniao_id, contagem);
      });
    }
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar atas: ${escapeHtml(err.message)}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span><i class="ti ti-notebook"></i> Atas de Reunião de Análise Crítica</span>
        ${podeEditar ? '<button class="btn btn-primary btn-sm" id="btn-add-ata"><i class="ti ti-plus"></i> Nova ata</button>' : ''}
      </div>
      ${atas.length ? `
        <table class="table">
          <thead><tr><th>Data</th><th>Indicadores</th><th>Participantes</th><th>Decisões</th><th>Tarefas</th><th></th></tr></thead>
          <tbody>
            ${atas.map((a) => {
              const nomesIndicadores = indicadoresPorAta.get(a.id) || [];
              const acoes = acoesPorAta.get(a.id) || { total: 0, concluidas: 0 };
              return `
              <tr>
                <td>${a.data}</td>
                <td>${nomesIndicadores.length ? nomesIndicadores.map((n) => `<span class="badge badge-neutral">${escapeHtml(n)}</span>`).join(' ') : '<span class="text-muted">—</span>'}</td>
                <td>${escapeHtml(a.participantes || '—')}</td>
                <td>${escapeHtml((a.decisoes || '').slice(0, 80))}${(a.decisoes || '').length > 80 ? '…' : ''}</td>
                <td><button class="btn btn-secondary btn-sm" data-acoes-todo="${a.id}"><i class="ti ti-checklist"></i> ${acoes.concluidas}/${acoes.total}</button></td>
                <td class="table-actions">
                  <button class="icon-btn" data-imprimir-ata="${a.id}" title="Imprimir esta ata (PDF)"><i class="ti ti-printer"></i></button>
                  <button class="icon-btn" data-email-ata="${a.id}" title="Enviar por e-mail"><i class="ti ti-mail"></i></button>
                  ${podeEditar ? `
                    <button class="icon-btn" data-editar="${a.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                    <button class="icon-btn" data-excluir="${a.id}" title="Excluir"><i class="ti ti-trash"></i></button>
                  ` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : '<div class="empty-state"><i class="ti ti-notebook"></i>Nenhuma ata registrada.</div>'}
    </div>
  `;

  const btnAdd = container.querySelector('#btn-add-ata');
  if (btnAdd) btnAdd.addEventListener('click', () => abrirFormulario(state, container, indicadores, membros));

  container.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = atas.find((a) => a.id === btn.dataset.editar);
      abrirFormulario(state, container, indicadores, membros, item);
    });
  });

  container.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Excluir esta ata de reunião?'))) return;
      const { error } = await supabase.from('reunioes_analise_critica').delete().eq('id', btn.dataset.excluir);
      if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
      toast('Ata excluída.', 'sucesso');
      render(container, state);
    });
  });

  container.querySelectorAll('[data-acoes-todo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = atas.find((a) => a.id === btn.dataset.acoesTodo);
      abrirAcoesTodo(state, container, item, membros);
    });
  });

  container.querySelectorAll('[data-imprimir-ata]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = atas.find((a) => a.id === btn.dataset.imprimirAta);
      imprimirAta(state, item, indicadores, membros);
    });
  });

  container.querySelectorAll('[data-email-ata]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = atas.find((a) => a.id === btn.dataset.emailAta);
      const { indicadoresInfo, acoes, nomePorId } = await carregarDadosAta(state, item, indicadores, membros);
      const corpo = [
        `Ata de Reunião de Análise Crítica — ${item.data}`,
        `Participantes: ${item.participantes || '—'}`,
        '', 'Pauta:', item.pauta || '—',
        '', 'Indicadores tratados:',
        ...(indicadoresInfo.length ? indicadoresInfo.map((i) => `${i.nome}: ${i.consideracoes || '—'}`) : ['—']),
        '', 'Considerações gerais:', item.consideracoes || '—',
        '', 'Decisões:', item.decisoes || '—',
        '', 'Tarefas:',
        ...(acoes.length ? acoes.map((a) => `- ${a.descricao} (${nomePorId.get(a.responsavel_id) || '—'}, prazo ${a.prazo || '—'}, ${a.concluida ? 'concluída' : 'pendente'})`) : ['Nenhuma tarefa registrada.']),
      ].join('\n');
      enviarPorEmail(`Ata de Reunião — ${item.data}`, corpo);
    });
  });
}

// Busca os dados completos de uma ata (indicadores tratados + tarefas), usado tanto pela
// impressão quanto pelo envio por e-mail.
async function carregarDadosAta(state, ata, indicadoresCat, membros) {
  const { supabase } = state;
  const [{ data: racIndicadores }, { data: acoes }] = await Promise.all([
    supabase.from('rac_indicadores').select('indicador_id, consideracoes').eq('reuniao_id', ata.id),
    supabase.from('rac_acoes').select('*').eq('reuniao_id', ata.id).order('created_at'),
  ]);

  const nomeIndicadorPorId = new Map(indicadoresCat.map((i) => [i.id, i.nome]));
  const nomePorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));
  const indicadoresInfo = (racIndicadores || []).map((r) => ({
    nome: nomeIndicadorPorId.get(r.indicador_id) || '—',
    consideracoes: r.consideracoes,
  }));

  return { indicadoresInfo, acoes: acoes || [], nomePorId };
}

// Monta uma versão "documento" da ata (todos os campos por extenso, sem truncar) e imprime
// usando o timbre padrão do app (logo + dados da empresa + marca STRATEGYA by ORBEEX).
async function imprimirAta(state, ata, indicadoresCat, membros) {
  const { indicadoresInfo, acoes, nomePorId } = await carregarDadosAta(state, ata, indicadoresCat, membros);

  imprimirSecao(`
    <h2 style="margin-bottom:4px">Ata de Reunião de Análise Crítica</h2>
    <p class="text-muted">Data: ${ata.data} — Participantes: ${escapeHtml(ata.participantes || '—')}</p>
    <hr class="sep">
    <h4>Pauta</h4>
    <p>${escapeHtml(ata.pauta || '—')}</p>
    <h4>Indicadores tratados</h4>
    ${indicadoresInfo.length ? indicadoresInfo.map((i) => `<p><strong>${escapeHtml(i.nome)}</strong>: ${escapeHtml(i.consideracoes || '—')}</p>`).join('') : '<p>—</p>'}
    <h4>Considerações gerais</h4>
    <p>${escapeHtml(ata.consideracoes || '—')}</p>
    <h4>Decisões</h4>
    <p>${escapeHtml(ata.decisoes || '—')}</p>
    <h4>Tarefas</h4>
    ${(acoes || []).length ? `
      <table class="table">
        <thead><tr><th>Descrição</th><th>Responsável</th><th>Prazo</th><th>Status</th></tr></thead>
        <tbody>
          ${acoes.map((a) => `
            <tr>
              <td>${escapeHtml(a.descricao)}</td>
              <td>${escapeHtml(nomePorId.get(a.responsavel_id) || '—')}</td>
              <td>${a.prazo || '—'}</td>
              <td>${a.concluida ? 'Concluída' : 'Pendente'}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<p>Nenhuma tarefa registrada.</p>'}
  `);
}

// ---------- Seletor de indicadores (combo + botão "adicionar", em vez de lista de checkboxes) ----------

function renderSelectIndicadores(modal, indicadores, selecionados) {
  const select = modal.querySelector('#ata-indicador-select');
  const disponiveis = indicadores.filter((i) => !selecionados.has(i.id));
  select.innerHTML = '<option value="">Selecionar indicador...</option>'
    + disponiveis.map((i) => `<option value="${i.id}">${escapeHtml(i.nome)}</option>`).join('');
}

function renderIndicadoresSelecionados(modal, indicadores, selecionados) {
  const nomePorId = new Map(indicadores.map((i) => [i.id, i.nome]));
  const cont = modal.querySelector('#ata-indicadores-selecionados');
  cont.innerHTML = selecionados.size ? [...selecionados.entries()].map(([id, consid]) => `
    <div class="ata-indicador-linha" style="margin-bottom:8px;border:1px solid var(--border);border-radius:var(--radius);padding:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <strong style="font-size:13px">${escapeHtml(nomePorId.get(id) || '—')}</strong>
        <button type="button" class="icon-btn" data-remover-indicador="${id}" title="Remover"><i class="ti ti-x"></i></button>
      </div>
      <textarea data-consideracao-indicador="${id}" placeholder="Considerações sobre este indicador..." style="margin-top:6px">${escapeHtml(consid || '')}</textarea>
    </div>`).join('') : '<p class="text-muted">Nenhum indicador selecionado.</p>';

  cont.querySelectorAll('[data-remover-indicador]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selecionados.delete(btn.dataset.removerIndicador);
      renderSelectIndicadores(modal, indicadores, selecionados);
      renderIndicadoresSelecionados(modal, indicadores, selecionados);
    });
  });

  cont.querySelectorAll('[data-consideracao-indicador]').forEach((txt) => {
    txt.addEventListener('input', () => {
      selecionados.set(txt.dataset.consideracaoIndicador, txt.value);
    });
  });
}

// ---------- Tarefas / Plano de Ação embutidos no formulário da ata ----------

async function carregarTarefas(supabase, item) {
  if (!item) return [];
  const { data } = await supabase.from('rac_acoes').select('*, planos_acao(numero)').eq('reuniao_id', item.id).order('created_at');
  return data || [];
}

function renderTarefas(modal, tarefas, membros) {
  const emailPorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));
  const cont = modal.querySelector('#ata-tarefas-lista');
  if (!cont) return;
  cont.innerHTML = tarefas.length ? tarefas.map((t) => `
    <div class="ata-tarefa-linha" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <input type="checkbox" data-tarefa-concluida="${t.id}" ${t.concluida ? 'checked' : ''}>
      <span style="flex:1;font-size:13px;min-width:120px;${t.concluida ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${escapeHtml(t.descricao)}</span>
      <span class="text-muted" style="font-size:11px">${escapeHtml(emailPorId.get(t.responsavel_id) || '—')}</span>
      ${t.plano_acao_id
        ? `<span class="badge badge-neutral">${escapeHtml(t.planos_acao?.numero || 'vinculado')}</span>`
        : `<button type="button" class="icon-btn" data-tarefa-abrir-plano="${t.id}" title="Abrir Plano de Ação"><i class="ti ti-clipboard-plus"></i></button>`}
      <button type="button" class="icon-btn" data-tarefa-excluir="${t.id}" title="Excluir"><i class="ti ti-trash"></i></button>
    </div>`).join('') : '<p class="text-muted" style="font-size:12px">Nenhuma tarefa ainda.</p>';
}

function wireTarefas(modal, state, item, membros, tarefasRef) {
  const { supabase, empresaAtual } = state;
  const cont = modal.querySelector('#ata-tarefas-lista');
  if (!cont) return;

  async function recarregar() {
    tarefasRef.lista = await carregarTarefas(supabase, item);
    renderTarefas(modal, tarefasRef.lista, membros);
    wireTarefas(modal, state, item, membros, tarefasRef);
  }

  cont.querySelectorAll('[data-tarefa-concluida]').forEach((chk) => {
    chk.addEventListener('change', async () => {
      const { error } = await supabase.from('rac_acoes').update({ concluida: chk.checked }).eq('id', chk.dataset.tarefaConcluida);
      if (error) return toast('Erro ao atualizar: ' + error.message, 'erro');
      await recarregar();
    });
  });

  cont.querySelectorAll('[data-tarefa-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Excluir esta tarefa?'))) return;
      const { error } = await supabase.from('rac_acoes').delete().eq('id', btn.dataset.tarefaExcluir);
      if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
      await recarregar();
    });
  });

  cont.querySelectorAll('[data-tarefa-abrir-plano]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tarefa = tarefasRef.lista.find((x) => x.id === btn.dataset.tarefaAbrirPlano);
      await criarPlanoDeAcao(supabase, empresaAtual, item, {
        titulo: tarefa.descricao, responsavel_id: tarefa.responsavel_id, quando: tarefa.prazo,
      }, tarefa.id);
    });
  });

  const btnAddTarefa = modal.querySelector('#btn-add-tarefa');
  if (btnAddTarefa) {
    btnAddTarefa.addEventListener('click', async () => {
      const descricao = modal.querySelector('#ata-nova-tarefa').value.trim();
      if (!descricao) return toast('Descreva a tarefa antes de adicionar.', 'erro');
      const prazo = modal.querySelector('#ata-tarefa-prazo').value;
      if (prazo && !dataValida(prazo)) return toast('Prazo inválido.', 'erro');
      const payload = {
        reuniao_id: item.id,
        descricao,
        responsavel_id: modal.querySelector('#ata-tarefa-responsavel').value || null,
        prazo: prazo || null,
      };
      const { error } = await supabase.from('rac_acoes').insert(payload);
      if (error) return toast('Erro ao adicionar tarefa: ' + error.message, 'erro');
      modal.querySelector('#ata-nova-tarefa').value = '';
      modal.querySelector('#ata-tarefa-prazo').value = '';
      modal.querySelector('#ata-tarefa-responsavel').value = '';
      await recarregar();
    });
  }

  const btnAbrirPlanoDireto = modal.querySelector('#btn-abrir-plano-direto');
  if (btnAbrirPlanoDireto) {
    btnAbrirPlanoDireto.addEventListener('click', async () => {
      const titulo = modal.querySelector('#ata-nova-tarefa').value.trim();
      if (!titulo) return toast('Descreva o assunto antes de abrir o plano de ação.', 'erro');
      const prazo = modal.querySelector('#ata-tarefa-prazo').value;
      if (prazo && !dataValida(prazo)) return toast('Prazo inválido.', 'erro');
      await criarPlanoDeAcao(supabase, empresaAtual, item, {
        titulo, responsavel_id: modal.querySelector('#ata-tarefa-responsavel').value || null, quando: prazo || null,
      });
    });
  }

  const linkTodo = modal.querySelector('#link-ir-todo');
  if (linkTodo) linkTodo.addEventListener('click', (e) => {
    e.preventDefault();
    fecharModal();
    document.dispatchEvent(new CustomEvent('strategya:mudar-aba', { detail: { aba: 'planos', grupo: 'todo' } }));
  });

  const linkPlanos = modal.querySelector('#link-ir-planos');
  if (linkPlanos) linkPlanos.addEventListener('click', (e) => {
    e.preventDefault();
    fecharModal();
    document.dispatchEvent(new CustomEvent('strategya:mudar-aba', { detail: { aba: 'planos', grupo: 'planos' } }));
  });
}

async function criarPlanoDeAcao(supabase, empresaAtual, ata, { titulo, responsavel_id, quando }, tarefaId = null) {
  const payload = {
    empresa_id: empresaAtual.id,
    titulo,
    origem: 'rac',
    origem_id: ata.id,
    responsavel_id: responsavel_id || null,
    quando: quando || null,
    status: 'nao_iniciado',
  };
  const { data: plano, error } = await supabase.from('planos_acao').insert(payload).select().single();
  if (error) return toast('Erro ao criar plano de ação: ' + error.message, 'erro');
  if (tarefaId) await supabase.from('rac_acoes').update({ plano_acao_id: plano.id }).eq('id', tarefaId);
  toast(`Plano de ação ${plano.numero} criado com sucesso.`, 'sucesso');
  fecharModal();
  document.dispatchEvent(new CustomEvent('strategya:mudar-aba', { detail: { aba: 'planos', grupo: 'planos' } }));
}

function abrirFormulario(state, container, indicadores, membros, item = null) {
  const { supabase, empresaAtual } = state;
  const indicadoresSelecionados = new Map(); // indicador_id -> consideracoes
  const tarefasRef = { lista: [] };

  const modal = abrirModal(item ? 'Editar ata de reunião' : 'Nova ata de reunião', `
    <form id="form-ata">
      <div class="form-row">
        <div class="form-group">
          <label>Data</label>
          <input type="date" id="ata-data" required value="${item?.data || new Date().toISOString().slice(0, 10)}">
        </div>
        <div class="form-group">
          <label>Participantes</label>
          <input type="text" id="ata-participantes" value="${item ? escapeHtml(item.participantes || '') : ''}">
        </div>
      </div>
      <div class="form-group">
        <label>Indicadores tratados nesta reunião</label>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <select id="ata-indicador-select" style="flex:1"><option value="">Selecionar indicador...</option></select>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-add-indicador-sel"><i class="ti ti-plus"></i> Adicionar</button>
        </div>
        <div id="ata-indicadores-selecionados"></div>
      </div>
      <div class="form-group">
        <label>Pauta</label>
        <textarea id="ata-pauta">${item ? escapeHtml(item.pauta || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label>Considerações gerais</label>
        <textarea id="ata-consideracoes" placeholder="Considerações que não são específicas de um indicador...">${item ? escapeHtml(item.consideracoes || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label>Decisões</label>
        <textarea id="ata-decisoes">${item ? escapeHtml(item.decisoes || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label>Tarefas / Plano de Ação</label>
        ${item ? `
          <div id="ata-tarefas-lista"><p class="text-muted" style="font-size:12px">Carregando...</p></div>
          <div style="display:flex;gap:8px;align-items:flex-end;margin-top:8px;flex-wrap:wrap">
            <div style="flex:2;min-width:180px">
              <input type="text" id="ata-nova-tarefa" placeholder="Descrever tarefa ou assunto do plano de ação...">
            </div>
            <select id="ata-tarefa-responsavel" style="flex:1;min-width:160px">
              <option value="">Responsável</option>
              ${membros.map((m) => `<option value="${m.usuario_id}">${escapeHtml(m.nome || m.email)}</option>`).join('')}
            </select>
            <input type="date" id="ata-tarefa-prazo" style="max-width:150px">
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-add-tarefa"><i class="ti ti-plus"></i> Adicionar tarefa</button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-abrir-plano-direto"><i class="ti ti-clipboard-plus"></i> Abrir Plano de Ação</button>
          </div>
          <div style="margin-top:10px;display:flex;gap:16px">
            <a href="#" id="link-ir-todo" style="font-size:12px">Ver em Tarefas →</a>
            <a href="#" id="link-ir-planos" style="font-size:12px">Ver em Planos de Ação →</a>
          </div>
        ` : '<p class="text-muted">Salve a ata primeiro para adicionar tarefas ou abrir um plano de ação.</p>'}
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#btn-add-indicador-sel').addEventListener('click', () => {
    const select = modal.querySelector('#ata-indicador-select');
    if (!select.value) return;
    indicadoresSelecionados.set(select.value, '');
    renderSelectIndicadores(modal, indicadores, indicadoresSelecionados);
    renderIndicadoresSelecionados(modal, indicadores, indicadoresSelecionados);
  });

  (async () => {
    if (item) {
      const { data } = await supabase.from('rac_indicadores').select('indicador_id, consideracoes').eq('reuniao_id', item.id);
      (data || []).forEach((r) => indicadoresSelecionados.set(r.indicador_id, r.consideracoes || ''));
    }
    renderSelectIndicadores(modal, indicadores, indicadoresSelecionados);
    renderIndicadoresSelecionados(modal, indicadores, indicadoresSelecionados);
  })();

  if (item) {
    (async () => {
      tarefasRef.lista = await carregarTarefas(supabase, item);
      renderTarefas(modal, tarefasRef.lista, membros);
      wireTarefas(modal, state, item, membros, tarefasRef);
    })();
  }

  modal.querySelector('#form-ata').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = modal.querySelector('#ata-data').value;
    if (!dataValida(data)) return toast('Data da reunião inválida.', 'erro');
    const payload = {
      empresa_id: empresaAtual.id,
      data,
      participantes: modal.querySelector('#ata-participantes').value.trim(),
      pauta: modal.querySelector('#ata-pauta').value.trim(),
      consideracoes: modal.querySelector('#ata-consideracoes').value.trim(),
      decisoes: modal.querySelector('#ata-decisoes').value.trim(),
    };
    const query = item
      ? supabase.from('reunioes_analise_critica').update(payload).eq('id', item.id).select().single()
      : supabase.from('reunioes_analise_critica').insert(payload).select().single();
    const { data: salvo, error } = await query;
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');

    const selecionados = [...indicadoresSelecionados.entries()].map(([indicador_id, consideracoes]) => ({
      indicador_id, consideracoes: consideracoes?.trim() || null,
    }));
    await supabase.from('rac_indicadores').delete().eq('reuniao_id', salvo.id);
    if (selecionados.length) {
      const { error: errIndicadores } = await supabase.from('rac_indicadores')
        .insert(selecionados.map((s) => ({ reuniao_id: salvo.id, ...s })));
      if (errIndicadores) toast('Ata salva, mas houve erro ao vincular indicadores: ' + errIndicadores.message, 'erro');
    }

    toast('Ata salva com sucesso.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}

async function abrirAcoesTodo(state, containerPai, ata, membros) {
  const { supabase, empresaAtual } = state;
  const podeEditar = state.papelAtual !== 'usuario';
  const emailPorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));

  const { data: acoesData, error } = await supabase
    .from('rac_acoes')
    .select('*, planos_acao(numero)')
    .eq('reuniao_id', ata.id)
    .order('created_at');
  if (error) return toast('Erro ao carregar ações: ' + error.message, 'erro');
  let acoes = acoesData;

  const modal = abrirModal(`Tarefas — Ata de ${ata.data}`, `
    <div id="lista-acoes-todo"></div>
    ${podeEditar ? `
      <hr class="sep">
      <form id="form-acao-todo">
        <input type="hidden" id="acao-id">
        <div class="form-group">
          <label>Descrição da ação</label>
          <textarea id="acao-descricao" required></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Responsável</label>
            <select id="acao-responsavel">
              <option value="">—</option>
              ${membros.map((m) => `<option value="${m.usuario_id}">${escapeHtml(m.nome || m.email)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Prazo</label>
            <input type="date" id="acao-prazo">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><button class="btn btn-primary btn-block" type="submit" id="btn-salvar-acao-todo">Adicionar ação</button></div>
          <div class="form-group" id="grupo-cancelar-acao-todo" style="display:none">
            <button class="btn btn-secondary btn-block" type="button" id="btn-cancelar-acao-todo">Cancelar edição</button>
          </div>
        </div>
      </form>
    ` : ''}
  `);

  function renderListaAcoes() {
    const listaEl = modal.querySelector('#lista-acoes-todo');
    listaEl.innerHTML = acoes.length ? `
      <table class="table">
        <thead><tr><th></th><th>Descrição</th><th>Responsável</th><th>Prazo</th><th>Plano de Ação</th>${podeEditar ? '<th></th>' : ''}</tr></thead>
        <tbody>
          ${acoes.map((a) => `
            <tr>
              <td><input type="checkbox" data-toggle-concluida="${a.id}" ${a.concluida ? 'checked' : ''} ${podeEditar ? '' : 'disabled'}></td>
              <td style="${a.concluida ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${escapeHtml(a.descricao)}</td>
              <td>${escapeHtml(emailPorId.get(a.responsavel_id) || '—')}</td>
              <td>${a.prazo || '—'}</td>
              <td>${a.plano_acao_id
                ? `<span class="badge badge-neutral">${escapeHtml(a.planos_acao?.numero || 'vinculado')}</span>`
                : (podeEditar ? `<button class="icon-btn" data-abrir-plano="${a.id}" title="Abrir Plano de Ação"><i class="ti ti-clipboard-plus"></i></button>` : '—')}</td>
              ${podeEditar ? `<td class="table-actions">
                <button class="icon-btn" data-editar-acao="${a.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                <button class="icon-btn" data-excluir-acao="${a.id}" title="Excluir"><i class="ti ti-trash"></i></button>
              </td>` : ''}
            </tr>`).join('')}
        </tbody>
      </table>` : '<p class="text-muted">Nenhuma ação cadastrada ainda.</p>';

    listaEl.querySelectorAll('[data-toggle-concluida]').forEach((chk) => {
      chk.addEventListener('change', async () => {
        const { error: errUpd } = await supabase.from('rac_acoes').update({ concluida: chk.checked }).eq('id', chk.dataset.toggleConcluida);
        if (errUpd) return toast('Erro ao atualizar: ' + errUpd.message, 'erro');
        await recarregar();
      });
    });

    if (!podeEditar) return;

    listaEl.querySelectorAll('[data-abrir-plano]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const a = acoes.find((x) => x.id === btn.dataset.abrirPlano);
        const payload = {
          empresa_id: empresaAtual.id,
          titulo: a.descricao,
          origem: 'rac',
          origem_id: ata.id,
          responsavel_id: a.responsavel_id,
          quando: a.prazo,
          status: 'nao_iniciado',
        };
        const { data: plano, error: errPlano } = await supabase.from('planos_acao').insert(payload).select().single();
        if (errPlano) return toast('Erro ao criar plano de ação: ' + errPlano.message, 'erro');
        await supabase.from('rac_acoes').update({ plano_acao_id: plano.id }).eq('id', a.id);
        toast(`Plano de ação ${plano.numero} criado a partir desta ação.`, 'sucesso');
        fecharModal();
        document.dispatchEvent(new CustomEvent('strategya:mudar-aba', { detail: { aba: 'planos', grupo: 'planos' } }));
      });
    });

    listaEl.querySelectorAll('[data-editar-acao]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const a = acoes.find((x) => x.id === btn.dataset.editarAcao);
        modal.querySelector('#acao-id').value = a.id;
        modal.querySelector('#acao-descricao').value = a.descricao;
        modal.querySelector('#acao-responsavel').value = a.responsavel_id || '';
        modal.querySelector('#acao-prazo').value = a.prazo || '';
        modal.querySelector('#btn-salvar-acao-todo').textContent = 'Salvar edição';
        modal.querySelector('#grupo-cancelar-acao-todo').style.display = '';
        modal.querySelector('#acao-descricao').focus();
      });
    });

    listaEl.querySelectorAll('[data-excluir-acao]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmar('Excluir esta ação?'))) return;
        const { error: errDel } = await supabase.from('rac_acoes').delete().eq('id', btn.dataset.excluirAcao);
        if (errDel) return toast('Erro ao excluir: ' + errDel.message, 'erro');
        await recarregar();
      });
    });
  }

  async function recarregar() {
    const { data } = await supabase.from('rac_acoes').select('*, planos_acao(numero)').eq('reuniao_id', ata.id).order('created_at');
    acoes = data || [];
    renderListaAcoes();
  }

  renderListaAcoes();

  const form = modal.querySelector('#form-acao-todo');
  if (form) {
    const btnCancelar = modal.querySelector('#btn-cancelar-acao-todo');
    const grupoCancelar = modal.querySelector('#grupo-cancelar-acao-todo');
    const btnSalvar = modal.querySelector('#btn-salvar-acao-todo');

    btnCancelar.addEventListener('click', () => {
      form.reset();
      modal.querySelector('#acao-id').value = '';
      btnSalvar.textContent = 'Adicionar ação';
      grupoCancelar.style.display = 'none';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const prazo = modal.querySelector('#acao-prazo').value;
      if (prazo && !dataValida(prazo)) return toast('Prazo inválido.', 'erro');
      const acaoId = modal.querySelector('#acao-id').value;
      const payload = {
        reuniao_id: ata.id,
        descricao: modal.querySelector('#acao-descricao').value.trim(),
        responsavel_id: modal.querySelector('#acao-responsavel').value || null,
        prazo: prazo || null,
      };
      const query = acaoId
        ? supabase.from('rac_acoes').update(payload).eq('id', acaoId)
        : supabase.from('rac_acoes').insert(payload);
      const { error: errSalvar } = await query;
      if (errSalvar) return toast('Erro ao salvar ação: ' + errSalvar.message, 'erro');
      toast('Ação salva com sucesso.', 'sucesso');
      form.reset();
      modal.querySelector('#acao-id').value = '';
      btnSalvar.textContent = 'Adicionar ação';
      grupoCancelar.style.display = 'none';
      await recarregar();
    });
  }

  const overlay = document.getElementById('modal-overlay');
  const atualizarListaPai = () => render(containerPai, state);
  modal.querySelector('.modal-close').addEventListener('click', atualizarListaPai, { once: true });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) atualizarListaPai(); }, { once: true });
}
