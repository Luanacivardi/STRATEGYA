import { abrirModal, fecharModal, toast, escapeHtml, confirmar, dataValida, resolverNivel } from '../ui.js';
import { recarregarAcessoApuracoes } from '../app.js';

// Módulo "Gestão de Apurações": controla apenas o FLUXO de apurações/investigações corporativas
// (ISO 37301/37002/37001) — canal de origem, natureza, criticidade, prazos, status e resultado.
// Este módulo NÃO armazena evidências, documentos, e-mails, áudios ou vídeos: não há upload de
// arquivo em lugar nenhum aqui, de propósito. Toda documentação probatória fica sob
// responsabilidade do Jurídico/Compliance, em sistema próprio — aqui só se guarda o protocolo
// externo (texto), nunca o conteúdo. O resultado final é sempre preenchido manualmente pelo
// comitê: o sistema não calcula, sugere ou pontua procedência/culpa (sem julgamento automatizado).

const CANAL_LABEL = {
  canal_denuncia: 'Canal de Denúncia', auditoria_interna: 'Auditoria Interna', auditoria_externa: 'Auditoria Externa',
  gestao: 'Gestão', rh: 'RH', indicadores: 'Indicadores', outro: 'Outro',
};
const NATUREZA_LABEL = {
  fraude: 'Fraude', corrupcao_suborno: 'Corrupção/Suborno', conflito_interesse: 'Conflito de Interesse',
  assedio_discriminacao: 'Assédio/Discriminação', violacao_codigo_conduta: 'Violação ao Código de Conduta',
  saude_seguranca: 'Saúde e Segurança', protecao_dados: 'Proteção de Dados', financeiro_contabil: 'Financeiro/Contábil', outro: 'Outro',
};
const CRITICIDADE_LABEL = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
const CRITICIDADE_BADGE = { baixa: 'badge-neutral', media: 'badge-warning', alta: 'badge-danger', critica: 'badge-danger' };
const STATUS_LABEL = {
  recebida: 'Recebida', triagem: 'Em Triagem', em_apuracao: 'Em Apuração', aguardando_terceiros: 'Aguardando Terceiros',
  concluida: 'Concluída', arquivada: 'Arquivada',
};
const STATUS_BADGE = {
  recebida: 'badge-neutral', triagem: 'badge-warning', em_apuracao: 'badge-warning', aguardando_terceiros: 'badge-warning',
  concluida: 'badge-success', arquivada: 'badge-neutral',
};
const RESULTADO_LABEL = { procedente: 'Procedente', improcedente: 'Improcedente', parcialmente_procedente: 'Parcialmente Procedente', inconclusiva: 'Inconclusiva' };
const ENCAMINHAMENTO_LABEL = { nenhum: 'Nenhum', juridico: 'Jurídico', rh: 'RH', disciplinar: 'Disciplinar', conselho_administracao: 'Conselho de Administração' };
const PAPEL_COMITE_LABEL = { presidente: 'Presidente', membro: 'Membro', suplente: 'Suplente' };

let grupoAtivo = 'apuracoes'; // 'apuracoes' | 'comite'

const AVISO_ESCOPO = `
  <div class="alert alert-info" style="align-items:flex-start">
    <i class="ti ti-shield-lock" style="margin-top:2px"></i>
    <span>
      Este módulo controla apenas o <strong>fluxo</strong> da apuração. Não anexe evidências, documentos,
      e-mails, áudios ou vídeos aqui — a documentação probatória permanece sob responsabilidade exclusiva
      do Jurídico/Compliance, em sistema próprio. O resultado final é sempre uma decisão humana do comitê;
      o sistema não calcula ou sugere procedência/culpa.
    </span>
  </div>`;

function calcularDataLimite(apuracao) {
  if (!apuracao.data_recebimento || !apuracao.prazo_dias) return null;
  const d = new Date(apuracao.data_recebimento + 'T00:00:00');
  d.setDate(d.getDate() + apuracao.prazo_dias);
  return d.toISOString().slice(0, 10);
}

function estaAtrasada(apuracao) {
  if (['concluida', 'arquivada'].includes(apuracao.status)) return false;
  const limite = calcularDataLimite(apuracao);
  if (!limite) return false;
  return limite < new Date().toISOString().slice(0, 10);
}

