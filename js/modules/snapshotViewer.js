import { abrirModal, toast, escapeHtml, formatarValor, formatarMesAno } from '../ui.js';
import { PERSPECTIVAS, STATUS as STATUS_OBJETIVO } from './objetivos.js';

// Rótulos locais (padrão já usado nos demais módulos: cada tela mantém sua própria cópia dos
// rótulos em vez de um dicionário global compartilhado).
const CLASSIFICACAO_LABEL = { com_meta: 'Com meta', monitoramento: 'Monitoramento', complementar: 'Complementar' };
const POLARIDADE_LABEL = { maior_melhor: 'Maior é melhor', menor_melhor: 'Menor é melhor' };
const STATUS_PLANO_LABEL = { nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento', concluido: 'Concluído', atrasado: 'Atrasado' };
const ORIGEM_LABEL = { objetivo: 'Objetivo', indicador: 'Indicador', risco: 'Risco/Oportunidade', nc: 'Não Conformidade', rac: 'Ata de Reunião' };
const SWOT_CATS = { forca: 'Força', fraqueza: 'Fraqueza', oportunidade: 'Oportunidade', ameaca: 'Ameaça' };
const TIPO_CONTEXTO_LABEL = { swot: 'SWOT', pestel: 'PESTEL' };
const INFLUENCIA_LABEL = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' };
const TIPO_MACROFLUXO_LABEL = { direcao: 'Direção', principal: 'Processo Principal', apoio: 'Processo de Apoio' };
const TIPO_RISCO_LABEL = { risco: 'Risco', oportunidade: 'Oportunidade' };

function formatarData(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

function formatarDataHora(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function vazio(msg) {
  return `<div class="empty-state"><i class="ti ti-file-off"></i>${escapeHtml(msg)}</div>`;
}

function renderObjetivos(objetivos, nomePorId) {
  if (!objetivos.length) return vazio('Nenhum objetivo estratégico neste ano.');
  return `
    <table class="table">
      <thead><tr><th>Objetivo</th><th>Perspectiva BSC</th><th>Responsável</th><th>Status</th></tr></thead>
      <tbody>
        ${objetivos.map((o) => `
          <tr>
            <td><strong>${escapeHtml(o.nome)}</strong>${o.descricao ? `<br><span class="text-muted">${escapeHtml(o.descricao)}</span>` : ''}</td>
            <td>${escapeHtml(PERSPECTIVAS[o.perspectiva_bsc] || o.perspectiva_bsc)}</td>
            <td>${escapeHtml(nomePorId.get(o.responsavel_id) || '—')}</td>
            <td><span class="badge badge-neutral">${escapeHtml(STATUS_OBJETIVO[o.status] || o.status)}</span></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderIndicadores(indicadores, resultados, nomePorId) {
  if (!indicadores.length) return vazio('Nenhum indicador neste ano.');
  const resultadosPorIndicador = new Map();
  for (const r of resultados) {
    if (!resultadosPorIndicador.has(r.indicador_id)) resultadosPorIndicador.set(r.indicador_id, []);
    resultadosPorIndicador.get(r.indicador_id).push(r);
  }
  return `
    <table class="table">
      <thead><tr><th>Indicador</th><th>Classificação</th><th>Meta</th><th>Periodicidade</th><th>Responsável</th><th>Resultados apurados</th></tr></thead>
      <tbody>
        ${indicadores.map((ind) => {
          const res = (resultadosPorIndicador.get(ind.id) || []).sort((a, b) => a.periodo.localeCompare(b.periodo));
          const resTexto = res.length
            ? res.map((r) => `${formatarMesAno(r.periodo)}: ${formatarValor(r.valor_realizado, ind.unidade)}`).join(', ')
            : '—';
          return `
          <tr>
            <td><strong>${escapeHtml(ind.nome)}</strong>${ind.formula ? `<br><span class="text-muted">${escapeHtml(ind.formula)}</span>` : ''}</td>
            <td>${escapeHtml(CLASSIFICACAO_LABEL[ind.classificacao] || ind.classificacao || '—')}</td>
            <td>${ind.meta !== null && ind.meta !== undefined ? `${formatarValor(ind.meta, ind.unidade)} ${escapeHtml(ind.unidade || '')}<br><span class="text-muted">${escapeHtml(POLARIDADE_LABEL[ind.polaridade] || '')}</span>` : '—'}</td>
            <td>${escapeHtml(ind.periodicidade || '—')}</td>
            <td>${escapeHtml(nomePorId.get(ind.responsavel_id) || '—')}</td>
            <td class="text-muted">${escapeHtml(resTexto)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function renderPlanos(planos, itens, nomePorId) {
  if (!planos.length) return vazio('Nenhum plano de ação neste ano.');
  const itensPorPlano = new Map();
  for (const it of itens) {
    if (!itensPorPlano.has(it.plano_acao_id)) itensPorPlano.set(it.plano_acao_id, []);
    itensPorPlano.get(it.plano_acao_id).push(it);
  }
  return `
    <table class="table">
      <thead><tr><th>Nº</th><th>Título</th><th>Origem</th><th>Responsável</th><th>Status</th><th>% Conclusão</th><th>Prazo</th><th>Tarefas</th></tr></thead>
      <tbody>
        ${planos.map((p) => {
          const its = itensPorPlano.get(p.id) || [];
          const concluidas = its.filter((i) => i.status === 'concluido').length;
          return `
          <tr>
            <td>${escapeHtml(p.numero || '—')}</td>
            <td><strong>${escapeHtml(p.titulo)}</strong>${p.o_que ? `<br><span class="text-muted">${escapeHtml(p.o_que)}</span>` : ''}</td>
            <td>${escapeHtml(ORIGEM_LABEL[p.origem] || p.origem || '—')}</td>
            <td>${escapeHtml(nomePorId.get(p.responsavel_id) || '—')}</td>
            <td><span class="badge badge-neutral">${escapeHtml(STATUS_PLANO_LABEL[p.status] || p.status)}</span></td>
            <td>${p.percentual_conclusao ?? 0}%</td>
            <td>${formatarData(p.quando)}</td>
            <td>${its.length ? `${concluidas} de ${its.length} concluídas` : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function renderContexto(rows) {
  if (!rows.length) return vazio('Nenhum registro de contexto (SWOT) neste ano.');
  return `
    <table class="table">
      <thead><tr><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Revisado em</th></tr></thead>
      <tbody>
        ${rows.map((c) => `
          <tr>
            <td>${escapeHtml(TIPO_CONTEXTO_LABEL[c.tipo] || c.tipo)}</td>
            <td>${escapeHtml(SWOT_CATS[c.categoria] || c.categoria || '—')}</td>
            <td>${escapeHtml(c.descricao)}</td>
            <td>${formatarData(c.data_revisao)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderPartes(rows) {
  if (!rows.length) return vazio('Nenhuma parte interessada neste ano.');
  return `
    <table class="table">
      <thead><tr><th>Parte Interessada</th><th>Necessidades/Expectativas</th><th>Influência</th></tr></thead>
      <tbody>
        ${rows.map((p) => `
          <tr>
            <td><strong>${escapeHtml(p.nome)}</strong></td>
            <td>${escapeHtml(p.necessidades || '—')}</td>
            <td><span class="badge badge-neutral">${escapeHtml(INFLUENCIA_LABEL[p.nivel_influencia] || p.nivel_influencia)}</span></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderMacrofluxo(rows) {
  if (!rows.length) return vazio('Nenhum processo de macrofluxo neste ano.');
  const ordenado = [...rows].sort((a, b) => (a.tipo === b.tipo ? a.ordem - b.ordem : a.tipo.localeCompare(b.tipo)));
  return `
    <table class="table">
      <thead><tr><th>Tipo</th><th>Processo</th><th>Descrição</th></tr></thead>
      <tbody>
        ${ordenado.map((m) => `
          <tr>
            <td><span class="badge badge-neutral">${escapeHtml(TIPO_MACROFLUXO_LABEL[m.tipo] || m.tipo)}</span></td>
            <td><strong>${escapeHtml(m.nome)}</strong></td>
            <td>${escapeHtml(m.descricao || '—')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderRiscos(rows, objetivoNomePorId) {
  if (!rows.length) return vazio('Nenhum risco ou oportunidade neste ano.');
  return `
    <table class="table">
      <thead><tr><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Probabilidade</th><th>Impacto</th><th>Objetivo vinculado</th></tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td><span class="badge badge-neutral">${escapeHtml(TIPO_RISCO_LABEL[r.tipo] || r.tipo)}</span></td>
            <td>${escapeHtml(r.descricao)}</td>
            <td>${escapeHtml(r.categoria || '—')}</td>
            <td>${r.probabilidade}</td>
            <td>${r.impacto}</td>
            <td>${escapeHtml(objetivoNomePorId.get(r.objetivo_id) || '—')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// Abre o modal de visualização de um ano fechado (ciclos_pe), buscando o conteúdo congelado em
// ciclos_pe_snapshot (uma linha por tabela, gravada pela função fechar_ciclo_pe — migração 0026).
// Somente leitura: não existe nenhuma ação de edição dentro deste visualizador.
export async function abrirSnapshot(state, ciclo) {
  const { supabase, empresaAtual } = state;

  const [{ data: snapRows, error }, { data: membrosRaw }] = await Promise.all([
    supabase.from('ciclos_pe_snapshot').select('tabela, dados').eq('ciclo_id', ciclo.id),
    supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id }),
  ]);
  if (error) return toast('Erro ao carregar o snapshot: ' + error.message, 'erro');

  const nomePorId = new Map((membrosRaw || []).map((m) => [m.usuario_id, m.nome || m.email]));
  const dadosPorTabela = new Map((snapRows || []).map((r) => [r.tabela, r.dados || []]));
  const objetivos = dadosPorTabela.get('objetivos_estrategicos') || [];
  const objetivoNomePorId = new Map(objetivos.map((o) => [o.id, o.nome]));

  const abas = [
    { chave: 'objetivos', label: 'Objetivos', html: () => renderObjetivos(objetivos, nomePorId) },
    { chave: 'indicadores', label: 'Indicadores', html: () => renderIndicadores(dadosPorTabela.get('indicadores') || [], dadosPorTabela.get('resultados_indicadores') || [], nomePorId) },
    { chave: 'planos', label: 'Planos de Ação', html: () => renderPlanos(dadosPorTabela.get('planos_acao') || [], dadosPorTabela.get('planos_acao_itens') || [], nomePorId) },
    { chave: 'contexto', label: 'Contexto (SWOT)', html: () => renderContexto(dadosPorTabela.get('contexto_organizacional') || []) },
    { chave: 'partes', label: 'Partes Interessadas', html: () => renderPartes(dadosPorTabela.get('partes_interessadas') || []) },
    { chave: 'macrofluxo', label: 'Macrofluxo', html: () => renderMacrofluxo(dadosPorTabela.get('macrofluxo_processos') || []) },
    { chave: 'riscos', label: 'Riscos/Oportunidades', html: () => renderRiscos(dadosPorTabela.get('riscos_oportunidades') || [], objetivoNomePorId) },
  ];

  const modal = abrirModal(`Ano fechado — ${ciclo.ano}`, `
    <p class="text-muted" style="margin-bottom:1rem">Fotografia congelada salva em ${formatarDataHora(ciclo.fechado_em)}. Somente leitura — não afeta os dados vivos do sistema.</p>
    <div class="tabs" id="snap-tabs">
      ${abas.map((a, i) => `<button type="button" class="tab-btn ${i === 0 ? 'active' : ''}" data-tab="${a.chave}">${a.label}</button>`).join('')}
    </div>
    <div id="snap-conteudo"></div>
  `);
  modal.classList.add('modal-xl');

  function mostrarAba(chave) {
    const aba = abas.find((a) => a.chave === chave);
    modal.querySelector('#snap-conteudo').innerHTML = aba.html();
  }

  modal.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      mostrarAba(btn.dataset.tab);
    });
  });

  mostrarAba(abas[0].chave);
}
