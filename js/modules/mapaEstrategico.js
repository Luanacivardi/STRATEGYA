import { escapeHtml } from '../ui.js';
import { PERSPECTIVAS } from './objetivos.js';

const ORDEM_LANES = ['financeira', 'clientes', 'processos_internos', 'aprendizado_crescimento'];

// Mapa Estratégico (BSC), unificado dentro da aba Objetivos — recebe a lista de objetivos já
// carregada por objetivos.js (evita buscar de novo) e retorna só o HTML das lanes por perspectiva.
export function renderMapa(objetivos) {
  const lanesHtml = ORDEM_LANES.map((key) => {
    const objs = objetivos.filter((o) => o.perspectiva_bsc === key);
    return `
      <div class="bsc-lane">
        <div class="bsc-lane-title">${PERSPECTIVAS[key]}</div>
        <div class="bsc-lane-cards">
          ${objs.length ? objs.map((o) => `
            <div class="bsc-card" data-objetivo="${o.id}" title="Ver indicadores deste objetivo">
              <div class="bsc-card-nome">${escapeHtml(o.nome)}</div>
              <span class="badge status-${o.status}">${o.status.replaceAll('_', ' ')}</span>
            </div>`).join('') : '<span class="text-muted">Nenhum objetivo nesta perspectiva.</span>'}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="card-header"><span><i class="ti ti-affiliate"></i> Mapa Estratégico (Balanced Scorecard)</span></div>
      ${objetivos.length ? lanesHtml : '<div class="empty-state"><i class="ti ti-affiliate"></i>Cadastre objetivos estratégicos para visualizar o mapa.</div>'}
    </div>`;
}

// Liga o clique nos cards do mapa (navega para Indicadores já filtrado pelo objetivo).
export function wireMapa(container) {
  container.querySelectorAll('[data-objetivo]').forEach((el) => {
    el.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('strategya:mudar-aba', { detail: { aba: 'indicadores', objetivoId: el.dataset.objetivo } }));
    });
  });
}
