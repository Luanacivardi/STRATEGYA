import { escapeHtml, formatarValor } from '../ui.js';

const PERSPECTIVAS = [
  { key: 'financeira', label: 'Financeira' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'processos_internos', label: 'Processos Internos' },
  { key: 'aprendizado_crescimento', label: 'Aprendizado e Crescimento' },
];

function calcularAtingimento(indicador, ultimoResultado) {
  if (!ultimoResultado) return null;
  if (indicador.classificacao && indicador.classificacao !== 'com_meta') return null;
  const { meta, polaridade } = indicador;
  const realizado = Number(ultimoResultado.valor_realizado);
  if (meta === null || meta === undefined || meta === 0) return null;
  const pct = polaridade === 'maior_melhor' ? (realizado / meta) * 100 : (meta / realizado) * 100;
  return Math.max(0, pct);
}

function semaforoClasse(pct) {
  if (pct === null) return 'badge-neutral';
  if (pct >= 100) return 'semaforo-verde';
  if (pct >= 80) return 'semaforo-amarelo';
  return 'semaforo-vermelho';
}

export async function render(container, state) {
  container.innerHTML = '<p class="text-muted">Carregando dashboard...</p>';
  const { supabase, empresaAtual } = state;

  const [{ data: objetivos }, { data: indicadores }] = await Promise.all([
    supabase.from('objetivos_estrategicos').select('*').eq('empresa_id', empresaAtual.id),
    supabase.from('indicadores').select('*').eq('empresa_id', empresaAtual.id),
  ]);

  const indicadorIds = (indicadores || []).map((i) => i.id);
  let resultados = [];
  if (indicadorIds.length) {
    const { data } = await supabase
      .from('resultados_indicadores')
      .select('*')
      .in('indicador_id', indicadorIds)
      .order('periodo', { ascending: false });
    resultados = data || [];
  }

  const ultimoPorIndicador = new Map();
  for (const r of resultados) {
    if (!ultimoPorIndicador.has(r.indicador_id)) ultimoPorIndicador.set(r.indicador_id, r);
  }

  const totalObjetivos = (objetivos || []).length;
  const objetivosAtingidos = (objetivos || []).filter((o) => o.status === 'atingido').length;
  const pctObjetivos = totalObjetivos ? Math.round((objetivosAtingidos / totalObjetivos) * 100) : 0;

  let verde = 0, amarelo = 0, vermelho = 0, semDados = 0;
  const linhasIndicadores = (indicadores || []).map((ind) => {
    const ultimo = ultimoPorIndicador.get(ind.id);
    const pct = calcularAtingimento(ind, ultimo);
    if (pct === null) semDados++;
    else if (pct >= 100) verde++;
    else if (pct >= 80) amarelo++;
    else vermelho++;
    return { ind, ultimo, pct };
  });

  const perspectivaHtml = PERSPECTIVAS.map((p) => {
    const objs = (objetivos || []).filter((o) => o.perspectiva_bsc === p.key);
    const atingidos = objs.filter((o) => o.status === 'atingido').length;
    const pct = objs.length ? Math.round((atingidos / objs.length) * 100) : 0;
    return `
      <div class="dashboard-card">
        <div class="dashboard-card-label">${p.label}</div>
        <div class="dashboard-card-value">${objs.length ? pct + '%' : '—'}</div>
        <div class="text-muted" style="color:rgba(255,255,255,0.5)">${objs.length} objetivo(s)</div>
      </div>`;
  }).join('');

  const indicadoresHtml = linhasIndicadores.length
    ? `<table class="table">
        <thead><tr><th></th><th>Indicador</th><th>Meta</th><th>Último resultado</th><th>Atingimento</th><th></th></tr></thead>
        <tbody>
          ${linhasIndicadores.map(({ ind, ultimo, pct }) => `
            <tr>
              <td><span class="semaforo-dot ${semaforoClasse(pct)}"></span></td>
              <td>${escapeHtml(ind.nome)}</td>
              <td>${ind.meta !== null && ind.meta !== undefined ? `${formatarValor(ind.meta, ind.unidade)} ${escapeHtml(ind.unidade || '')}` : '<span class="text-muted">—</span>'}</td>
              <td>${ultimo ? `${formatarValor(ultimo.valor_realizado, ind.unidade)} ${escapeHtml(ind.unidade || '')} (${ultimo.periodo})` : '<span class="text-muted">sem dados</span>'}</td>
              <td>${pct === null ? '—' : Math.round(pct) + '%'}</td>
              <td><button class="icon-btn" data-ir-indicador="${ind.id}" title="Ver indicador"><i class="ti ti-external-link"></i></button></td>
            </tr>`).join('')}
        </tbody>
      </table>`
    : '<div class="empty-state"><i class="ti ti-chart-line"></i>Nenhum indicador cadastrado ainda.</div>';

  container.innerHTML = `
    <div class="dashboard-grid">
      <div class="dashboard-card" data-atalho="objetivos">
        <div class="dashboard-card-label">Objetivos Estratégicos</div>
        <div class="dashboard-card-value">${totalObjetivos}</div>
      </div>
      <div class="dashboard-card" data-atalho="objetivos">
        <div class="dashboard-card-label">% Objetivos Atingidos</div>
        <div class="dashboard-card-value">${pctObjetivos}%</div>
      </div>
      <div class="dashboard-card" data-atalho="indicadores">
        <div class="dashboard-card-label">Indicadores no Verde</div>
        <div class="dashboard-card-value">${verde}</div>
      </div>
      <div class="dashboard-card" data-atalho="indicadores">
        <div class="dashboard-card-label">Indicadores no Vermelho</div>
        <div class="dashboard-card-value">${vermelho}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span><i class="ti ti-layout-grid"></i> Desempenho por Perspectiva BSC</span></div>
      <div class="dashboard-grid">${perspectivaHtml}</div>
    </div>

    <div class="card">
      <div class="card-header"><span><i class="ti ti-traffic-lights"></i> Semáforo de Indicadores</span></div>
      ${indicadoresHtml}
      ${semDados ? `<p class="text-muted" style="margin-top:8px">${semDados} indicador(es) ainda sem resultado apurado.</p>` : ''}
    </div>
  `;

  container.querySelectorAll('[data-atalho]').forEach((el) => {
    el.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('strategya:mudar-aba', { detail: { aba: el.dataset.atalho, grupo: el.dataset.grupo } }));
    });
  });

  container.querySelectorAll('[data-ir-indicador]').forEach((el) => {
    el.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('strategya:mudar-aba', { detail: { aba: 'indicadores', indicadorId: el.dataset.irIndicador } }));
    });
  });
}
