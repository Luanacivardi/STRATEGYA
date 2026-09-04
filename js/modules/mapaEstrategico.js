import { escapeHtml, statusSimbolo } from '../ui.js';
import { PERSPECTIVAS, STATUS, statusExibicao, progressoObjetivo } from './objetivos.js';

const ORDEM_LANES = ['financeira', 'clientes', 'processos_internos', 'aprendizado_crescimento'];

// Mapa Estratégico (BSC), unificado dentro da aba Objetivos — recebe a lista de objetivos já
// carregada por objetivos.js (evita buscar de novo) e retorna só o HTML das lanes por perspectiva.
// planosPorObjetivo (Map<objetivoId, number[]>) alimenta o status/progresso de cada card, pra ele
// acompanhar a execução dos planos em vez de ficar travado no status cadastrado manualmente.
export function renderMapa(objetivos, planosPorObjetivo) {
  const lanesHtml = ORDEM_LANES.map((key) => {
    const objs = objetivos.filter((o) => o.perspectiva_bsc === key);
    return `
      <div class="bsc-lane">
        <div class="bsc-lane-title">${PERSPECTIVAS[key]}</div>
        <div class="bsc-lane-cards">
          ${objs.length ? objs.map((o) => {
            const statusAtual = statusExibicao(o, planosPorObjetivo);
            const temPlanos = (planosPorObjetivo.get(o.id) || []).length > 0;
            return `
            <div class="bsc-card">
              <div class="bsc-card-nome">${escapeHtml(o.nome)}</div>
              ${statusSimbolo(statusAtual, STATUS[statusAtual])}
              ${temPlanos ? `<span class="text-muted" style="font-size:11px;margin-left:4px">${Math.round(progressoObjetivo(o, planosPorObjetivo))}% dos planos</span>` : ''}
              <div class="bsc-card-acoes">
                <button type="button" class="icon-btn" data-ver-indicadores="${o.id}" title="Ver indicadores deste objetivo"><i class="ti ti-chart-line"></i></button>
                <button type="button" class="icon-btn" data-ver-planos-objetivo="${o.id}" title="Ver planos de ação deste objetivo"><i class="ti ti-list-check"></i></button>
              </div>
            </div>`;
          }).join('') : '<span class="text-muted">Nenhum objetivo nesta perspectiva.</span>'}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="card-header"><span><i class="ti ti-affiliate"></i> Mapa Estratégico (Balanced Scorecard)</span></div>
      ${objetivos.length ? lanesHtml : '<div class="empty-state"><i class="ti ti-affiliate"></i>Cadastre objetivos estratégicos para visualizar o mapa.</div>'}
    </div>`;
}

// Liga os botões de cada card do mapa: um leva para Indicadores, outro para Planos de Ação,
// ambos já filtrados pelo objetivo clicado.
export function wireMapa(container) {
  container.querySelectorAll('[data-ver-indicadores]').forEach((el) => {
    el.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('strategya:mudar-aba', { detail: { aba: 'indicadores', objetivoId: el.dataset.verIndicadores } }));
    });
  });
  container.querySelectorAll('[data-ver-planos-objetivo]').forEach((el) => {
    el.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('strategya:mudar-aba', { detail: { aba: 'planos', grupo: 'planos', objetivoId: el.dataset.verPlanosObjetivo } }));
    });
  });
}