async function usuarioTemAcesso(supabase, empresaId, userId, papelAtual) {
  if (papelAtual === 'orbeex') return true;
  const { data } = await supabase.from('apuracoes_comite_membros').select('id').eq('empresa_id', empresaId).eq('usuario_id', userId).eq('ativo', true).maybeSingle();
  return !!data;
}

function renderFiltrosGrupo(podeGerenciarComite) {
  return `
    <nav class="tabs">
      <button class="tab-btn ${grupoAtivo === 'apuracoes' ? 'active' : ''}" data-grupo="apuracoes"><i class="ti ti-list-details"></i> Apurações</button>
      ${podeGerenciarComite ? `<button class="tab-btn ${grupoAtivo === 'comite' ? 'active' : ''}" data-grupo="comite"><i class="ti ti-users-group"></i> Comitê de Apuração</button>` : ''}
    </nav>`;
}

export async function render(container, state) {
  const { supabase, empresaAtual, papelAtual, user } = state;
  const podeGerenciarComite = papelAtual === 'orbeex' || papelAtual === 'admin';
  const temAcesso = await usuarioTemAcesso(supabase, empresaAtual.id, user.id, papelAtual);

  if (grupoAtivo === 'comite' && podeGerenciarComite) return renderComite(container, state, podeGerenciarComite);

  if (!temAcesso) {
    container.innerHTML = `
      <div class="card">
        ${renderFiltrosGrupo(podeGerenciarComite)}
        <div class="empty-state">
          <i class="ti ti-lock"></i>
          Acesso restrito ao comitê de apuração desta empresa.
          ${podeGerenciarComite ? 'Use a aba "Comitê de Apuração" para se nomear ou nomear os responsáveis.' : 'Fale com o administrador da empresa para ser incluído no comitê, se for o caso.'}
        </div>
      </div>`;
    wireFiltrosGrupo(container, state, podeGerenciarComite);
    return;
  }

  return renderApuracoes(container, state, podeGerenciarComite);
}

function wireFiltrosGrupo(container, state, podeGerenciarComite) {
  container.querySelectorAll('[data-grupo]').forEach((btn) => {
    btn.addEventListener('click', () => { grupoAtivo = btn.dataset.grupo; render(container, state); });
  });
}

