import { escapeHtml } from '../ui.js';
import { PERSPECTIVAS } from './objetivos.js';

const ORDEM_LANES = ['financeira', 'clientes', 'processos_internos', 'aprendizado_crescimento'];

// ---------- Cor de cada faixa (fixas, 4 perspectivas só) — mesma lógica de mistura navy/gold do
// organograma (ver js/modules/organograma.js), reimplementada aqui em miniatura pra não acoplar
// os dois módulos por causa de umas poucas funções de cor. ----------
function hexParaRgb(hex) {
  const v = hex.replace('#', '');
  return [parseInt(v.substring(0, 2), 16), parseInt(v.substring(2, 4), 16), parseInt(v.substring(4, 6), 16)];
}
function rgbParaHex(r, g, b) {
  return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}
function misturarCores(hexA, hexB, pesoA) {
  const [r1, g1, b1] = hexParaRgb(hexA);
  const [r2, g2, b2] = hexParaRgb(hexB);
  const canal = (a, b) => a * pesoA + b * (1 - pesoA);
  return rgbParaHex(canal(r1, r2), canal(g1, g2), canal(b1, b2));
}
function luminanciaRgb(r, g, b) {
  const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function corTextoParaFundo(hex) {
  const [r, g, b] = hexParaRgb(hex);
  return luminanciaRgb(r, g, b) > 0.6 ? '#1a1a2e' : '#ffffff';
}

function coresPorPerspectiva() {
  const navy = getComputedStyle(document.documentElement).getPropertyValue('--navy').trim() || '#252538';
  const gold = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#E8B84B';
  const goldDark = getComputedStyle(document.documentElement).getPropertyValue('--gold-dark').trim() || '#c99d38';
  return {
    financeira: navy,
    clientes: misturarCores(navy, gold, 0.35),
    processos_internos: goldDark,
    aprendizado_crescimento: misturarCores(navy, gold, 0.7),
  };
}

// Mapa Estratégico (BSC), unificado dentro da aba Objetivos — recebe a lista de objetivos já
// carregada por objetivos.js (evita buscar de novo) e retorna só o HTML das lanes por perspectiva.
// Layout inspirado num mapa estratégico clássico: faixa colorida por perspectiva à esquerda
// (rótulo na vertical) e os objetivos em caixas largas coloridas na mesma cor da faixa.
export function renderMapa(objetivos) {
  const cores = coresPorPerspectiva();
  const lanesHtml = ORDEM_LANES.map((key) => {
    const objs = objetivos.filter((o) => o.perspectiva_bsc === key);
    const cor = cores[key];
    const corTexto = corTextoParaFundo(cor);
    return `
      <div class="bsc-lane" style="--bsc-cor:${cor};--bsc-cor-texto:${corTexto}">
        <div class="bsc-lane-label"><span>${PERSPECTIVAS[key]}</span></div>
        <div class="bsc-lane-cards">
          ${objs.length ? objs.map((o) => `
            <div class="bsc-card" data-objetivo="${o.id}" title="Ver indicadores deste objetivo">
              <div class="bsc-card-nome">${escapeHtml(o.nome)}</div>
              ${o.descricao ? `<div class="bsc-card-desc">${escapeHtml(o.descricao)}</div>` : ''}
              <span class="badge status-${o.status}">${o.status.replaceAll('_', ' ')}</span>
            </div>`).join('') : '<span class="text-muted">Nenhum objetivo nesta perspectiva.</span>'}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="card-header"><span><i class="ti ti-affiliate"></i> Mapa Estratégico (Balanced Scorecard)</span></div>
      ${objetivos.length ? `<div class="bsc-mapa">${lanesHtml}</div>` : '<div class="empty-state"><i class="ti ti-affiliate"></i>Cadastre objetivos estratégicos para visualizar o mapa.</div>'}
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
