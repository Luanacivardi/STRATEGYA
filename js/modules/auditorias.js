import { abrirModal, fecharModal, toast, escapeHtml, confirmar, dataValida, imprimirSecao, enviarPorEmail } from '../ui.js';

// Módulo "Gestão de Auditorias Corporativas" (ISO 9001/14001/45001): solicitação → priorização
// (IPA) → planejamento inteligente → distribuição automática de horas → agenda automática →
// designação de auditores → execução → resultados → relatório → aprovação → geração automática
// de ação (integrado a Gestão de Ações).
//
// Ver comentário no topo da migration 0048_gestao_auditorias.sql para as decisões de design do
// IPA (normalização 0-100 por critério) e da "pontuação do processo" usada na distribuição de horas.

const TIPO_LABEL = {
  interna: 'Interna', externa: 'Externa', cliente: 'Cliente', fornecedor: 'Fornecedor',
  certificacao: 'Certificação', manutencao: 'Manutenção', recertificacao: 'Recertificação', extraordinaria: 'Extraordinária', outro: 'Outro',
};
const MODALIDADE_LABEL = { individual: 'Individual', integrada: 'Integrada' };
const NORMA_LABEL = { iso9001: 'ISO 9001', iso14001: 'ISO 14001', iso45001: 'ISO 45001', outra: 'Outra' };
const STATUS_LABEL = {
  solicitada: 'Solicitada', priorizada: 'Priorizada', planejada: 'Planejada', agendada: 'Agendada',
  em_execucao: 'Em Execução', concluida: 'Concluída', em_aprovacao: 'Em Aprovação', aprovada: 'Aprovada', reprovada: 'Reprovada', arquivada: 'Arquivada',
};
const STATUS_BADGE = {
  solicitada: 'badge-neutral', priorizada: 'badge-warning', planejada: 'badge-warning', agendada: 'badge-warning',
  em_execucao: 'badge-warning', concluida: 'badge-success', em_aprovacao: 'badge-warning', aprovada: 'badge-success', reprovada: 'badge-danger', arquivada: 'badge-neutral',
};
const PRIORIDADE_LABEL = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
const PRIORIDADE_BADGE = { baixa: 'badge-neutral', media: 'badge-warning', alta: 'badge-danger', critica: 'badge-danger' };
const FREQUENCIA_LABEL = { anual: 'Anual', semestral: 'Semestral', trimestral: 'Trimestral', mensal: 'Mensal' };
const RESULTADO_LABEL = { conforme: 'Conforme', nc_maior: 'NC Maior', nc_menor: 'NC Menor', observacao: 'Observação', oportunidade_melhoria: 'Oportunidade de Melhoria' };
const RESULTADO_BADGE = { conforme: 'badge-success', nc_maior: 'badge-danger', nc_menor: 'badge-warning', observacao: 'badge-neutral', oportunidade_melhoria: 'badge-neutral' };
const CONCLUSAO_LABEL = { aprovado: 'Aprovado', aprovado_ressalvas: 'Aprovado com Ressalvas', reprovado: 'Reprovado' };
const ETAPA_LABEL = { auditor: 'Auditor', auditor_lider: 'Auditor Líder', gestor_area: 'Gestor da Área', sgi: 'SGI', diretoria: 'Diretoria' };
const NIVEL_COMPETENCIA_LABEL = { auditor_interno: 'Auditor Interno', auditor_lider: 'Auditor Líder', auditor_externo: 'Auditor Externo' };

let grupoAtivo = 'auditorias'; // 'auditorias' | 'processos' | 'turnos' | 'auditores' | 'dashboard'

function renderFiltrosGrupo() {
  return `
    <div class="filters">
      <button class="filter-btn ${grupoAtivo === 'auditorias' ? 'active' : ''}" data-grupo="auditorias"><i class="ti ti-clipboard-check"></i> Auditorias</button>
      <button class="filter-btn ${grupoAtivo === 'processos' ? 'active' : ''}" data-grupo="processos"><i class="ti ti-sitemap"></i> Processos Auditáveis</button>
      <button class="filter-btn ${grupoAtivo === 'turnos' ? 'active' : ''}" data-grupo="turnos"><i class="ti ti-clock"></i> Turnos</button>
      <button class="filter-btn ${grupoAtivo === 'auditores' ? 'active' : ''}" data-grupo="auditores"><i class="ti ti-users"></i> Auditores</button>
      <button class="filter-btn ${grupoAtivo === 'dashboard' ? 'active' : ''}" data-grupo="dashboard"><i class="ti ti-chart-bar"></i> Dashboard</button>
    </div>`;
}
function wireFiltrosGrupo(container, state) {
  container.querySelectorAll('[data-grupo]').forEach((btn) => {
    btn.addEventListener('click', () => { grupoAtivo = btn.dataset.grupo; render(container, state); });
  });
}

export async function render(container, state) {
  if (grupoAtivo === 'processos') return renderProcessos(container, state);
  if (grupoAtivo === 'turnos') return renderTurnos(container, state);
  if (grupoAtivo === 'auditores') return renderAuditores(container, state);
  if (grupoAtivo === 'dashboard') return renderDashboard(container, state);
  return renderAuditorias(container, state);
}

// ==================== CÁLCULO DO IPA ====================
// Cada critério é normalizado para 0-100 (valor/valor_máximo) antes de aplicar o peso, já que os
// critérios têm escalas máximas diferentes entre si. "Mudanças recentes" cobre o peso de 15%
// atribuído a "Aspectos Ambientais" no escopo original (ver nota na migration).
function calcularIPAProcesso(p) {
  const criticidadePts = { baixa: 1, media: 3, alta: 5 }[p.criticidade] ?? 1;
  const ncPts = { nenhuma: 1, ate_3: 3, mais_3: 5 }[p.historico_ncs] ?? 1;
  const mudancasPts = p.mudancas_recentes ? 3 : 0;
  const requisitosPts = p.requisitos_legais ? 5 : 0;
  const acidentesPts = p.acidentes ? 5 : 0;
  const reclamacoesPts = p.reclamacoes ? 3 : 0;

  const norm = (valor, max) => (valor / max) * 100;
  const ipa =
    norm(criticidadePts, 5) * 0.30 +
    norm(ncPts, 5) * 0.25 +
    norm(mudancasPts, 3) * 0.15 +
    norm(acidentesPts, 5) * 0.15 +
    norm(requisitosPts, 5) * 0.10 +
    norm(reclamacoesPts, 3) * 0.05;

  return Math.round(ipa * 100) / 100;
}

function classificarIPA(ipa) {
  if (ipa <= 30) return 'baixa';
  if (ipa <= 60) return 'media';
  if (ipa <= 80) return 'alta';
  return 'critica';
}
const FREQUENCIA_POR_CLASSIFICACAO = { baixa: 'anual', media: 'semestral', alta: 'trimestral', critica: 'mensal' };

// ==================== DISTRIBUIÇÃO AUTOMÁTICA DE HORAS ====================
// Distribui horasTotais entre os processos proporcionalmente à pontuação (IPA), respeitando
// horasMin/horasMax por processo — quem estoura o limite fica fixo nele, e o excedente/falta é
// redistribuído proporcionalmente entre os processos ainda "livres", em até algumas iterações.
function distribuirHoras(processos, horasTotais, horasMin, horasMax) {
  const itens = processos.map((p) => ({ ...p, fixado: false, horas: 0 }));
  const somaPontuacao = () => itens.filter((i) => !i.fixado).reduce((s, i) => s + i.pontuacao, 0);
  let horasRestantes = horasTotais;

  for (let iter = 0; iter < itens.length + 1; iter++) {
    const livres = itens.filter((i) => !i.fixado);
    if (!livres.length) break;
    const soma = somaPontuacao() || 1;
    let estourou = false;
    livres.forEach((i) => {
      i.horas = (i.pontuacao / soma) * horasRestantes;
    });
    livres.forEach((i) => {
      if (horasMax && i.horas > horasMax) { i.horas = horasMax; i.fixado = true; estourou = true; }
      else if (i.horas < horasMin) { i.horas = horasMin; i.fixado = true; estourou = true; }
    });
    if (!estourou) break;
    horasRestantes = horasTotais - itens.filter((i) => i.fixado).reduce((s, i) => s + i.horas, 0);
  }

  return itens.map((i) => ({ processo_id: i.id, pontuacao: i.pontuacao, horas: Math.round(i.horas * 100) / 100 }));
}

// Divide as horas de cada processo, igualmente, entre os turnos vinculados a ele.
function distribuirPorTurnos(distribuicaoProcessos, processosPorId, turnosPorProcesso) {
  const linhas = [];
  distribuicaoProcessos.forEach((d) => {
    const turnos = turnosPorProcesso.get(d.processo_id) || [];
    if (!turnos.length) return;
    const horasPorTurno = Math.round((d.horas / turnos.length) * 100) / 100;
    turnos.forEach((turnoId) => linhas.push({ processo_id: d.processo_id, turno_id: turnoId, horas: horasPorTurno }));
  });
  return linhas;
}