// ---------- COMITÊ DE APURAÇÃO ----------
async function renderComite(container, state, podeGerenciarComite) {
  const { supabase, empresaAtual } = state;

  container.innerHTML = `
    <div class="card">
      ${renderFiltrosGrupo(podeGerenciarComite)}
      <div class="alert alert-info" style="margin-top:1rem">
        <i class="ti ti-info-circle"></i>
        <span>Só quem estiver aqui (além do papel ORBEEX) enxerga e trata apurações desta empresa — isso protege contra conflito de interesse, já que nem todo administrador deveria ter acesso a apurações em andamento.</span>
      </div>
      <div id="comite-corpo" style="margin-top:1rem">Carregando...</div>
    </div>`;
  wireFiltrosGrupo(container, state, podeGerenciarComite);

  const area = container.querySelector('#comite-corpo');
  let membros, todosUsuarios;
  try {
    const [resMembros, resUsuarios] = await Promise.all([
      supabase.from('apuracoes_comite_membros').select('*').eq('empresa_id', empresaAtual.id),
      supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }),
    ]);
    if (resMembros.error) throw resMembros.error;
    membros = resMembros.data;
    todosUsuarios = resUsuarios.data || [];
  } catch (err) {
    area.innerHTML = `<div class="alert alert-warning">Erro ao carregar comitê: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const nomePorId = new Map(todosUsuarios.map((u) => [u.usuario_id, u.nome || u.email]));
  const jaNoComite = new Set(membros.map((m) => m.usuario_id));
  const disponiveis = todosUsuarios.filter((u) => !jaNoComite.has(u.usuario_id));

  area.innerHTML = `
    <table class="table">
      <thead><tr><th>Nome</th><th>Papel</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${membros.length ? membros.map((m) => `
          <tr>
            <td>${escapeHtml(nomePorId.get(m.usuario_id) || '—')}</td>
            <td><span class="badge badge-neutral">${PAPEL_COMITE_LABEL[m.papel]}</span></td>
            <td>${m.ativo ? '<span class="badge badge-success">Ativo</span>' : '<span class="badge badge-neutral">Inativo</span>'}</td>
            <td class="table-actions">
              <button class="icon-btn" data-toggle-ativo="${m.id}" data-valor="${!m.ativo}" title="${m.ativo ? 'Desativar' : 'Ativar'}"><i class="ti ${m.ativo ? 'ti-toggle-right' : 'ti-toggle-left'}"></i></button>
              <button class="icon-btn" data-remover="${m.id}" title="Remover do comitê"><i class="ti ti-trash"></i></button>
            </td>
          </tr>`).join('') : '<tr><td colspan="4" class="text-muted">Nenhum membro nomeado ainda.</td></tr>'}
      </tbody>
    </table>
    <form id="form-add-membro" class="form-row" style="margin-top:1rem;align-items:flex-end">
      <div class="form-group">
        <label>Adicionar ao comitê</label>
        <select id="am-usuario" required>
          <option value="">Selecione...</option>
          ${disponiveis.map((u) => `<option value="${u.usuario_id}">${escapeHtml(u.nome || u.email)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Papel</label>
        <select id="am-papel">
          ${Object.entries(PAPEL_COMITE_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><button class="btn btn-primary btn-block" type="submit">Adicionar</button></div>
    </form>
  `;

  area.querySelectorAll('[data-toggle-ativo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { error } = await supabase.from('apuracoes_comite_membros').update({ ativo: btn.dataset.valor === 'true' }).eq('id', btn.dataset.toggleAtivo);
      if (error) return toast('Erro: ' + error.message, 'erro');
      await recarregarAcessoApuracoes();
      renderComite(container, state, podeGerenciarComite);
    });
  });

  area.querySelectorAll('[data-remover]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Remover este membro do comitê de apuração?'))) return;
      const { error } = await supabase.from('apuracoes_comite_membros').delete().eq('id', btn.dataset.remover);
      if (error) return toast('Erro ao remover: ' + error.message, 'erro');
      await recarregarAcessoApuracoes();
      renderComite(container, state, podeGerenciarComite);
    });
  });

  area.querySelector('#form-add-membro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuario_id = area.querySelector('#am-usuario').value;
    const papel = area.querySelector('#am-papel').value;
    if (!usuario_id) return toast('Selecione um usuário.', 'erro');
    const { error } = await supabase.from('apuracoes_comite_membros').insert({ empresa_id: empresaAtual.id, usuario_id, papel });
    if (error) return toast('Erro ao adicionar: ' + error.message, 'erro');
    toast('Membro adicionado ao comitê.', 'sucesso');
    await recarregarAcessoApuracoes();
    renderComite(container, state, podeGerenciarComite);
  });
}