// ==================== GERAÇÃO AUTOMÁTICA DE AGENDA ====================
function horaParaMinutos(hora) { const [h, m] = hora.split(':').map(Number); return h * 60 + m; }
function minutosParaHora(min) { const h = Math.floor(min / 60) % 24; const m = min % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

function gerarAgenda(auditoria, distribuicaoTurnos, nomeProcesso, nomeTurno) {
  const entrada = horaParaMinutos(auditoria.hora_entrada);
  const saida = horaParaMinutos(auditoria.hora_saida);
  const almocoInicio = horaParaMinutos(auditoria.almoco_inicio);
  const almocoFim = horaParaMinutos(auditoria.almoco_fim);
  const dias = auditoria.dias || 1;

  // Fila de blocos processo+turno a alocar (em minutos), na ordem recebida.
  const fila = distribuicaoTurnos.map((d) => ({ ...d, minutosRestantes: Math.round(d.horas * 60) }));

  const blocos = [];
  let filaIdx = 0;

  for (let dia = 1; dia <= dias; dia++) {
    let cursor = entrada;
    const fimUtil = saida - auditoria.tempo_consolidacao_min - (dia === dias ? auditoria.tempo_encerramento_min : 0);

    if (dia === 1) {
      blocos.push({ dia, hora_inicio: minutosParaHora(cursor), hora_fim: minutosParaHora(cursor + auditoria.tempo_abertura_min), tipo: 'abertura', rotulo: 'Reunião de abertura' });
      cursor += auditoria.tempo_abertura_min;
    }

    while (cursor < fimUtil && filaIdx < fila.length) {
      // Pula o horário de almoço.
      if (cursor >= almocoInicio && cursor < almocoFim) {
        blocos.push({ dia, hora_inicio: minutosParaHora(cursor), hora_fim: minutosParaHora(almocoFim), tipo: 'almoco', rotulo: 'Almoço' });
        cursor = almocoFim;
        continue;
      }
      const proximoLimite = (cursor < almocoInicio) ? Math.min(almocoInicio, fimUtil) : fimUtil;
      let disponivel = proximoLimite - cursor;
      if (disponivel <= 0) break;

      const item = fila[filaIdx];
      const duracao = Math.min(item.minutosRestantes, disponivel);
      if (duracao <= 0) { filaIdx++; continue; }

      blocos.push({
        dia, hora_inicio: minutosParaHora(cursor), hora_fim: minutosParaHora(cursor + duracao), tipo: 'processo',
        processo_id: item.processo_id, turno_id: item.turno_id,
        rotulo: `${nomeProcesso(item.processo_id)} — ${nomeTurno(item.turno_id)}`,
      });
      cursor += duracao;
      // Deslocamento entre áreas (tempo consumido silenciosamente, sem virar linha própria na agenda).
      if (auditoria.tempo_deslocamento_min) cursor += auditoria.tempo_deslocamento_min;
      item.minutosRestantes -= duracao;
      if (item.minutosRestantes <= 0) filaIdx++;
    }

    blocos.push({ dia, hora_inicio: minutosParaHora(fimUtil), hora_fim: minutosParaHora(fimUtil + auditoria.tempo_consolidacao_min), tipo: 'consolidacao', rotulo: 'Consolidação das evidências' });
    if (dia === dias) {
      const inicioEncerramento = fimUtil + auditoria.tempo_consolidacao_min;
      blocos.push({ dia, hora_inicio: minutosParaHora(inicioEncerramento), hora_fim: minutosParaHora(inicioEncerramento + auditoria.tempo_encerramento_min), tipo: 'encerramento', rotulo: 'Reunião de encerramento' });
    }
  }

  return blocos;
}

// Sugere um auditor por bloco de processo, em rodízio (round-robin) entre os membros da equipe
// designada, pulando quem tem impedimento de área para aquele processo específico. É só uma
// sugestão para agilizar a execução — o comitê pode trocar manualmente quando quiser.
// Auditoria interna sempre sugere 2 auditores por processo (dupla verificação) — dobrarParaDois
// vem de auditoria.tipo === 'interna'.
function sugerirAuditoresPorBloco(blocos, equipeComAuditor, processosPorId, dobrarParaDois) {
  let indiceRodizio = 0;
  return blocos.map((b) => {
    if (b.tipo !== 'processo') return b;
    const processo = processosPorId.get(b.processo_id);
    const elegiveis = equipeComAuditor.filter((e) => {
      if (!e.area_atuacao || !processo?.area) return true;
      return e.area_atuacao.trim().toLowerCase() !== processo.area.trim().toLowerCase();
    });
    if (!elegiveis.length) return { ...b, auditor_sugerido_id: null, auditor_sugerido_2_id: null };
    const escolhido1 = elegiveis[indiceRodizio % elegiveis.length];
    indiceRodizio++;
    let escolhido2 = null;
    if (dobrarParaDois && elegiveis.length > 1) {
      escolhido2 = elegiveis[indiceRodizio % elegiveis.length];
      indiceRodizio++;
    }
    return { ...b, auditor_sugerido_id: escolhido1.auditor_id, auditor_sugerido_2_id: escolhido2?.auditor_id || null };
  });
}

// ==================== CARREGAMENTO COMUM ====================
async function carregarBaseCadastros(supabase, empresaId) {
  const [{ data: processos }, { data: turnos }, { data: processosTurnos }, { data: auditores }] = await Promise.all([
    supabase.from('auditorias_processos').select('*').eq('empresa_id', empresaId),
    supabase.from('auditorias_turnos').select('*').eq('empresa_id', empresaId),
    supabase.from('auditorias_processos_turnos').select('*'),
    supabase.from('auditores').select('*, auditores_competencias(*)').eq('empresa_id', empresaId),
  ]);
  return { processos: processos || [], turnos: turnos || [], processosTurnos: processosTurnos || [], auditores: auditores || [] };
}

// ==================== TAB: TURNOS ====================
async function renderTurnos(container, state) {
  const { supabase, empresaAtual } = state;
  container.innerHTML = `<div class="card">${renderFiltrosGrupo()}<div id="at-corpo" style="margin-top:1rem">Carregando...</div></div>`;
  wireFiltrosGrupo(container, state);
  const area = container.querySelector('#at-corpo');

  const { data: turnos, error } = await supabase.from('auditorias_turnos').select('*').eq('empresa_id', empresaAtual.id).order('hora_inicio');
  if (error) { area.innerHTML = `<div class="alert alert-warning">Erro: ${escapeHtml(error.message)}</div>`; return; }

  area.innerHTML = `
    <table class="table">
      <thead><tr><th>Nome</th><th>Início</th><th>Fim</th><th></th></tr></thead>
      <tbody>
        ${(turnos || []).map((t) => `
          <tr>
            <td>${escapeHtml(t.nome)}</td><td>${t.hora_inicio.slice(0, 5)}</td><td>${t.hora_fim.slice(0, 5)}</td>
            <td class="table-actions">
              <button class="icon-btn" data-editar="${t.id}" title="Editar"><i class="ti ti-pencil"></i></button>
              <button class="icon-btn" data-excluir="${t.id}" title="Excluir"><i class="ti ti-trash"></i></button>
            </td>
          </tr>`).join('') || '<tr><td colspan="4" class="text-muted">Nenhum turno cadastrado.</td></tr>'}
      </tbody>
    </table>
    <form id="form-turno" class="form-row" style="margin-top:1rem;align-items:flex-end">
      <div class="form-group"><label>Nome do turno</label><input type="text" id="tn-nome" placeholder="Ex: Turno 1" required></div>
      <div class="form-group"><label>Início</label><input type="time" id="tn-inicio" required></div>
      <div class="form-group"><label>Fim</label><input type="time" id="tn-fim" required></div>
      <div class="form-group"><button class="btn btn-primary btn-block" type="submit" id="btn-salvar-turno">Adicionar</button></div>
      <div class="form-group" id="grupo-cancelar-turno" style="display:none"><button type="button" class="btn btn-secondary btn-block" id="btn-cancelar-turno">Cancelar edição</button></div>
    </form>
  `;

  const form = area.querySelector('#form-turno');
  const btnSalvar = area.querySelector('#btn-salvar-turno');
  const grupoCancelar = area.querySelector('#grupo-cancelar-turno');
  let editandoId = null;

  function limparFormulario() {
    form.reset();
    editandoId = null;
    btnSalvar.textContent = 'Adicionar';
    grupoCancelar.style.display = 'none';
  }

  area.querySelectorAll('[data-editar]').forEach((btn) => btn.addEventListener('click', () => {
    const t = (turnos || []).find((x) => x.id === btn.dataset.editar);
    if (!t) return;
    editandoId = t.id;
    area.querySelector('#tn-nome').value = t.nome;
    area.querySelector('#tn-inicio').value = t.hora_inicio.slice(0, 5);
    area.querySelector('#tn-fim').value = t.hora_fim.slice(0, 5);
    btnSalvar.textContent = 'Salvar edição';
    grupoCancelar.style.display = '';
    area.querySelector('#tn-nome').focus();
  }));
  area.querySelector('#btn-cancelar-turno').addEventListener('click', limparFormulario);

  area.querySelectorAll('[data-excluir]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!(await confirmar('Excluir este turno?'))) return;
    const { error: errDel } = await supabase.from('auditorias_turnos').delete().eq('id', btn.dataset.excluir);
    if (errDel) return toast('Erro ao excluir: ' + errDel.message, 'erro');
    renderTurnos(container, state);
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      empresa_id: empresaAtual.id,
      nome: area.querySelector('#tn-nome').value.trim(),
      hora_inicio: area.querySelector('#tn-inicio').value,
      hora_fim: area.querySelector('#tn-fim').value,
    };
    const query = editandoId
      ? supabase.from('auditorias_turnos').update(payload).eq('id', editandoId)
      : supabase.from('auditorias_turnos').insert(payload);
    const { error: errSalvar } = await query;
    if (errSalvar) return toast('Erro ao salvar: ' + errSalvar.message, 'erro');
    toast(editandoId ? 'Turno atualizado.' : 'Turno adicionado.', 'sucesso');
    renderTurnos(container, state);
  });
}

// ==================== TAB: PROCESSOS AUDITÁVEIS ====================
async function renderProcessos(container, state) {
  const { supabase, empresaAtual } = state;
  container.innerHTML = `
    <div class="card">
      ${renderFiltrosGrupo()}
      <div class="lista-toolbar" style="margin-top:1rem">
        <span></span>
        <button class="btn btn-primary btn-sm" id="btn-add-processo"><i class="ti ti-plus"></i> Novo processo</button>
      </div>
      <div id="ap-corpo">Carregando...</div>
    </div>`;
  wireFiltrosGrupo(container, state);
  const area = container.querySelector('#ap-corpo');

  const [{ processos, turnos, processosTurnos }, { data: macrofluxo }] = await Promise.all([
    carregarBaseCadastros(supabase, empresaAtual.id),
    supabase.from('macrofluxo_processos').select('nome').eq('empresa_id', empresaAtual.id).order('ordem'),
  ]);
  const turnosPorProcesso = new Map();
  processosTurnos.forEach((pt) => { const l = turnosPorProcesso.get(pt.processo_id) || []; l.push(pt.turno_id); turnosPorProcesso.set(pt.processo_id, l); });
  const nomeTurno = (id) => turnos.find((t) => t.id === id)?.nome || '—';
  const nomesMacrofluxo = [...new Set((macrofluxo || []).map((m) => m.nome))];

  area.innerHTML = processos.length ? `
    <table class="table">
      <thead><tr><th>Processo</th><th>Área</th><th>Normas</th><th>Criticidade</th><th>Turnos vinculados</th><th>IPA</th><th></th></tr></thead>
      <tbody>
        ${processos.map((p) => {
          const ipa = calcularIPAProcesso(p);
          return `
          <tr>
            <td>${escapeHtml(p.nome)}</td>
            <td>${escapeHtml(p.area || '—')}</td>
            <td>${(p.normas || []).map((n) => NORMA_LABEL[n]).join(', ') || '—'}</td>
            <td><span class="badge badge-neutral">${p.criticidade}</span></td>
            <td>${(turnosPorProcesso.get(p.id) || []).map((tid) => escapeHtml(nomeTurno(tid))).join(', ') || '—'}</td>
            <td><span class="badge ${PRIORIDADE_BADGE[classificarIPA(ipa)]}">${ipa.toFixed(1)} (${PRIORIDADE_LABEL[classificarIPA(ipa)]})</span></td>
            <td class="table-actions">
              <button class="icon-btn" data-editar="${p.id}" title="Editar"><i class="ti ti-pencil"></i></button>
              <button class="icon-btn" data-excluir="${p.id}" title="Excluir"><i class="ti ti-trash"></i></button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '<div class="empty-state"><i class="ti ti-sitemap"></i>Nenhum processo auditável cadastrado.</div>';

  area.querySelectorAll('[data-editar]').forEach((btn) => btn.addEventListener('click', () => {
    abrirFormularioProcesso(state, container, turnos, turnosPorProcesso, nomesMacrofluxo, processos.find((p) => p.id === btn.dataset.editar));
  }));
  area.querySelectorAll('[data-excluir]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!(await confirmar('Excluir este processo auditável?'))) return;
    const { error } = await supabase.from('auditorias_processos').delete().eq('id', btn.dataset.excluir);
    if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
    renderProcessos(container, state);
  }));
  container.querySelector('#btn-add-processo').addEventListener('click', () => abrirFormularioProcesso(state, container, turnos, turnosPorProcesso, nomesMacrofluxo));
}

function abrirFormularioProcesso(state, container, turnos, turnosPorProcesso, nomesMacrofluxo, item = null) {
  const { supabase, empresaAtual } = state;
  const turnosVinculados = new Set(item ? (turnosPorProcesso.get(item.id) || []) : []);

  const modal = abrirModal(item ? 'Editar processo auditável' : 'Novo processo auditável', `
    <form id="form-processo">
      <div class="form-row">
        <div class="form-group">
          <label>Processo</label>
          <input type="text" id="pr-nome" list="dl-processos-macrofluxo" required value="${item ? escapeHtml(item.nome) : ''}" placeholder="Selecione um processo do Macrofluxo ou digite um novo">
          <datalist id="dl-processos-macrofluxo">${nomesMacrofluxo.map((n) => `<option value="${escapeHtml(n)}">`).join('')}</datalist>
          <p class="text-muted" style="font-size:12px;margin-top:4px">Sugestões vêm do Macrofluxo — pode digitar um nome novo se não estiver na lista.</p>
        </div>
        <div class="form-group"><label>Área</label><input type="text" id="pr-area" value="${item ? escapeHtml(item.area || '') : ''}"></div>
      </div>
      <div class="form-group">
        <label>Normas aplicáveis</label>
        <div class="form-row">
          ${Object.entries(NORMA_LABEL).map(([v, l]) => `
            <label style="font-weight:400;display:flex;align-items:center;gap:6px">
              <input type="checkbox" class="pr-norma" value="${v}" style="width:auto" ${item?.normas?.includes(v) ? 'checked' : ''}> ${l}
            </label>`).join('')}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Criticidade</label>
          <select id="pr-criticidade">
            <option value="baixa" ${item?.criticidade === 'baixa' ? 'selected' : ''}>Baixa</option>
            <option value="media" ${(item?.criticidade || 'media') === 'media' ? 'selected' : ''}>Média</option>
            <option value="alta" ${item?.criticidade === 'alta' ? 'selected' : ''}>Alta</option>
          </select>
        </div>
        <div class="form-group">
          <label>Não conformidades históricas</label>
          <select id="pr-nc">
            <option value="nenhuma" ${(item?.historico_ncs || 'nenhuma') === 'nenhuma' ? 'selected' : ''}>Nenhuma</option>
            <option value="ate_3" ${item?.historico_ncs === 'ate_3' ? 'selected' : ''}>Até 3</option>
            <option value="mais_3" ${item?.historico_ncs === 'mais_3' ? 'selected' : ''}>Mais de 3</option>
          </select>
        </div>
        <div class="form-group">
          <label>Turnos do processo</label>
          <select id="pr-qtd-turnos">
            <option value="1" ${(item?.qtd_turnos || 1) === 1 ? 'selected' : ''}>Administrativo (1)</option>
            <option value="2" ${item?.qtd_turnos === 2 ? 'selected' : ''}>Dois turnos</option>
            <option value="3" ${item?.qtd_turnos === 3 ? 'selected' : ''}>Três turnos</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <label style="font-weight:400;display:flex;align-items:center;gap:6px"><input type="checkbox" id="pr-mudancas" style="width:auto" ${item?.mudancas_recentes ? 'checked' : ''}> Mudanças recentes</label>
        <label style="font-weight:400;display:flex;align-items:center;gap:6px"><input type="checkbox" id="pr-legais" style="width:auto" ${item?.requisitos_legais ? 'checked' : ''}> Requisitos legais aplicáveis</label>
        <label style="font-weight:400;display:flex;align-items:center;gap:6px"><input type="checkbox" id="pr-acidentes" style="width:auto" ${item?.acidentes ? 'checked' : ''}> Acidentes/incidentes</label>
        <label style="font-weight:400;display:flex;align-items:center;gap:6px"><input type="checkbox" id="pr-reclamacoes" style="width:auto" ${item?.reclamacoes ? 'checked' : ''}> Reclamações de clientes</label>
      </div>
      <div class="form-group">
        <label>Turnos vinculados</label>
        <div class="form-row">
          ${turnos.map((t) => `
            <label style="font-weight:400;display:flex;align-items:center;gap:6px">
              <input type="checkbox" class="pr-turno" value="${t.id}" style="width:auto" ${turnosVinculados.has(t.id) ? 'checked' : ''}> ${escapeHtml(t.nome)}
            </label>`).join('') || '<span class="text-muted">Cadastre turnos na aba "Turnos" primeiro.</span>'}
        </div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#form-processo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const normas = [...modal.querySelectorAll('.pr-norma:checked')].map((el) => el.value);
    const payload = {
      empresa_id: empresaAtual.id,
      nome: modal.querySelector('#pr-nome').value.trim(),
      area: modal.querySelector('#pr-area').value.trim() || null,
      normas,
      criticidade: modal.querySelector('#pr-criticidade').value,
      historico_ncs: modal.querySelector('#pr-nc').value,
      qtd_turnos: Number(modal.querySelector('#pr-qtd-turnos').value),
      mudancas_recentes: modal.querySelector('#pr-mudancas').checked,
      requisitos_legais: modal.querySelector('#pr-legais').checked,
      acidentes: modal.querySelector('#pr-acidentes').checked,
      reclamacoes: modal.querySelector('#pr-reclamacoes').checked,
    };
    const query = item
      ? supabase.from('auditorias_processos').update(payload).eq('id', item.id).select().single()
      : supabase.from('auditorias_processos').insert(payload).select().single();
    const { data: salvo, error } = await query;
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');

    const turnosSelecionados = [...modal.querySelectorAll('.pr-turno:checked')].map((el) => el.value);
    await supabase.from('auditorias_processos_turnos').delete().eq('processo_id', salvo.id);
    if (turnosSelecionados.length) {
      await supabase.from('auditorias_processos_turnos').insert(turnosSelecionados.map((turno_id) => ({ processo_id: salvo.id, turno_id })));
    }

    toast('Processo salvo com sucesso.', 'sucesso');
    fecharModal();
    renderProcessos(container, state);
  });
}

// ==================== TAB: AUDITORES ====================
async function renderAuditores(container, state) {
  const { supabase, empresaAtual } = state;
  container.innerHTML = `
    <div class="card">
      ${renderFiltrosGrupo()}
      <div class="lista-toolbar" style="margin-top:1rem"><span></span><button class="btn btn-primary btn-sm" id="btn-add-auditor"><i class="ti ti-plus"></i> Novo auditor</button></div>
      <div id="aud-corpo">Carregando...</div>
    </div>`;
  wireFiltrosGrupo(container, state);
  const area = container.querySelector('#aud-corpo');

  const { data: auditores, error } = await supabase.from('auditores').select('*, auditores_competencias(*), auditores_certificacoes(*)').eq('empresa_id', empresaAtual.id);
  if (error) { area.innerHTML = `<div class="alert alert-warning">Erro: ${escapeHtml(error.message)}</div>`; return; }

  const hoje = new Date().toISOString().slice(0, 10);
  area.innerHTML = auditores.length ? `
    <table class="table">
      <thead><tr><th>Nome</th><th>Função</th><th>Área de atuação</th><th>Competências</th><th>Certificações/Treinamentos</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${auditores.map((a) => `
          <tr>
            <td>${escapeHtml(a.nome)}</td>
            <td>${escapeHtml(a.funcao || '—')}</td>
            <td>${escapeHtml(a.area_atuacao || '—')}</td>
            <td>${(a.auditores_competencias || []).map((c) => {
              const vencida = c.validade && c.validade < hoje;
              return `<span class="badge ${vencida ? 'badge-danger' : 'badge-neutral'}" title="${vencida ? 'Qualificação vencida' : ''}">${NORMA_LABEL[c.norma]} · ${NIVEL_COMPETENCIA_LABEL[c.nivel]}</span>`;
            }).join(' ') || '—'}</td>
            <td>${(a.auditores_certificacoes || []).map((c) => {
              const vencida = c.validade && c.validade < hoje;
              return `<span class="badge ${vencida ? 'badge-danger' : 'badge-neutral'}" title="${vencida ? 'Certificação vencida' : ''}">${escapeHtml(c.nome)}</span>`;
            }).join(' ') || '—'}</td>
            <td>${a.ativo ? '<span class="badge badge-success">Ativo</span>' : '<span class="badge badge-neutral">Inativo</span>'}</td>
            <td class="table-actions">
              <button class="icon-btn" data-editar="${a.id}"><i class="ti ti-pencil"></i></button>
              <button class="icon-btn" data-excluir="${a.id}"><i class="ti ti-trash"></i></button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>` : '<div class="empty-state"><i class="ti ti-users"></i>Nenhum auditor cadastrado.</div>';

  area.querySelectorAll('[data-editar]').forEach((btn) => btn.addEventListener('click', () => {
    abrirFormularioAuditor(state, container, auditores.find((a) => a.id === btn.dataset.editar));
  }));
  area.querySelectorAll('[data-excluir]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!(await confirmar('Excluir este auditor?'))) return;
    const { error: errDel } = await supabase.from('auditores').delete().eq('id', btn.dataset.excluir);
    if (errDel) return toast('Erro ao excluir: ' + errDel.message, 'erro');
    renderAuditores(container, state);
  }));
  container.querySelector('#btn-add-auditor').addEventListener('click', () => abrirFormularioAuditor(state, container));
}

function abrirFormularioAuditor(state, container, item = null) {
  const { supabase, empresaAtual } = state;
  let competencias = item ? [...(item.auditores_competencias || [])] : [];
  let certificacoes = item ? [...(item.auditores_certificacoes || [])] : [];

  const modal = abrirModal(item ? 'Editar auditor' : 'Novo auditor', `
    <form id="form-auditor">
      <div class="form-row">
        <div class="form-group"><label>Nome</label><input type="text" id="au-nome" required value="${item ? escapeHtml(item.nome) : ''}"></div>
        <div class="form-group"><label>Matrícula</label><input type="text" id="au-matricula" value="${item ? escapeHtml(item.matricula || '') : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Função</label><input type="text" id="au-funcao" value="${item ? escapeHtml(item.funcao || '') : ''}"></div>
        <div class="form-group"><label>Unidade</label><input type="text" id="au-unidade" value="${item ? escapeHtml(item.unidade || '') : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Área de atuação</label>
          <input type="text" id="au-area" value="${item ? escapeHtml(item.area_atuacao || '') : ''}">
          <p class="text-muted" style="font-size:12px;margin-top:4px">Usado para impedir que o auditor audite a própria área.</p>
        </div>
        <div class="form-group"><label>E-mail</label><input type="email" id="au-email" value="${item ? escapeHtml(item.email || '') : ''}"></div>
      </div>
      <div class="form-group" id="au-competencias-area"></div>
      <div class="form-group" id="au-certificacoes-area"></div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  function renderCompetencias() {
    modal.querySelector('#au-competencias-area').innerHTML = `
      <label>Competências</label>
      <table class="table">
        <thead><tr><th>Norma</th><th>Nível</th><th>Validade</th><th></th></tr></thead>
        <tbody>
          ${competencias.map((c, idx) => `
            <tr>
              <td>${NORMA_LABEL[c.norma] || c.norma}</td><td>${NIVEL_COMPETENCIA_LABEL[c.nivel] || c.nivel}</td><td>${c.validade || '—'}</td>
              <td class="table-actions"><button type="button" class="icon-btn" data-remover-comp="${idx}"><i class="ti ti-trash"></i></button></td>
            </tr>`).join('') || '<tr><td colspan="4" class="text-muted">Nenhuma competência registrada.</td></tr>'}
        </tbody>
      </table>
      <div class="form-row" style="align-items:flex-end">
        <div class="form-group"><label style="font-weight:400;font-size:12px">Norma</label>
          <select id="cp-norma"><option value="iso9001">ISO 9001</option><option value="iso14001">ISO 14001</option><option value="iso45001">ISO 45001</option></select>
        </div>
        <div class="form-group"><label style="font-weight:400;font-size:12px">Nível</label>
          <select id="cp-nivel"><option value="auditor_interno">Auditor Interno</option><option value="auditor_lider">Auditor Líder</option><option value="auditor_externo">Auditor Externo</option></select>
        </div>
        <div class="form-group"><label style="font-weight:400;font-size:12px">Validade</label><input type="date" id="cp-validade"></div>
        <div class="form-group"><button type="button" class="btn btn-secondary btn-block" id="btn-add-comp">Adicionar</button></div>
      </div>`;

    modal.querySelectorAll('[data-remover-comp]').forEach((btn) => btn.addEventListener('click', () => {
      competencias.splice(Number(btn.dataset.removerComp), 1);
      renderCompetencias();
    }));
    modal.querySelector('#btn-add-comp').addEventListener('click', () => {
      const validade = modal.querySelector('#cp-validade').value;
      if (validade && !dataValida(validade)) return toast('Validade inválida.', 'erro');
      competencias.push({ norma: modal.querySelector('#cp-norma').value, nivel: modal.querySelector('#cp-nivel').value, validade: validade || null });
      renderCompetencias();
    });
  }
  renderCompetencias();

  function renderCertificacoes() {
    modal.querySelector('#au-certificacoes-area').innerHTML = `
      <label>Certificações e treinamentos técnicos (opcional)</label>
      <p class="text-muted" style="font-size:12px;margin-top:-4px;margin-bottom:8px">Outras qualificações do auditor além das normas acima — ex: NR-12, Solda, CIPA, formação de auditor de terceira parte.</p>
      <table class="table">
        <thead><tr><th>Certificação/Treinamento</th><th>Instituição</th><th>Obtenção</th><th>Validade</th><th></th></tr></thead>
        <tbody>
          ${certificacoes.map((c, idx) => `
            <tr>
              <td>${escapeHtml(c.nome)}</td><td>${escapeHtml(c.instituicao || '—')}</td><td>${c.data_obtencao || '—'}</td><td>${c.validade || '—'}</td>
              <td class="table-actions">
                <button type="button" class="icon-btn" data-editar-cert="${idx}" title="Editar"><i class="ti ti-pencil"></i></button>
                <button type="button" class="icon-btn" data-remover-cert="${idx}" title="Excluir"><i class="ti ti-trash"></i></button>
              </td>
            </tr>`).join('') || '<tr><td colspan="5" class="text-muted">Nenhuma certificação registrada.</td></tr>'}
        </tbody>
      </table>
      <div class="form-row" style="align-items:flex-end">
        <div class="form-group"><label style="font-weight:400;font-size:12px">Certificação/Treinamento</label><input type="text" id="ct-nome" placeholder="Ex: NR-12"></div>
        <div class="form-group"><label style="font-weight:400;font-size:12px">Instituição</label><input type="text" id="ct-instituicao"></div>
        <div class="form-group"><label style="font-weight:400;font-size:12px">Obtenção</label><input type="date" id="ct-obtencao"></div>
        <div class="form-group"><label style="font-weight:400;font-size:12px">Validade</label><input type="date" id="ct-validade"></div>
        <div class="form-group"><button type="button" class="btn btn-secondary btn-block" id="btn-add-cert">Adicionar</button></div>
        <div class="form-group" id="grupo-cancelar-cert" style="display:none"><button type="button" class="btn btn-secondary btn-block" id="btn-cancelar-cert">Cancelar edição</button></div>
      </div>`;

    let editandoCertIdx = null;
    function limparFormularioCert() {
      modal.querySelector('#ct-nome').value = '';
      modal.querySelector('#ct-instituicao').value = '';
      modal.querySelector('#ct-obtencao').value = '';
      modal.querySelector('#ct-validade').value = '';
      editandoCertIdx = null;
      modal.querySelector('#btn-add-cert').textContent = 'Adicionar';
      modal.querySelector('#grupo-cancelar-cert').style.display = 'none';
    }

    modal.querySelectorAll('[data-remover-cert]').forEach((btn) => btn.addEventListener('click', () => {
      certificacoes.splice(Number(btn.dataset.removerCert), 1);
      renderCertificacoes();
    }));
    modal.querySelectorAll('[data-editar-cert]').forEach((btn) => btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.editarCert);
      const c = certificacoes[idx];
      editandoCertIdx = idx;
      modal.querySelector('#ct-nome').value = c.nome;
      modal.querySelector('#ct-instituicao').value = c.instituicao || '';
      modal.querySelector('#ct-obtencao').value = c.data_obtencao || '';
      modal.querySelector('#ct-validade').value = c.validade || '';
      modal.querySelector('#btn-add-cert').textContent = 'Salvar edição';
      modal.querySelector('#grupo-cancelar-cert').style.display = '';
      modal.querySelector('#ct-nome').focus();
    }));
    modal.querySelector('#btn-cancelar-cert').addEventListener('click', limparFormularioCert);
    modal.querySelector('#btn-add-cert').addEventListener('click', () => {
      const nome = modal.querySelector('#ct-nome').value.trim();
      if (!nome) return toast('Informe o nome da certificação/treinamento.', 'erro');
      const obtencao = modal.querySelector('#ct-obtencao').value;
      const validade = modal.querySelector('#ct-validade').value;
      if (obtencao && !dataValida(obtencao)) return toast('Data de obtenção inválida.', 'erro');
      if (validade && !dataValida(validade)) return toast('Validade inválida.', 'erro');
      const registro = { nome, instituicao: modal.querySelector('#ct-instituicao').value.trim() || null, data_obtencao: obtencao || null, validade: validade || null };
      if (editandoCertIdx !== null) certificacoes[editandoCertIdx] = registro;
      else certificacoes.push(registro);
      limparFormularioCert();
      renderCertificacoes();
    });
  }
  renderCertificacoes();

  modal.querySelector('#form-auditor').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      empresa_id: empresaAtual.id,
      nome: modal.querySelector('#au-nome').value.trim(),
      matricula: modal.querySelector('#au-matricula').value.trim() || null,
      funcao: modal.querySelector('#au-funcao').value.trim() || null,
      unidade: modal.querySelector('#au-unidade').value.trim() || null,
      area_atuacao: modal.querySelector('#au-area').value.trim() || null,
      email: modal.querySelector('#au-email').value.trim() || null,
    };
    const query = item
      ? supabase.from('auditores').update(payload).eq('id', item.id).select().single()
      : supabase.from('auditores').insert(payload).select().single();
    const { data: salvo, error } = await query;
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');

    await supabase.from('auditores_competencias').delete().eq('auditor_id', salvo.id);
    if (competencias.length) {
      await supabase.from('auditores_competencias').insert(competencias.map((c) => ({ auditor_id: salvo.id, norma: c.norma, nivel: c.nivel, validade: c.validade })));
    }

    await supabase.from('auditores_certificacoes').delete().eq('auditor_id', salvo.id);
    if (certificacoes.length) {
      await supabase.from('auditores_certificacoes').insert(certificacoes.map((c) => ({
        auditor_id: salvo.id, nome: c.nome, instituicao: c.instituicao, data_obtencao: c.data_obtencao, validade: c.validade,
      })));
    }

    toast('Auditor salvo com sucesso.', 'sucesso');
    fecharModal();
    renderAuditores(container, state);
  });
}

// ==================== TAB: AUDITORIAS (fluxo completo) ====================
async function renderAuditorias(container, state) {
  const { supabase, empresaAtual } = state;
  container.innerHTML = `
    <div class="card">
      <div class="lista-toolbar">
        <span style="font-weight:700;font-size:14px;color:var(--navy)"><i class="ti ti-clipboard-check"></i> Gestão de Auditorias</span>
        <button class="btn btn-primary btn-sm" id="btn-add-auditoria"><i class="ti ti-plus"></i> Solicitar auditoria</button>
      </div>
      ${renderFiltrosGrupo()}
      <div id="auditorias-corpo" style="margin-top:1rem">Carregando...</div>
    </div>`;
  wireFiltrosGrupo(container, state);
  const area = container.querySelector('#auditorias-corpo');

  const { data: auditorias, error } = await supabase.from('auditorias').select('*').eq('empresa_id', empresaAtual.id).order('numero', { ascending: false });
  if (error) { area.innerHTML = `<div class="alert alert-warning">Erro: ${escapeHtml(error.message)}</div>`; return; }

  area.innerHTML = auditorias.length ? `
    <table class="table">
      <thead><tr><th>Nº</th><th>Título</th><th>Tipo</th><th>Normas</th><th>Prioridade</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${auditorias.map((a) => `
          <tr>
            <td><span class="badge badge-neutral">${escapeHtml(a.numero)}</span></td>
            <td>${escapeHtml(a.titulo)}</td>
            <td>${a.tipo === 'outro' ? escapeHtml(a.tipo_outro_descricao || 'Outro') : TIPO_LABEL[a.tipo]} <span class="text-muted">(${MODALIDADE_LABEL[a.modalidade]})</span></td>
            <td>${(a.normas || []).map((n) => NORMA_LABEL[n]).join(', ') || '—'}</td>
            <td>${a.prioridade_classificacao ? `<span class="badge ${PRIORIDADE_BADGE[a.prioridade_classificacao]}">${PRIORIDADE_LABEL[a.prioridade_classificacao]}</span>` : '—'}</td>
            <td><span class="badge ${STATUS_BADGE[a.status]}">${STATUS_LABEL[a.status]}</span></td>
            <td class="table-actions"><button class="icon-btn" data-abrir="${a.id}"><i class="ti ti-pencil"></i></button></td>
          </tr>`).join('')}
      </tbody>
    </table>` : '<div class="empty-state"><i class="ti ti-clipboard-check"></i>Nenhuma auditoria solicitada ainda.</div>';

  area.querySelectorAll('[data-abrir]').forEach((btn) => btn.addEventListener('click', () => {
    abrirAuditoria(state, container, auditorias.find((a) => a.id === btn.dataset.abrir));
  }));
  container.querySelector('#btn-add-auditoria').addEventListener('click', () => abrirAuditoria(state, container));
}

// Abre a auditoria em um modal com seções sequenciais (solicitação → priorização → planejamento
// → distribuição/agenda → equipe → execução → aprovação). Antes de existir (solicitação nova),
// só a seção de solicitação aparece; as demais liberam depois de salvar.
async function abrirAuditoria(state, container, item = null) {
  const { supabase, empresaAtual, user } = state;
  const { processos, turnos, processosTurnos, auditores } = await carregarBaseCadastros(supabase, empresaAtual.id);
  const turnosPorProcesso = new Map();
  processosTurnos.forEach((pt) => { const l = turnosPorProcesso.get(pt.processo_id) || []; l.push(pt.turno_id); turnosPorProcesso.set(pt.processo_id, l); });
  const nomeProcesso = (id) => processos.find((p) => p.id === id)?.nome || '—';
  const nomeTurno = (id) => turnos.find((t) => t.id === id)?.nome || '—';
  const nomeAuditor = (id) => auditores.find((a) => a.id === id)?.nome || '—';
  const processosPorId = new Map(processos.map((p) => [p.id, p]));

  let processosSelecionados = [];
  let equipe = [];
  let agendaExistente = [];
  if (item) {
    const [{ data: sel }, { data: eq }, { data: ag }] = await Promise.all([
      supabase.from('auditorias_processos_selecionados').select('*').eq('auditoria_id', item.id),
      supabase.from('auditorias_equipe').select('*').eq('auditoria_id', item.id),
      supabase.from('auditorias_agenda').select('*').eq('auditoria_id', item.id).order('dia').order('hora_inicio'),
    ]);
    processosSelecionados = sel || [];
    equipe = eq || [];
    agendaExistente = ag || [];
  }
  // Equipe já com dados do auditor (área de atuação), usada para sugerir quem executa cada bloco.
  function equipeComAuditor(listaEquipe) {
    return listaEquipe.map((e) => ({ auditor_id: e.auditor_id, ...(auditores.find((a) => a.id === e.auditor_id) || {}) }));
  }

  const modal = abrirModal(item ? `Auditoria ${escapeHtml(item.numero)}` : 'Solicitar auditoria', `
    <form id="form-auditoria">
      <p style="font-weight:700;color:var(--navy);margin-bottom:8px">1. Solicitação</p>
      <div class="form-row">
        <div class="form-group"><label>Título</label><input type="text" id="ad-titulo" required value="${item ? escapeHtml(item.titulo) : ''}"></div>
        <div class="form-group"><label>Unidade</label><input type="text" id="ad-unidade" value="${item ? escapeHtml(item.unidade || '') : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Tipo</label>
          <select id="ad-tipo">${Object.entries(TIPO_LABEL).map(([v, l]) => `<option value="${v}" ${item?.tipo === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <div class="form-group">
          <label>Modalidade</label>
          <select id="ad-modalidade">${Object.entries(MODALIDADE_LABEL).map(([v, l]) => `<option value="${v}" ${(item?.modalidade || 'individual') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Data prevista</label><input type="date" id="ad-data-prevista" value="${item?.data_prevista || ''}"></div>
      </div>
      <div class="form-group" id="grupo-tipo-outro" style="${item?.tipo === 'outro' ? '' : 'display:none'}">
        <label>Qual tipo de auditoria?</label>
        <input type="text" id="ad-tipo-outro" value="${item ? escapeHtml(item.tipo_outro_descricao || '') : ''}" placeholder="Descreva o tipo de auditoria">
      </div>
      <div class="form-group">
        <label>Normas aplicáveis</label>
        <div class="form-row">
          ${Object.entries(NORMA_LABEL).map(([v, l]) => `
            <label style="font-weight:400;display:flex;align-items:center;gap:6px">
              <input type="checkbox" class="ad-norma" value="${v}" style="width:auto" ${item?.normas?.includes(v) ? 'checked' : ''}> ${l}
            </label>`).join('')}
        </div>
      </div>
      <div class="form-group"><label>Objetivo</label><textarea id="ad-objetivo">${item ? escapeHtml(item.objetivo || '') : ''}</textarea></div>
      <div class="form-group"><label>Escopo</label><textarea id="ad-escopo">${item ? escapeHtml(item.escopo || '') : ''}</textarea></div>
      <div class="form-group"><label>Observações</label><textarea id="ad-observacoes">${item ? escapeHtml(item.observacoes || '') : ''}</textarea></div>
      <div class="form-group">
        <label>Status do fluxo</label>
        <select id="ad-status">${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${(item?.status || 'solicitada') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>

      ${item ? `
      ${['externa', 'certificacao', 'recertificacao'].includes(item.tipo) ? `
      <hr class="sep">
      <p style="font-weight:700;color:var(--navy);margin-bottom:8px">2. Documentos do organismo certificador</p>
      <div class="alert alert-info"><i class="ti ti-info-circle"></i><span>Plano de auditoria, relatório do auditor externo, certificado etc. — documentos recebidos do organismo certificador, não gerados internamente.</span></div>
      <div id="ad-documentos-area"></div>
      ` : ''}

      <hr class="sep">
      <p style="font-weight:700;color:var(--navy);margin-bottom:8px">3. Priorização (IPA) — selecione os processos auditados</p>
      <div id="ad-priorizacao-area"></div>

      <hr class="sep">
      <p style="font-weight:700;color:var(--navy);margin-bottom:8px">4. Planejamento inteligente</p>

      <div class="planejamento-box">
        <p class="planejamento-box-titulo"><i class="ti ti-calendar-time"></i> Duração da auditoria</p>
        <div class="form-row">
          <div class="form-group"><label>Horas totais</label><input type="number" step="0.5" id="ad-horas-totais" value="${item.horas_totais ?? ''}"></div>
          <div class="form-group"><label>Dias</label><input type="number" min="1" id="ad-dias" value="${item.dias ?? 1}"></div>
          <div class="form-group"><label>Data inicial</label><input type="date" id="ad-data-inicial" value="${item.data_inicial || ''}"></div>
          <div class="form-group"><label>Data final</label><input type="date" id="ad-data-final" value="${item.data_final || ''}"></div>
        </div>
      </div>

      <div class="planejamento-box">
        <p class="planejamento-box-titulo"><i class="ti ti-clock"></i> Jornada de trabalho</p>
        <div class="form-row">
          <div class="form-group"><label>Entrada</label><input type="time" id="ad-entrada" value="${item.hora_entrada?.slice(0, 5) || '08:00'}"></div>
          <div class="form-group"><label>Saída</label><input type="time" id="ad-saida" value="${item.hora_saida?.slice(0, 5) || '17:30'}"></div>
          <div class="form-group"><label>Almoço — início</label><input type="time" id="ad-almoco-inicio" value="${item.almoco_inicio?.slice(0, 5) || '12:00'}"></div>
          <div class="form-group"><label>Almoço — fim</label><input type="time" id="ad-almoco-fim" value="${item.almoco_fim?.slice(0, 5) || '13:00'}"></div>
        </div>
        <p class="text-muted" style="font-size:12px;margin-top:2px">Tempo útil diário estimado: <strong id="ad-tempo-util">—</strong></p>
      </div>

      <div class="planejamento-box">
        <p class="planejamento-box-titulo"><i class="ti ti-hourglass"></i> Tempos padrão (minutos)</p>
        <div class="form-row">
          <div class="form-group"><label>Deslocamento entre áreas</label><input type="number" min="0" id="ad-deslocamento" value="${item.tempo_deslocamento_min ?? 0}"></div>
          <div class="form-group"><label>Reunião de abertura</label><input type="number" min="0" id="ad-abertura" value="${item.tempo_abertura_min ?? 30}"></div>
          <div class="form-group"><label>Reunião de encerramento</label><input type="number" min="0" id="ad-encerramento" value="${item.tempo_encerramento_min ?? 30}"></div>
          <div class="form-group"><label>Consolidação das evidências</label><input type="number" min="0" id="ad-consolidacao" value="${item.tempo_consolidacao_min ?? 30}"></div>
        </div>
      </div>

      <div class="planejamento-box">
        <p class="planejamento-box-titulo"><i class="ti ti-arrows-split"></i> Limites por processo</p>
        <div class="form-row">
          <div class="form-group"><label>Mín. horas por processo</label><input type="number" step="0.1" id="ad-horas-min" value="${item.horas_min_processo ?? 0.5}"></div>
          <div class="form-group"><label>Máx. horas por processo (opcional)</label><input type="number" step="0.1" id="ad-horas-max" value="${item.horas_max_processo ?? ''}"></div>
        </div>
      </div>

      <button type="button" class="btn btn-secondary" id="btn-distribuir-horas"><i class="ti ti-calculator"></i> Distribuir horas e gerar agenda</button>
      <div id="ad-distribuicao-area" style="margin-top:1rem"></div>
      <div id="ad-agenda-area" style="margin-top:1rem"></div>

      <hr class="sep">
      <p style="font-weight:700;color:var(--navy);margin-bottom:8px">5. Equipe auditora</p>
      <div id="ad-equipe-area"></div>

      <hr class="sep">
      <p style="font-weight:700;color:var(--navy);margin-bottom:8px">6. Execução e resultados</p>
      <div id="ad-execucao-area"></div>

      <hr class="sep">
      <p style="font-weight:700;color:var(--navy);margin-bottom:8px">7. Fluxo de aprovação</p>
      <div id="ad-aprovacao-area"></div>

      <hr class="sep">
      <p style="font-weight:700;color:var(--navy);margin-bottom:8px">8. Conclusão do relatório</p>
      <div class="form-group">
        <label>Conclusão</label>
        <select id="ad-conclusao">
          <option value="">—</option>
          ${Object.entries(CONCLUSAO_LABEL).map(([v, l]) => `<option value="${v}" ${item.conclusao === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <button type="button" class="btn btn-secondary btn-block" id="btn-imprimir-relatorio"><i class="ti ti-printer"></i> Imprimir relatório de auditoria</button>
      ` : ''}

      <button class="btn btn-primary btn-block" type="submit" style="margin-top:1rem">Salvar</button>
    </form>
  `);
  modal.classList.add('modal-xl');

  function atualizarTempoUtil() {
    const entrada = modal.querySelector('#ad-entrada')?.value;
    const saida = modal.querySelector('#ad-saida')?.value;
    const almocoIni = modal.querySelector('#ad-almoco-inicio')?.value;
    const almocoFim = modal.querySelector('#ad-almoco-fim')?.value;
    const dispEl = modal.querySelector('#ad-tempo-util');
    if (!dispEl || !entrada || !saida) return;
    let minutos = horaParaMinutos(saida) - horaParaMinutos(entrada);
    if (almocoIni && almocoFim) minutos -= (horaParaMinutos(almocoFim) - horaParaMinutos(almocoIni));
    dispEl.textContent = `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}`;
  }
  modal.querySelectorAll('#ad-entrada, #ad-saida, #ad-almoco-inicio, #ad-almoco-fim').forEach((el) => el?.addEventListener('input', atualizarTempoUtil));
  atualizarTempoUtil();

  modal.querySelector('#ad-tipo').addEventListener('change', (e) => {
    modal.querySelector('#grupo-tipo-outro').style.display = e.target.value === 'outro' ? '' : 'none';
  });

  if (item) {
    montarDocumentosOrganismo(state, modal, item);
    montarPriorizacao(modal, processos, processosSelecionados);
    montarEquipe(state, modal, item, auditores, equipe, processos);
    montarExecucao(state, modal, item, processos, () => renderAuditorias(container, state));
    montarAprovacao(state, modal, item);
    renderDistribuicaoESalva(
      modal, state, item, processos, turnos, turnosPorProcesso, nomeProcesso, nomeTurno, nomeAuditor, auditores,
      processosSelecionados.map((s) => ({ processo_id: s.processo_id, pontuacao: s.pontuacao, horas: s.horas_distribuidas })),
      agendaExistente,
    );

    modal.querySelector('#btn-distribuir-horas').addEventListener('click', async () => {
      const selecionados = [...modal.querySelectorAll('.pz-processo:checked')].map((el) => el.value);
      if (!selecionados.length) return toast('Selecione ao menos um processo na priorização.', 'erro');
      const horasTotais = Number(modal.querySelector('#ad-horas-totais').value) || 0;
      const horasMin = Number(modal.querySelector('#ad-horas-min').value) || 0;
      const horasMax = Number(modal.querySelector('#ad-horas-max').value) || null;
      if (!horasTotais) return toast('Informe as horas totais da auditoria.', 'erro');

      const candidatos = processos.filter((p) => selecionados.includes(p.id)).map((p) => ({ id: p.id, pontuacao: calcularIPAProcesso(p) }));
      const distribuicaoProcessos = distribuirHoras(candidatos, horasTotais, horasMin, horasMax);
      const distribuicaoTurnos = distribuirPorTurnos(distribuicaoProcessos, processos, turnosPorProcesso);

      await supabase.from('auditorias_processos_selecionados').delete().eq('auditoria_id', item.id);
      await supabase.from('auditorias_processos_selecionados').insert(
        distribuicaoProcessos.map((d) => ({ auditoria_id: item.id, processo_id: d.processo_id, pontuacao: d.pontuacao, horas_distribuidas: d.horas }))
      );
      await supabase.from('auditorias_distribuicao_turno').delete().eq('auditoria_id', item.id);
      if (distribuicaoTurnos.length) {
        await supabase.from('auditorias_distribuicao_turno').insert(distribuicaoTurnos.map((d) => ({ auditoria_id: item.id, processo_id: d.processo_id, turno_id: d.turno_id, horas: d.horas })));
      }

      const auditoriaAtualizada = {
        ...item,
        horas_totais: horasTotais,
        dias: Number(modal.querySelector('#ad-dias').value) || 1,
        hora_entrada: modal.querySelector('#ad-entrada').value,
        hora_saida: modal.querySelector('#ad-saida').value,
        almoco_inicio: modal.querySelector('#ad-almoco-inicio').value,
        almoco_fim: modal.querySelector('#ad-almoco-fim').value,
        tempo_deslocamento_min: Number(modal.querySelector('#ad-deslocamento').value) || 0,
        tempo_abertura_min: Number(modal.querySelector('#ad-abertura').value) || 0,
        tempo_encerramento_min: Number(modal.querySelector('#ad-encerramento').value) || 0,
        tempo_consolidacao_min: Number(modal.querySelector('#ad-consolidacao').value) || 0,
      };
      const { data: equipeAtual } = await supabase.from('auditorias_equipe').select('*').eq('auditoria_id', item.id);
      const agendaSemSugestao = gerarAgenda(auditoriaAtualizada, distribuicaoTurnos, nomeProcesso, nomeTurno);
      const agendaComSugestao = sugerirAuditoresPorBloco(agendaSemSugestao, equipeComAuditor(equipeAtual || []), processosPorId, item.tipo === 'interna');
      await supabase.from('auditorias_agenda').delete().eq('auditoria_id', item.id);
      await supabase.from('auditorias_agenda').insert(agendaComSugestao.map((b) => ({
        auditoria_id: item.id, dia: b.dia, hora_inicio: b.hora_inicio, hora_fim: b.hora_fim, tipo: b.tipo,
        processo_id: b.processo_id || null, turno_id: b.turno_id || null, rotulo: b.rotulo,
        auditor_sugerido_id: b.auditor_sugerido_id || null, auditor_sugerido_2_id: b.auditor_sugerido_2_id || null,
      })));
      // Recarrega do banco para ter o "id" de cada bloco (necessário para editar/salvar ajustes na agenda).
      const { data: agenda } = await supabase.from('auditorias_agenda').select('*').eq('auditoria_id', item.id).order('dia').order('hora_inicio');

      const ipaMedio = distribuicaoProcessos.reduce((s, d) => s + d.pontuacao, 0) / distribuicaoProcessos.length;
      const classificacao = classificarIPA(ipaMedio);
      await supabase.from('auditorias').update({
        ipa: Math.round(ipaMedio * 100) / 100, prioridade_classificacao: classificacao, frequencia_sugerida: FREQUENCIA_POR_CLASSIFICACAO[classificacao],
        status: 'agendada', horas_totais: horasTotais, ...auditoriaAtualizada,
      }).eq('id', item.id);

      toast('Horas distribuídas e agenda gerada com sucesso.', 'sucesso');
      renderDistribuicaoESalva(modal, state, { ...item, ...auditoriaAtualizada }, processos, turnos, turnosPorProcesso, nomeProcesso, nomeTurno, nomeAuditor, auditores, distribuicaoProcessos, agenda || []);
    });

    modal.querySelector('#btn-imprimir-relatorio').addEventListener('click', () => imprimirRelatorio(state, item));
  }

  modal.querySelector('#form-auditoria').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dataPrevista = modal.querySelector('#ad-data-prevista').value || null;
    if (dataPrevista && !dataValida(dataPrevista)) return toast('Data prevista inválida.', 'erro');
    if (modal.querySelector('#ad-tipo').value === 'outro' && !modal.querySelector('#ad-tipo-outro').value.trim()) {
      return toast('Descreva qual é o tipo de auditoria.', 'erro');
    }

    const payload = {
      empresa_id: empresaAtual.id,
      titulo: modal.querySelector('#ad-titulo').value.trim(),
      tipo: modal.querySelector('#ad-tipo').value,
      tipo_outro_descricao: modal.querySelector('#ad-tipo').value === 'outro' ? (modal.querySelector('#ad-tipo-outro').value.trim() || null) : null,
      modalidade: modal.querySelector('#ad-modalidade').value,
      unidade: modal.querySelector('#ad-unidade').value.trim() || null,
      objetivo: modal.querySelector('#ad-objetivo').value.trim() || null,
      escopo: modal.querySelector('#ad-escopo').value.trim() || null,
      normas: [...modal.querySelectorAll('.ad-norma:checked')].map((el) => el.value),
      data_prevista: dataPrevista,
      observacoes: modal.querySelector('#ad-observacoes').value.trim() || null,
      status: modal.querySelector('#ad-status').value,
    };
    if (item) {
      payload.conclusao = modal.querySelector('#ad-conclusao')?.value || null;
    } else {
      payload.created_by = user.id;
    }

    const query = item
      ? supabase.from('auditorias').update(payload).eq('id', item.id).select().single()
      : supabase.from('auditorias').insert(payload).select().single();
    const { data: salvo, error } = await query;
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');

    if (!item) {
      toast('Auditoria solicitada com sucesso. Agora priorize e planeje abaixo.', 'sucesso');
      abrirAuditoria(state, container, salvo);
      return;
    }

    toast('Auditoria salva com sucesso.', 'sucesso');
    fecharModal();
    renderAuditorias(container, state);
  });
}

// ==================== DOCUMENTOS DO ORGANISMO CERTIFICADOR ====================
// Só aparece para tipo externa/certificação/recertificação (ver seção "2." acima). Documentos
// recebidos de terceiros, vinculados à auditoria como um todo — reaproveita o bucket
// 'evidencias-auditorias' já usado pelos anexos de achados, em uma subpasta própria.
function montarDocumentosOrganismo(state, modal, auditoria) {
  const { supabase, empresaAtual, user } = state;
  const area = modal.querySelector('#ad-documentos-area');
  if (!area) return;

  async function carregarERenderizar() {
    const { data: documentos, error } = await supabase.from('auditorias_documentos').select('*').eq('auditoria_id', auditoria.id).order('created_at', { ascending: false });
    if (error) { area.innerHTML = `<div class="alert alert-warning">Erro: ${escapeHtml(error.message)}</div>`; return; }
    const lista = documentos || [];

    area.innerHTML = `
      <table class="table">
        <thead><tr><th>Arquivo</th><th>Descrição</th><th>Enviado em</th><th></th></tr></thead>
        <tbody>${lista.map((d) => `
          <tr>
            <td><i class="ti ti-paperclip"></i> ${escapeHtml(d.nome_arquivo)}</td>
            <td>${escapeHtml(d.descricao || '—')}</td>
            <td>${new Date(d.created_at).toLocaleDateString('pt-BR')}</td>
            <td class="table-actions">
              <button type="button" class="icon-btn" data-baixar-doc="${d.id}" title="Abrir"><i class="ti ti-download"></i></button>
              <button type="button" class="icon-btn" data-excluir-doc="${d.id}" title="Excluir"><i class="ti ti-trash"></i></button>
            </td>
          </tr>`).join('') || '<tr><td colspan="4" class="text-muted">Nenhum documento anexado ainda.</td></tr>'}</tbody>
      </table>
      <div class="form-row" style="align-items:flex-end">
        <div class="form-group"><label style="font-weight:400;font-size:12px">Arquivo</label><input type="file" id="doc-arquivo"></div>
        <div class="form-group"><label style="font-weight:400;font-size:12px">Descrição (opcional)</label><input type="text" id="doc-descricao" placeholder="Ex: Relatório final do organismo"></div>
        <div class="form-group"><button type="button" class="btn btn-secondary btn-block" id="btn-add-doc">Anexar</button></div>
      </div>`;

    area.querySelectorAll('[data-baixar-doc]').forEach((btn) => btn.addEventListener('click', async () => {
      const doc = lista.find((d) => d.id === btn.dataset.baixarDoc);
      const { data, error: errUrl } = await supabase.storage.from('evidencias-auditorias').createSignedUrl(doc.url, 300);
      if (errUrl) return toast('Erro ao abrir documento: ' + errUrl.message, 'erro');
      window.open(data.signedUrl, '_blank');
    }));
    area.querySelectorAll('[data-excluir-doc]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!(await confirmar('Excluir este documento?'))) return;
      const doc = lista.find((d) => d.id === btn.dataset.excluirDoc);
      await supabase.storage.from('evidencias-auditorias').remove([doc.url]);
      await supabase.from('auditorias_documentos').delete().eq('id', doc.id);
      carregarERenderizar();
    }));

    area.querySelector('#btn-add-doc').addEventListener('click', async () => {
      const arquivo = area.querySelector('#doc-arquivo').files[0];
      if (!arquivo) return toast('Selecione um arquivo.', 'erro');
      const nomeSanitizado = arquivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
      const caminho = `${empresaAtual.id}/${auditoria.id}/documentos-organismo/${Date.now()}_${nomeSanitizado}`;
      const { error: errUpload } = await supabase.storage.from('evidencias-auditorias').upload(caminho, arquivo, { upsert: true });
      if (errUpload) return toast('Erro ao enviar arquivo: ' + errUpload.message, 'erro');

      const { error: errIns } = await supabase.from('auditorias_documentos').insert({
        auditoria_id: auditoria.id, nome_arquivo: arquivo.name, url: caminho,
        descricao: area.querySelector('#doc-descricao').value.trim() || null, enviado_por: user.id,
      });
      if (errIns) return toast('Erro ao registrar documento: ' + errIns.message, 'erro');

      toast('Documento anexado com sucesso.', 'sucesso');
      carregarERenderizar();
    });
  }

  carregarERenderizar();
}

function montarPriorizacao(modal, processos, processosSelecionados) {
  const area = modal.querySelector('#ad-priorizacao-area');
  if (!area) return;
  const pontuacaoPorId = new Map(processosSelecionados.map((s) => [s.processo_id, s.pontuacao]));
  const selecionadosIds = new Set(processosSelecionados.map((s) => s.processo_id));

  area.innerHTML = processos.length ? `
    <table class="table">
      <thead><tr><th></th><th>Processo</th><th>Criticidade</th><th>NCs</th><th>IPA</th><th>Prioridade</th><th>Frequência sugerida</th></tr></thead>
      <tbody>
        ${processos.map((p) => {
          const ipa = pontuacaoPorId.get(p.id) ?? calcularIPAProcesso(p);
          const classificacao = classificarIPA(ipa);
          return `
          <tr>
            <td><input type="checkbox" class="pz-processo" value="${p.id}" ${selecionadosIds.has(p.id) ? 'checked' : ''}></td>
            <td>${escapeHtml(p.nome)}</td>
            <td>${p.criticidade}</td>
            <td>${p.historico_ncs}</td>
            <td>${ipa.toFixed(1)}</td>
            <td><span class="badge ${PRIORIDADE_BADGE[classificacao]}">${PRIORIDADE_LABEL[classificacao]}</span></td>
            <td>${FREQUENCIA_LABEL[FREQUENCIA_POR_CLASSIFICACAO[classificacao]]}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '<p class="text-muted">Cadastre processos auditáveis na aba "Processos Auditáveis" primeiro.</p>';
}

// Renderiza a distribuição de horas (somente leitura) e a agenda gerada — esta última totalmente
// editável (horário, atividade e auditor sugerido por bloco), com botão para salvar os ajustes,
// imprimir e enviar por e-mail. auditoria.tipo === 'interna' mostra uma segunda coluna de auditor
// sugerido (regra de dois auditores por área em auditoria interna).
function renderDistribuicaoESalva(modal, state, auditoria, processos, turnos, turnosPorProcesso, nomeProcesso, nomeTurno, nomeAuditor, auditores, distribuicaoProcessosNova, agendaNova) {
  const { supabase } = state;
  const areaDist = modal.querySelector('#ad-distribuicao-area');
  const areaAgenda = modal.querySelector('#ad-agenda-area');
  if (!areaDist || !areaAgenda) return;

  if (distribuicaoProcessosNova?.length) {
    areaDist.innerHTML = `
      <p style="font-weight:700;margin-bottom:6px">Horas distribuídas por processo</p>
      <table class="table"><thead><tr><th>Processo</th><th>Pontuação (IPA)</th><th>Horas</th></tr></thead>
      <tbody>${distribuicaoProcessosNova.map((d) => `<tr><td>${escapeHtml(nomeProcesso(d.processo_id))}</td><td>${(+d.pontuacao).toFixed(1)}</td><td>${(+d.horas).toFixed(2)}h</td></tr>`).join('')}</tbody></table>`;
  }
  if (!agendaNova?.length) { areaAgenda.innerHTML = ''; return; }

  const mostrarSegundoAuditor = auditoria.tipo === 'interna';
  const optionsAuditor = (selecionadoId) => `<option value="">—</option>${auditores.map((a) => `<option value="${a.id}" ${a.id === selecionadoId ? 'selected' : ''}>${escapeHtml(a.nome)}</option>`).join('')}`;

  const porDia = {};
  agendaNova.forEach((b) => { (porDia[b.dia] = porDia[b.dia] || []).push(b); });

  areaAgenda.innerHTML = `
    <p style="font-weight:700;margin-bottom:6px">Agenda gerada <span class="text-muted" style="font-weight:400;font-size:12px">(sugestão do sistema — todos os campos abaixo são editáveis)</span></p>
    <p class="text-muted" style="font-size:12px;margin-top:-4px;margin-bottom:8px">
      O auditor sugerido é calculado por rodízio entre a equipe designada, evitando quem tem impedimento de área.
      ${mostrarSegundoAuditor ? 'Auditoria interna sempre sugere 2 auditores por processo.' : ''}
      Ajuste horário, atividade ou auditor diretamente na tabela e clique em "Salvar ajustes".
    </p>
    ${Object.entries(porDia).map(([dia, blocos]) => `
      <p style="font-weight:600;margin:8px 0 4px">Dia ${dia}</p>
      <table class="table">
        <thead><tr><th style="width:100px">Início</th><th style="width:100px">Fim</th><th>Atividade</th>${blocos.some((b) => b.tipo === 'processo') ? `<th>Auditor sugerido</th>${mostrarSegundoAuditor ? '<th>2º auditor</th>' : ''}` : ''}</tr></thead>
        <tbody>${blocos.map((b) => `
          <tr data-agenda-id="${b.id}">
            <td><input type="time" class="ag-hora-inicio" value="${b.hora_inicio.slice(0, 5)}"></td>
            <td><input type="time" class="ag-hora-fim" value="${b.hora_fim.slice(0, 5)}"></td>
            <td><input type="text" class="ag-rotulo" value="${escapeHtml(b.rotulo || '')}"></td>
            ${b.tipo === 'processo' ? `
              <td><select class="ag-auditor-1">${optionsAuditor(b.auditor_sugerido_id)}</select></td>
              ${mostrarSegundoAuditor ? `<td><select class="ag-auditor-2">${optionsAuditor(b.auditor_sugerido_2_id)}</select></td>` : ''}
            ` : `<td colspan="${mostrarSegundoAuditor ? 2 : 1}"></td>`}
          </tr>`).join('')}</tbody>
      </table>
    `).join('')}
    <div class="filters" style="margin-top:1rem">
      <button type="button" class="btn btn-secondary btn-sm" id="btn-salvar-ajustes-agenda"><i class="ti ti-device-floppy"></i> Salvar ajustes</button>
      <button type="button" class="btn btn-secondary btn-sm" id="btn-imprimir-agenda"><i class="ti ti-printer"></i> Imprimir agenda</button>
      <button type="button" class="btn btn-secondary btn-sm" id="btn-email-agenda"><i class="ti ti-mail"></i> Enviar por e-mail</button>
    </div>
  `;

  areaAgenda.querySelector('#btn-salvar-ajustes-agenda').addEventListener('click', async () => {
    const linhas = [...areaAgenda.querySelectorAll('[data-agenda-id]')];
    const atualizacoes = linhas.map((tr) => {
      const payload = {
        hora_inicio: tr.querySelector('.ag-hora-inicio').value,
        hora_fim: tr.querySelector('.ag-hora-fim').value,
        rotulo: tr.querySelector('.ag-rotulo').value.trim(),
      };
      const sel1 = tr.querySelector('.ag-auditor-1');
      const sel2 = tr.querySelector('.ag-auditor-2');
      if (sel1) payload.auditor_sugerido_id = sel1.value || null;
      if (sel2) payload.auditor_sugerido_2_id = sel2.value || null;
      return supabase.from('auditorias_agenda').update(payload).eq('id', tr.dataset.agendaId);
    });
    const resultados = await Promise.all(atualizacoes);
    const comErro = resultados.find((r) => r.error);
    if (comErro) return toast('Erro ao salvar ajustes: ' + comErro.error.message, 'erro');
    toast('Ajustes da agenda salvos com sucesso.', 'sucesso');
  });

  areaAgenda.querySelector('#btn-imprimir-agenda').addEventListener('click', () => imprimirAgenda(auditoria, porDia, nomeProcesso, nomeAuditor));
  areaAgenda.querySelector('#btn-email-agenda').addEventListener('click', () => {
    const corpo = Object.entries(porDia).map(([dia, blocos]) => {
      const linhasTxt = blocos.map((b) => `  ${b.hora_inicio.slice(0, 5)} às ${b.hora_fim.slice(0, 5)} — ${b.rotulo}${b.auditor_sugerido_id ? ` (auditor: ${nomeAuditor(b.auditor_sugerido_id)}${b.auditor_sugerido_2_id ? ' e ' + nomeAuditor(b.auditor_sugerido_2_id) : ''})` : ''}`).join('\n');
      return `Dia ${dia}\n${linhasTxt}`;
    }).join('\n\n');
    enviarPorEmail(`Agenda da Auditoria ${auditoria.numero}`, corpo);
  });
}

// Documento de impressão da agenda (ver imprimirSecao em ui.js — já inclui timbre e rodapé de marca).
function imprimirAgenda(auditoria, porDia, nomeProcesso, nomeAuditor) {
  imprimirSecao(`
    <h2 style="margin-bottom:4px">Agenda da Auditoria ${escapeHtml(auditoria.numero)}</h2>
    <p class="text-muted">${escapeHtml(auditoria.titulo)}</p>
    <hr class="sep">
    ${Object.entries(porDia).map(([dia, blocos]) => `
      <h4 style="margin-top:16px">Dia ${dia}</h4>
      <table class="table">
        <thead><tr><th>Horário</th><th>Atividade</th><th>Auditor(es) sugerido(s)</th></tr></thead>
        <tbody>${blocos.map((b) => `
          <tr>
            <td>${b.hora_inicio.slice(0, 5)} às ${b.hora_fim.slice(0, 5)}</td>
            <td>${escapeHtml(b.rotulo || '')}</td>
            <td>${b.auditor_sugerido_id ? escapeHtml(nomeAuditor(b.auditor_sugerido_id)) : '—'}${b.auditor_sugerido_2_id ? ' e ' + escapeHtml(nomeAuditor(b.auditor_sugerido_2_id)) : ''}</td>
          </tr>`).join('')}</tbody>
      </table>
    `).join('')}
  `);
}

function montarEquipe(state, modal, auditoria, auditores, equipeAtual, processos) {
  const { supabase } = state;
  const area = modal.querySelector('#ad-equipe-area');
  if (!area) return;
  let equipe = [...equipeAtual];
  const nomeAuditor = (id) => auditores.find((a) => a.id === id)?.nome || '—';
  const hoje = new Date().toISOString().slice(0, 10);

  function auditorTemImpedimento(auditor) {
    return processos.some((p) => auditor.area_atuacao && p.area && auditor.area_atuacao.trim().toLowerCase() === p.area.trim().toLowerCase());
  }
  function auditorTemCompetencia(auditor) {
    if (!auditoria.normas?.length) return true;
    const competencias = auditor.auditores_competencias || [];
    return auditoria.normas.filter((n) => n !== 'outra').every((n) => competencias.some((c) => c.norma === n && (!c.validade || c.validade >= hoje)));
  }

  function renderLista() {
    const jaNaEquipe = new Set(equipe.map((e) => e.auditor_id));
    const disponiveis = auditores.filter((a) => a.ativo && !jaNaEquipe.has(a.id));
    area.innerHTML = `
      <div class="planejamento-box">
        <p class="planejamento-box-titulo"><i class="ti ti-users"></i> Auditores designados (${equipe.length})</p>
        <table class="table">
          <thead><tr><th>Auditor</th><th>Papel</th><th></th></tr></thead>
          <tbody>${equipe.map((e) => `
            <tr><td>${escapeHtml(nomeAuditor(e.auditor_id))}</td><td>${e.papel === 'lider' ? 'Líder' : 'Auditor'}</td>
            <td class="table-actions"><button type="button" class="icon-btn" data-remover-equipe="${e.auditor_id}"><i class="ti ti-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="3" class="text-muted">Nenhum auditor designado ainda.</td></tr>'}</tbody>
        </table>
        ${auditores.length ? `
        <div class="form-row" style="align-items:flex-end;margin-top:0.75rem">
          <div class="form-group"><label style="font-weight:400;font-size:12px">Auditor cadastrado</label>
          <select id="eq-auditor">${disponiveis.map((a) => {
            const impedido = auditorTemImpedimento(a);
            const semCompetencia = !auditorTemCompetencia(a);
            const aviso = impedido ? ' — impedido (própria área)' : (semCompetencia ? ' — sem competência na norma' : '');
            return `<option value="${a.id}" ${impedido || semCompetencia ? 'disabled' : ''}>${escapeHtml(a.nome)}${aviso}</option>`;
          }).join('')}</select>
        </div>
          <div class="form-group"><label style="font-weight:400;font-size:12px">Papel</label>
            <select id="eq-papel"><option value="auditor">Auditor</option><option value="lider">Líder</option></select>
          </div>
          <div class="form-group"><button type="button" class="btn btn-secondary btn-block" id="btn-add-equipe">Adicionar</button></div>
        </div>` : '<p class="text-muted" style="font-size:12px;margin-top:0.75rem">Nenhum auditor cadastrado ainda — cadastre na aba "Auditores" primeiro.</p>'}
      </div>`;

    area.querySelectorAll('[data-remover-equipe]').forEach((btn) => btn.addEventListener('click', async () => {
      await supabase.from('auditorias_equipe').delete().eq('auditoria_id', auditoria.id).eq('auditor_id', btn.dataset.removerEquipe);
      equipe = equipe.filter((e) => e.auditor_id !== btn.dataset.removerEquipe);
      renderLista();
    }));
    const btnAdd = area.querySelector('#btn-add-equipe');
    if (btnAdd) btnAdd.addEventListener('click', async () => {
      const auditor_id = area.querySelector('#eq-auditor').value;
      if (!auditor_id) return toast('Nenhum auditor disponível para designar.', 'erro');
      const papel = area.querySelector('#eq-papel').value;
      const { error } = await supabase.from('auditorias_equipe').insert({ auditoria_id: auditoria.id, auditor_id, papel });
      if (error) return toast('Erro ao designar: ' + error.message, 'erro');
      equipe.push({ auditoria_id: auditoria.id, auditor_id, papel });
      renderLista();
    });
  }
  renderLista();
}

function montarExecucao(state, modal, auditoria, processos, aoAtualizarLista) {
  const { supabase, user } = state;
  const area = modal.querySelector('#ad-execucao-area');
  if (!area) return;

  async function carregarERenderizar() {
    const { data: achados } = await supabase.from('auditorias_achados').select('*').eq('auditoria_id', auditoria.id).order('created_at', { ascending: false });
    const lista = achados || [];
    const contagem = { conforme: 0, nc_maior: 0, nc_menor: 0, observacao: 0, oportunidade_melhoria: 0 };
    lista.forEach((a) => { contagem[a.resultado] = (contagem[a.resultado] || 0) + 1; });

    area.innerHTML = `
      <div class="filters" style="margin-bottom:10px">
        ${Object.entries(RESULTADO_LABEL).map(([v, l]) => `<span class="badge ${RESULTADO_BADGE[v]}">${l}: ${contagem[v] || 0}</span>`).join(' ')}
      </div>
      <table class="table">
        <thead><tr><th>Processo</th><th>Norma</th><th>Requisito</th><th>Resultado</th><th>Entrevistado</th><th></th></tr></thead>
        <tbody>${lista.map((a) => `
          <tr>
            <td>${escapeHtml(a.processo || '—')}</td><td>${a.norma ? NORMA_LABEL[a.norma] : '—'}</td><td>${escapeHtml(a.requisito || '—')}</td>
            <td><span class="badge ${RESULTADO_BADGE[a.resultado]}">${RESULTADO_LABEL[a.resultado]}</span></td>
            <td>${escapeHtml(a.entrevistado || '—')}</td>
            <td class="table-actions">${a.anexo_nome ? `<button type="button" class="icon-btn" data-ver-anexo="${a.id}"><i class="ti ti-paperclip"></i></button>` : ''}
              <button type="button" class="icon-btn" data-excluir-achado="${a.id}"><i class="ti ti-trash"></i></button></td>
          </tr>`).join('') || '<tr><td colspan="6" class="text-muted">Nenhum achado registrado.</td></tr>'}</tbody>
      </table>
      <div class="form-row">
        <div class="form-group"><label style="font-weight:400;font-size:12px">Processo</label>
          <select id="ex-processo"><option value="">—</option>${processos.map((p) => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label style="font-weight:400;font-size:12px">Norma</label>
          <select id="ex-norma"><option value="">—</option>${Object.entries(NORMA_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label style="font-weight:400;font-size:12px">Requisito</label><input type="text" id="ex-requisito"></div>
      </div>
      <div class="form-group"><label style="font-weight:400;font-size:12px">Evidência</label><textarea id="ex-evidencia" rows="2"></textarea></div>
      <div class="form-row">
        <div class="form-group"><label style="font-weight:400;font-size:12px">Entrevistado</label><input type="text" id="ex-entrevistado"></div>
        <div class="form-group"><label style="font-weight:400;font-size:12px">Resultado</label>
          <select id="ex-resultado">${Object.entries(RESULTADO_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label style="font-weight:400;font-size:12px">Anexo (opcional)</label><input type="file" id="ex-anexo"></div>
      </div>
      <button type="button" class="btn btn-secondary btn-block" id="btn-add-achado">Registrar achado</button>
    `;

    area.querySelectorAll('[data-excluir-achado]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!(await confirmar('Excluir este achado?'))) return;
      await supabase.from('auditorias_achados').delete().eq('id', btn.dataset.excluirAchado);
      carregarERenderizar();
    }));
    area.querySelectorAll('[data-ver-anexo]').forEach((btn) => btn.addEventListener('click', async () => {
      const achado = lista.find((a) => a.id === btn.dataset.verAnexo);
      const { data, error } = await supabase.storage.from('evidencias-auditorias').createSignedUrl(achado.anexo_url, 300);
      if (error) return toast('Erro ao abrir anexo: ' + error.message, 'erro');
      window.open(data.signedUrl, '_blank');
    }));

    area.querySelector('#btn-add-achado').addEventListener('click', async () => {
      const processoId = area.querySelector('#ex-processo').value || null;
      const resultado = area.querySelector('#ex-resultado').value;
      const payload = {
        auditoria_id: auditoria.id,
        processo_id: processoId,
        processo: processoId ? (processos.find((p) => p.id === processoId)?.nome || null) : null,
        norma: area.querySelector('#ex-norma').value || null,
        requisito: area.querySelector('#ex-requisito').value.trim() || null,
        evidencia: area.querySelector('#ex-evidencia').value.trim() || null,
        entrevistado: area.querySelector('#ex-entrevistado').value.trim() || null,
        resultado,
        registrado_por: user.id,
      };
      const { data: salvo, error } = await supabase.from('auditorias_achados').insert(payload).select().single();
      if (error) return toast('Erro ao registrar achado: ' + error.message, 'erro');

      const arquivo = area.querySelector('#ex-anexo').files[0];
      if (arquivo) {
        const nomeSanitizado = arquivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
        const caminho = `${state.empresaAtual.id}/${salvo.id}/${nomeSanitizado}`;
        const { error: errUpload } = await supabase.storage.from('evidencias-auditorias').upload(caminho, arquivo, { upsert: true });
        if (!errUpload) await supabase.from('auditorias_achados').update({ anexo_url: caminho, anexo_nome: arquivo.name }).eq('id', salvo.id);
      }

      toast(resultado === 'nc_maior' || resultado === 'nc_menor' ? 'Achado registrado — ação corretiva gerada automaticamente em Gestão de Ações.' : 'Achado registrado.', 'sucesso');
      carregarERenderizar();
      if (aoAtualizarLista) aoAtualizarLista();
    });
  }

  carregarERenderizar();
}

function montarAprovacao(state, modal, auditoria) {
  const { supabase, user } = state;
  const area = modal.querySelector('#ad-aprovacao-area');
  if (!area) return;

  async function carregarERenderizar() {
    const { data: existentes } = await supabase.from('auditorias_aprovacoes').select('*').eq('auditoria_id', auditoria.id);
    const porEtapa = new Map((existentes || []).map((e) => [e.etapa, e]));

    area.innerHTML = `
      <table class="table">
        <thead><tr><th>Etapa</th><th>Status</th><th>Comentário</th><th></th></tr></thead>
        <tbody>
          ${Object.entries(ETAPA_LABEL).map(([etapa, label]) => {
            const registro = porEtapa.get(etapa);
            const status = registro?.status || 'pendente';
            return `
            <tr>
              <td>${label}</td>
              <td><span class="badge ${status === 'aprovado' ? 'badge-success' : status === 'reprovado' ? 'badge-danger' : 'badge-neutral'}">${status}</span></td>
              <td>${escapeHtml(registro?.comentario || '—')}</td>
              <td class="table-actions">
                <button type="button" class="icon-btn" data-aprovar="${etapa}" title="Aprovar"><i class="ti ti-check"></i></button>
                <button type="button" class="icon-btn" data-reprovar="${etapa}" title="Reprovar"><i class="ti ti-x"></i></button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    area.querySelectorAll('[data-aprovar], [data-reprovar]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const etapa = btn.dataset.aprovar || btn.dataset.reprovar;
        const status = btn.dataset.aprovar ? 'aprovado' : 'reprovado';
        const { error } = await supabase.from('auditorias_aprovacoes').upsert(
          { auditoria_id: auditoria.id, etapa, status, aprovador_id: user.id, data: new Date().toISOString() },
          { onConflict: 'auditoria_id,etapa' }
        );
        if (error) return toast('Erro: ' + error.message, 'erro');
        carregarERenderizar();
      });
    });
  }
  carregarERenderizar();
}

function imprimirRelatorio(state, auditoria) {
  (async () => {
    const { supabase } = state;
    const [{ data: achados }, { data: equipe }] = await Promise.all([
      supabase.from('auditorias_achados').select('*').eq('auditoria_id', auditoria.id),
      supabase.from('auditorias_equipe').select('*, auditores(nome)').eq('auditoria_id', auditoria.id),
    ]);
    const lista = achados || [];
    const contagem = { conforme: 0, nc_maior: 0, nc_menor: 0, observacao: 0, oportunidade_melhoria: 0 };
    lista.forEach((a) => { contagem[a.resultado] = (contagem[a.resultado] || 0) + 1; });

    imprimirSecao(`
      <h2 style="margin-bottom:4px">Relatório de Auditoria ${escapeHtml(auditoria.numero)}</h2>
      <p class="text-muted">${escapeHtml(auditoria.titulo)}</p>
      <hr class="sep">
      <table class="print-detalhe-tabela">
        <tbody>
          <tr><th>Unidade</th><td>${escapeHtml(auditoria.unidade || '—')}</td></tr>
          <tr><th>Escopo</th><td>${escapeHtml(auditoria.escopo || '—')}</td></tr>
          <tr><th>Objetivo</th><td>${escapeHtml(auditoria.objetivo || '—')}</td></tr>
          <tr><th>Normas auditadas</th><td>${(auditoria.normas || []).map((n) => NORMA_LABEL[n]).join(', ') || '—'}</td></tr>
          <tr><th>Equipe auditora</th><td>${(equipe || []).map((e) => escapeHtml(e.auditores?.nome || '—') + (e.papel === 'lider' ? ' (Líder)' : '')).join(', ') || '—'}</td></tr>
          <tr><th>Conclusão</th><td>${auditoria.conclusao ? CONCLUSAO_LABEL[auditoria.conclusao] : '—'}</td></tr>
        </tbody>
      </table>
      <h4 style="margin-top:16px">Indicadores</h4>
      <ul>${Object.entries(RESULTADO_LABEL).map(([v, l]) => `<li>${l}: ${contagem[v] || 0}</li>`).join('')}</ul>
      <h4 style="margin-top:16px">Achados</h4>
      <table class="table">
        <thead><tr><th>Processo</th><th>Norma</th><th>Requisito</th><th>Resultado</th></tr></thead>
        <tbody>${lista.map((a) => `<tr><td>${escapeHtml(a.processo || '—')}</td><td>${a.norma ? NORMA_LABEL[a.norma] : '—'}</td><td>${escapeHtml(a.requisito || '—')}</td><td>${RESULTADO_LABEL[a.resultado]}</td></tr>`).join('') || '<tr><td colspan="4">Nenhum achado.</td></tr>'}</tbody>
      </table>
    `);
  })();
}

// ==================== DASHBOARD ====================
async function renderDashboard(container, state) {
  const { supabase, empresaAtual } = state;
  container.innerHTML = `<div class="card">${renderFiltrosGrupo()}<div id="dash-corpo" style="margin-top:1rem">Carregando...</div></div>`;
  wireFiltrosGrupo(container, state);
  const area = container.querySelector('#dash-corpo');

  const [{ data: auditorias }, { data: achados }, { data: planos }] = await Promise.all([
    supabase.from('auditorias').select('*').eq('empresa_id', empresaAtual.id),
    supabase.from('auditorias_achados').select('*, auditorias!inner(empresa_id)').eq('auditorias.empresa_id', empresaAtual.id),
    supabase.from('planos_acao').select('*').eq('empresa_id', empresaAtual.id).eq('origem', 'auditoria'),
  ]);
  const listaAuditorias = auditorias || [];
  const listaAchados = achados || [];
  const listaPlanos = planos || [];

  const planejadas = listaAuditorias.length;
  const realizadas = listaAuditorias.filter((a) => ['concluida', 'aprovada', 'reprovada', 'arquivada'].includes(a.status)).length;
  const internas = listaAuditorias.filter((a) => a.tipo === 'interna').length;
  const externas = listaAuditorias.length - internas;

  const porNorma = { iso9001: 0, iso14001: 0, iso45001: 0, outra: 0 };
  listaAuditorias.forEach((a) => (a.normas || []).forEach((n) => { porNorma[n] = (porNorma[n] || 0) + 1; }));

  const ncPorResultado = { nc_maior: 0, nc_menor: 0 };
  listaAchados.forEach((a) => { if (ncPorResultado[a.resultado] !== undefined) ncPorResultado[a.resultado]++; });

  const acoesEmAtraso = listaPlanos.filter((p) => p.status !== 'concluido' && p.quando && p.quando < new Date().toISOString().slice(0, 10)).length;
  const acoesConcluidas = listaPlanos.filter((p) => p.status === 'concluido').length;

  const horasPlanejadas = listaAuditorias.reduce((s, a) => s + (a.horas_totais || 0), 0);

  area.innerHTML = `
    <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:1.25rem">
      <div class="stat-box" style="padding:14px;border-radius:8px;background:var(--surface-1)"><div class="text-muted" style="font-size:12px">Planejadas x Realizadas</div><div style="font-size:22px;font-weight:700">${planejadas} / ${realizadas}</div></div>
      <div class="stat-box" style="padding:14px;border-radius:8px;background:var(--surface-1)"><div class="text-muted" style="font-size:12px">Internas x Externas</div><div style="font-size:22px;font-weight:700">${internas} / ${externas}</div></div>
      <div class="stat-box" style="padding:14px;border-radius:8px;background:var(--surface-1)"><div class="text-muted" style="font-size:12px">NC Maiores / Menores</div><div style="font-size:22px;font-weight:700">${ncPorResultado.nc_maior} / ${ncPorResultado.nc_menor}</div></div>
      <div class="stat-box" style="padding:14px;border-radius:8px;background:var(--surface-1)"><div class="text-muted" style="font-size:12px">Ações em atraso</div><div style="font-size:22px;font-weight:700;color:${acoesEmAtraso ? '#ef4444' : 'inherit'}">${acoesEmAtraso}</div></div>
      <div class="stat-box" style="padding:14px;border-radius:8px;background:var(--surface-1)"><div class="text-muted" style="font-size:12px">Ações concluídas</div><div style="font-size:22px;font-weight:700">${acoesConcluidas}</div></div>
      <div class="stat-box" style="padding:14px;border-radius:8px;background:var(--surface-1)"><div class="text-muted" style="font-size:12px">Horas planejadas (total)</div><div style="font-size:22px;font-weight:700">${horasPlanejadas.toFixed(1)}h</div></div>
    </div>
    <div class="card" style="padding:14px">
      <p style="font-weight:700;color:var(--navy);margin-bottom:10px">Auditorias por norma</p>
      ${Object.entries(NORMA_LABEL).map(([v, l]) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span>${l}</span><span class="badge badge-neutral">${porNorma[v] || 0}</span></div>
      `).join('')}
    </div>
  `;
}