// ---------- LISTA DE APURAÇÕES ----------
async function renderApuracoes(container, state, podeGerenciarComite) {
  const { supabase, empresaAtual } = state;
  // Nível configurável dentro do comitê (migração 0078/0080): ser membro dá acesso, mas só quem
  // tem nível 'total' pode criar/editar/excluir — quem tem 'leitura' só visualiza.
  const podeEditar = resolverNivel(state, 'apuracoes') === 'total';

  let apuracoes, membrosComite, todosUsuarios;
  try {
    const [resApuracoes, resMembros, resUsuarios] = await Promise.all([
      supabase.from('apuracoes').select('*').eq('empresa_id', empresaAtual.id),
      supabase.from('apuracoes_comite_membros').select('*').eq('empresa_id', empresaAtual.id).eq('ativo', true),
      supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }),
    ]);
    if (resApuracoes.error) throw resApuracoes.error;
    apuracoes = [...resApuracoes.data].sort((a, b) => b.numero.localeCompare(a.numero));
    membrosComite = resMembros.data || [];
    todosUsuarios = resUsuarios.data || [];
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar apurações: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const nomePorId = new Map(todosUsuarios.map((u) => [u.usuario_id, u.nome || u.email]));
  const membrosComiteComNome = membrosComite.map((m) => ({ ...m, nome: nomePorId.get(m.usuario_id) || '—' }));

  function apuracoesFiltradas() {
    const fStatus = container.querySelector('#ap-filtro-status')?.value || '';
    const fNatureza = container.querySelector('#ap-filtro-natureza')?.value || '';
    const fCriticidade = container.querySelector('#ap-filtro-criticidade')?.value || '';
    return apuracoes.filter((a) => {
      if (fStatus && a.status !== fStatus) return false;
      if (fNatureza && a.natureza !== fNatureza) return false;
      if (fCriticidade && a.criticidade !== fCriticidade) return false;
      return true;
    });
  }

  function renderTabela() {
    const filtradas = apuracoesFiltradas();
    const area = container.querySelector('#apuracoes-tabela-area');
    area.innerHTML = filtradas.length ? `
      <table class="table">
        <thead><tr><th>Nº</th><th>Canal</th><th>Natureza</th><th>Criticidade</th><th>Status</th><th>Prazo</th><th>Relator</th><th></th></tr></thead>
        <tbody>
          ${filtradas.map((a) => `
            <tr>
              <td><span class="badge badge-neutral">${escapeHtml(a.numero)}</span>${a.confidencial ? ' <i class="ti ti-lock text-muted" title="Confidencial"></i>' : ''}</td>
              <td>${CANAL_LABEL[a.canal_origem]}</td>
              <td>${NATUREZA_LABEL[a.natureza]}</td>
              <td><span class="badge ${CRITICIDADE_BADGE[a.criticidade]}">${CRITICIDADE_LABEL[a.criticidade]}</span></td>
              <td><span class="badge ${STATUS_BADGE[a.status]}">${STATUS_LABEL[a.status]}</span></td>
              <td>${estaAtrasada(a) ? `<span class="badge badge-danger">Atrasada (${calcularDataLimite(a)})</span>` : (calcularDataLimite(a) || '—')}</td>
              <td>${escapeHtml(nomePorId.get(a.relator_id) || '—')}</td>
              <td class="table-actions">
                <button class="icon-btn" data-editar="${a.id}" title="${podeEditar ? 'Abrir' : 'Visualizar'}"><i class="ti ${podeEditar ? 'ti-pencil' : 'ti-eye'}"></i></button>
                ${podeEditar ? `<button class="icon-btn" data-excluir="${a.id}" title="Excluir"><i class="ti ti-trash"></i></button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<div class="empty-state"><i class="ti ti-list-details"></i>Nenhuma apuração encontrada.</div>';

    area.querySelectorAll('[data-editar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = apuracoes.find((a) => a.id === btn.dataset.editar);
        abrirFormulario(state, container, membrosComiteComNome, () => renderApuracoes(container, state, podeGerenciarComite), item, podeEditar);
      });
    });

    area.querySelectorAll('[data-excluir]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmar('Excluir esta apuração? O histórico e participações vinculados também serão apagados.'))) return;
        const { error } = await supabase.from('apuracoes').delete().eq('id', btn.dataset.excluir);
        if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
        toast('Apuração excluída.', 'sucesso');
        renderApuracoes(container, state, podeGerenciarComite);
      });
    });
  }

  container.innerHTML = `
    <div class="card">
      <div class="lista-toolbar">
        <span style="font-weight:700;font-size:14px;color:var(--navy-titulo)"><i class="ti ti-list-details"></i> Gestão de Apurações</span>
        <div class="lista-toolbar-acoes">
          ${podeEditar ? '<button class="btn btn-primary btn-sm" id="btn-add-apuracao"><i class="ti ti-plus"></i> Nova apuração</button>' : ''}
        </div>
      </div>
      ${renderFiltrosGrupo(podeGerenciarComite)}
      ${AVISO_ESCOPO}
      <div class="filters filters-compact" style="margin-top:1rem">
        <select id="ap-filtro-status" class="filter-select filter-select-sm">
          <option value="">Status</option>
          ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <select id="ap-filtro-natureza" class="filter-select filter-select-sm">
          <option value="">Natureza</option>
          ${Object.entries(NATUREZA_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <select id="ap-filtro-criticidade" class="filter-select filter-select-sm">
          <option value="">Criticidade</option>
          ${Object.entries(CRITICIDADE_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
      </div>
      <div id="apuracoes-tabela-area"></div>
    </div>
  `;

  wireFiltrosGrupo(container, state, podeGerenciarComite);
  renderTabela();

  container.querySelectorAll('#ap-filtro-status, #ap-filtro-natureza, #ap-filtro-criticidade').forEach((el) => {
    el.addEventListener('change', renderTabela);
  });

  container.querySelector('#btn-add-apuracao')?.addEventListener('click', () => {
    abrirFormulario(state, container, membrosComiteComNome, () => renderApuracoes(container, state, podeGerenciarComite), null, podeEditar);
  });
}

// ---------- FORMULÁRIO ----------
function abrirFormulario(state, container, membrosComite, aoSalvar, item = null, podeEditar = true) {
  const { supabase, empresaAtual, user } = state;

  const modal = abrirModal(item ? `Apuração ${escapeHtml(item.numero)}` : 'Nova apuração', `
    <form id="form-apuracao">
      ${AVISO_ESCOPO}
      <div class="form-row" style="margin-top:1rem">
        <div class="form-group">
          <label>Canal de origem</label>
          <select id="ap-canal" required>
            ${Object.entries(CANAL_LABEL).map(([v, l]) => `<option value="${v}" ${item?.canal_origem === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Natureza</label>
          <select id="ap-natureza" required>
            ${Object.entries(NATUREZA_LABEL).map(([v, l]) => `<option value="${v}" ${item?.natureza === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Criticidade</label>
          <select id="ap-criticidade">
            ${Object.entries(CRITICIDADE_LABEL).map(([v, l]) => `<option value="${v}" ${(item?.criticidade || 'media') === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Data de recebimento</label>
          <input type="date" id="ap-data-recebimento" required value="${item?.data_recebimento || new Date().toISOString().slice(0, 10)}">
        </div>
        <div class="form-group">
          <label>Prazo interno (dias)</label>
          <input type="number" min="1" id="ap-prazo-dias" required value="${item?.prazo_dias ?? 30}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-top:22px">
          <input type="checkbox" id="ap-confidencial" ${item ? (item.confidencial ? 'checked' : '') : 'checked'} style="width:auto">
          <label style="margin:0">Confidencial</label>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-top:22px">
          <input type="checkbox" id="ap-anonima" ${item?.denuncia_anonima ? 'checked' : ''} style="width:auto">
          <label style="margin:0">Denúncia anônima</label>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Status</label>
          <select id="ap-status">
            ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${(item?.status || 'recebida') === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="grupo-resultado" style="${item?.status === 'concluida' ? '' : 'display:none'}">
          <label>Resultado</label>
          <select id="ap-resultado">
            <option value="">—</option>
            ${Object.entries(RESULTADO_LABEL).map(([v, l]) => `<option value="${v}" ${item?.resultado === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Encaminhamento</label>
          <select id="ap-encaminhamento">
            ${Object.entries(ENCAMINHAMENTO_LABEL).map(([v, l]) => `<option value="${v}" ${(item?.encaminhamento || 'nenhum') === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Relator (comitê)</label>
          <select id="ap-relator">
            <option value="">—</option>
            ${membrosComite.map((m) => `<option value="${m.usuario_id}" ${item?.relator_id === m.usuario_id ? 'selected' : ''}>${escapeHtml(m.nome)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Referência do processo externo (Jurídico/Compliance)</label>
        <input type="text" id="ap-referencia" placeholder="Ex: protocolo nº 2026/0123" value="${item ? escapeHtml(item.referencia_processo_externo || '') : ''}">
        <p class="text-muted" style="font-size:12px;margin-top:4px">Apenas o número/protocolo — não anexe documentos aqui.</p>
      </div>
      <div class="form-group">
        <label>Resumo objetivo do fluxo (máx. 500 caracteres)</label>
        <textarea id="ap-resumo" maxlength="500">${item ? escapeHtml(item.resumo_objetivo || '') : ''}</textarea>
        <p class="text-muted" style="font-size:12px;margin-top:4px">Descreva o andamento de forma objetiva, sem detalhar identidades ou conteúdo probatório.</p>
      </div>
      <div class="form-group" id="grupo-data-conclusao" style="${item?.status === 'concluida' || item?.status === 'arquivada' ? '' : 'display:none'}">
        <label>Data de conclusão</label>
        <input type="date" id="ap-data-conclusao" value="${item?.data_conclusao || ''}">
      </div>
      ${item ? '<div id="ap-participantes-area"></div><div id="ap-historico-area"></div>' : ''}
      ${podeEditar ? '<button class="btn btn-primary btn-block" type="submit">Salvar</button>' : ''}
    </form>
  `);
  modal.classList.add('modal-xl');

  if (!podeEditar) {
    modal.querySelectorAll('#form-apuracao input, #form-apuracao select, #form-apuracao textarea').forEach((el) => { el.disabled = true; });
  }

  modal.querySelector('#ap-status').addEventListener('change', (e) => {
    const concluidaOuArquivada = ['concluida', 'arquivada'].includes(e.target.value);
    modal.querySelector('#grupo-resultado').style.display = e.target.value === 'concluida' ? '' : 'none';
    modal.querySelector('#grupo-data-conclusao').style.display = concluidaOuArquivada ? '' : 'none';
  });

  if (item) {
    montarParticipantes(state, modal, item, membrosComite, podeEditar);
    montarHistorico(state, modal, item);
  }

  if (!podeEditar) return;

  modal.querySelector('#form-apuracao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dataRecebimento = modal.querySelector('#ap-data-recebimento').value;
    if (!dataValida(dataRecebimento)) return toast('Data de recebimento inválida.', 'erro');
    const statusNovo = modal.querySelector('#ap-status').value;
    const dataConclusao = modal.querySelector('#ap-data-conclusao').value || null;
    if (dataConclusao && !dataValida(dataConclusao)) return toast('Data de conclusão inválida.', 'erro');

    const payload = {
      empresa_id: empresaAtual.id,
      canal_origem: modal.querySelector('#ap-canal').value,
      natureza: modal.querySelector('#ap-natureza').value,
      criticidade: modal.querySelector('#ap-criticidade').value,
      confidencial: modal.querySelector('#ap-confidencial').checked,
      denuncia_anonima: modal.querySelector('#ap-anonima').checked,
      data_recebimento: dataRecebimento,
      prazo_dias: Number(modal.querySelector('#ap-prazo-dias').value) || 30,
      status: statusNovo,
      resultado: statusNovo === 'concluida' ? (modal.querySelector('#ap-resultado').value || null) : null,
      encaminhamento: modal.querySelector('#ap-encaminhamento').value,
      relator_id: modal.querySelector('#ap-relator').value || null,
      referencia_processo_externo: modal.querySelector('#ap-referencia').value.trim() || null,
      resumo_objetivo: modal.querySelector('#ap-resumo').value.trim() || null,
      data_conclusao: dataConclusao,
    };
    if (!item) payload.created_by = user.id;

    const query = item
      ? supabase.from('apuracoes').update(payload).eq('id', item.id).select().single()
      : supabase.from('apuracoes').insert(payload).select().single();
    const { data: salvo, error } = await query;
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');

    if (item && item.status !== statusNovo) {
      await supabase.from('apuracoes_historico').insert({
        apuracao_id: salvo.id, usuario_id: user.id, status_anterior: item.status, status_novo: statusNovo,
      });
    }

    toast('Apuração salva com sucesso.', 'sucesso');
    fecharModal();
    aoSalvar();
  });
}

// ---------- PARTICIPANTES E CONFLITO DE INTERESSE ----------
async function montarParticipantes(state, modal, apuracao, membrosComite, podeEditar = true) {
  const { supabase } = state;
  const area = modal.querySelector('#ap-participantes-area');

  const { data: participantesData, error } = await supabase.from('apuracoes_participantes').select('*').eq('apuracao_id', apuracao.id);
  if (error) return toast('Erro ao carregar participantes: ' + error.message, 'erro');
  let participantes = participantesData || [];
  const nomePorId = new Map(membrosComite.map((m) => [m.usuario_id, m.nome]));

  function renderLista() {
    const jaParticipam = new Set(participantes.map((p) => p.usuario_id));
    const disponiveis = membrosComite.filter((m) => !jaParticipam.has(m.usuario_id));
    area.innerHTML = `
      <div class="form-group">
        <label>Participantes e declaração de conflito de interesse</label>
        <table class="table">
          <thead><tr><th>Membro</th><th>Conflito declarado</th><th>Afastado</th><th></th></tr></thead>
          <tbody>
            ${participantes.length ? participantes.map((p) => `
              <tr>
                <td>${escapeHtml(nomePorId.get(p.usuario_id) || '—')}</td>
                <td>${p.conflito_interesse_declarado ? '<span class="badge badge-danger">Sim</span>' : '<span class="badge badge-neutral">Não</span>'}</td>
                <td>${p.afastado ? '<span class="badge badge-warning">Sim</span>' : '<span class="badge badge-neutral">Não</span>'}</td>
                <td class="table-actions">${podeEditar ? `<button type="button" class="icon-btn" data-remover-participante="${p.id}"><i class="ti ti-trash"></i></button>` : ''}</td>
              </tr>`).join('') : '<tr><td colspan="4" class="text-muted">Nenhum participante registrado.</td></tr>'}
          </tbody>
        </table>
        ${podeEditar && disponiveis.length ? `
          <div class="form-row" style="align-items:flex-end">
            <div class="form-group">
              <label style="font-weight:400;font-size:12px">Adicionar participante</label>
              <select id="part-usuario">${disponiveis.map((m) => `<option value="${m.usuario_id}">${escapeHtml(m.nome)}</option>`).join('')}</select>
            </div>
            <div class="form-group" style="display:flex;align-items:center;gap:6px">
              <input type="checkbox" id="part-conflito" style="width:auto"><label style="margin:0;font-size:12px">Declara conflito de interesse</label>
            </div>
            <div class="form-group"><button type="button" class="btn btn-secondary btn-block" id="btn-add-participante">Adicionar</button></div>
          </div>` : ''}
      </div>`;

    area.querySelectorAll('[data-remover-participante]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const { error: errDel } = await supabase.from('apuracoes_participantes').delete().eq('id', btn.dataset.removerParticipante);
        if (errDel) return toast('Erro: ' + errDel.message, 'erro');
        await recarregar();
      });
    });

    const btnAdd = area.querySelector('#btn-add-participante');
    if (btnAdd) btnAdd.addEventListener('click', async () => {
      const usuario_id = area.querySelector('#part-usuario').value;
      const conflito = area.querySelector('#part-conflito').checked;
      const { error: errIns } = await supabase.from('apuracoes_participantes').insert({
        apuracao_id: apuracao.id, usuario_id, conflito_interesse_declarado: conflito, afastado: conflito,
      });
      if (errIns) return toast('Erro ao adicionar: ' + errIns.message, 'erro');
      await recarregar();
    });
  }

  async function recarregar() {
    const { data } = await supabase.from('apuracoes_participantes').select('*').eq('apuracao_id', apuracao.id);
    participantes = data || [];
    renderLista();
  }

  renderLista();
}

// ---------- HISTÓRICO (TRILHA DE AUDITORIA) ----------
async function montarHistorico(state, modal, apuracao) {
  const { supabase } = state;
  const area = modal.querySelector('#ap-historico-area');

  const { data: historico, error } = await supabase.from('apuracoes_historico').select('*').eq('apuracao_id', apuracao.id).order('created_at', { ascending: false });
  if (error) return toast('Erro ao carregar histórico: ' + error.message, 'erro');

  area.innerHTML = `
    <div class="form-group">
      <label>Histórico de status</label>
      ${(historico || []).length ? `
        <table class="table">
          <thead><tr><th>De</th><th>Para</th><th>Quando</th></tr></thead>
          <tbody>
            ${historico.map((h) => `
              <tr>
                <td>${h.status_anterior ? STATUS_LABEL[h.status_anterior] : '—'}</td>
                <td><span class="badge ${STATUS_BADGE[h.status_novo]}">${STATUS_LABEL[h.status_novo]}</span></td>
                <td>${new Date(h.created_at).toLocaleString('pt-BR')}</td>
              </tr>`).join('')}
          </tbody>
        </table>` : '<p class="text-muted" style="font-size:12px">Nenhuma mudança de status registrada ainda.</p>'}
    </div>`;
}
