import { abrirModal, fecharModal, toast, escapeHtml, confirmar, dataValida, enviarPorEmail, imprimirSecao } from '../ui.js';
import * as macrofluxo from './macrofluxo.js';
import * as partesInteressadas from './partesInteressadas.js';

const SWOT_CATS = { forca: 'Forças', fraqueza: 'Fraquezas', oportunidade: 'Oportunidades', ameaca: 'Ameaças' };
const SWOT_CLASSES = { forca: 'swot-forcas', fraqueza: 'swot-fraquezas', oportunidade: 'swot-oportunidades', ameaca: 'swot-ameacas' };

// Fraquezas e ameaças alimentam Riscos e Oportunidades como "risco"; oportunidades, como "oportunidade"
const SWOT_PARA_RISCO = { fraqueza: 'risco', ameaca: 'risco', oportunidade: 'oportunidade' };

let grupoAtivo = 'cenario'; // 'cenario' (SWOT) | 'partes' | 'empresa' | 'macrofluxo'

// Permite navegar direto para um grupo (ex: atalho do Dashboard para o Macrofluxo)
export function irParaGrupo(grupo) {
  grupoAtivo = grupo;
}

function renderFiltrosGrupo() {
  return `
    <nav class="tabs">
      <button class="tab-btn ${grupoAtivo === 'cenario' ? 'active' : ''}" data-grupo="cenario">Análise SWOT</button>
      <button class="tab-btn ${grupoAtivo === 'partes' ? 'active' : ''}" data-grupo="partes">Partes Interessadas</button>
      <button class="tab-btn ${grupoAtivo === 'empresa' ? 'active' : ''}" data-grupo="empresa">Informações da Empresa</button>
      <button class="tab-btn ${grupoAtivo === 'macrofluxo' ? 'active' : ''}" data-grupo="macrofluxo">Macrofluxo</button>
    </nav>`;
}

function wireFiltrosGrupo(container, state) {
  container.querySelectorAll('[data-grupo]').forEach((btn) => {
    btn.addEventListener('click', () => { grupoAtivo = btn.dataset.grupo; render(container, state); });
  });
}

export async function render(container, state) {
  if (grupoAtivo === 'empresa') return renderMissaoVisaoValores(container, state);
  if (grupoAtivo === 'macrofluxo') return renderMacrofluxo(container, state);
  if (grupoAtivo === 'partes') return renderPartes(container, state);
  return renderCenario(container, state);
}

async function renderPartes(container, state) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><span><i class="ti ti-map-2"></i> Contexto Organizacional</span></div>
      ${renderFiltrosGrupo()}
      <div id="contexto-partes-corpo"></div>
    </div>
  `;
  wireFiltrosGrupo(container, state);
  await partesInteressadas.render(container.querySelector('#contexto-partes-corpo'), state);
}

async function renderCenario(container, state) {
  const { supabase, empresaAtual, papelAtual } = state;
  const podeEditar = papelAtual !== 'usuario';

  const { data, error } = await supabase
    .from('contexto_organizacional')
    .select('*')
    .eq('empresa_id', empresaAtual.id)
    .eq('tipo', 'swot');
  const itens = data ? [...data].sort((a, b) => a.descricao.localeCompare(b.descricao)) : data;

  if (error) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar contexto: ${escapeHtml(error.message)}</div>`;
    return;
  }

  const cats = SWOT_CATS;

  const corpo = `<div class="swot-grid">${Object.entries(cats).map(([cat, label]) => renderQuadrante(cat, label, itens, podeEditar)).join('')}</div>`;

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span><i class="ti ti-map-2"></i> Contexto Organizacional</span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" id="btn-email-contexto"><i class="ti ti-mail"></i> Enviar por e-mail</button>
          <button class="btn btn-secondary btn-sm" id="btn-imprimir-contexto"><i class="ti ti-printer"></i> Imprimir</button>
          ${podeEditar ? '<button class="btn btn-primary btn-sm" id="btn-add-contexto"><i class="ti ti-plus"></i> Novo item</button>' : ''}
        </div>
      </div>
      ${renderFiltrosGrupo()}
      ${corpo}
    </div>
  `;

  wireFiltrosGrupo(container, state);

  container.querySelector('#btn-imprimir-contexto').addEventListener('click', () => {
    imprimirSecao(`
      <h2 style="margin-bottom:4px">Contexto Organizacional — Análise SWOT</h2>
      <p class="text-muted">${escapeHtml(empresaAtual.nome)}</p>
      <hr class="sep">
      <div class="print-swot-grid">
        ${Object.entries(cats).map(([cat, label]) => {
          const doQuad = itens.filter((i) => i.categoria === cat);
          return `
            <div class="print-swot-quad">
              <h4>${label}</h4>
              ${doQuad.length ? `<ul>${doQuad.map((i) => `<li>${escapeHtml(i.descricao)}</li>`).join('')}</ul>` : '<p class="text-muted">Nenhum item.</p>'}
            </div>`;
        }).join('')}
      </div>
    `);
  });
  container.querySelector('#btn-email-contexto').addEventListener('click', () => {
    const corpo = Object.entries(cats).map(([cat, label]) => {
      const doQuad = itens.filter((i) => i.categoria === cat);
      return `${label}:\n${doQuad.length ? doQuad.map((i) => `- ${i.descricao}`).join('\n') : '- (nenhum item)'}`;
    }).join('\n\n');
    enviarPorEmail('Contexto Organizacional (SWOT)', corpo);
  });

  const btnAdd = container.querySelector('#btn-add-contexto');
  if (btnAdd) btnAdd.addEventListener('click', () => abrirFormulario(state, container, cats));

  container.querySelectorAll('[data-abrir-risco]').forEach((el) => {
    el.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('strategya:abrir-risco', { detail: { id: el.dataset.abrirRisco } }));
    });
  });

  container.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = itens.find((i) => i.id === btn.dataset.editar);
      abrirFormulario(state, container, cats, item);
    });
  });

  container.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Excluir este item do contexto?'))) return;
      const { error: errDel } = await supabase.from('contexto_organizacional').delete().eq('id', btn.dataset.excluir);
      if (errDel) return toast('Erro ao excluir: ' + errDel.message, 'erro');
      toast('Item excluído.', 'sucesso');
      render(container, state);
    });
  });
}

async function renderMacrofluxo(container, state) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><span><i class="ti ti-map-2"></i> Contexto Organizacional</span></div>
      ${renderFiltrosGrupo()}
      <div id="contexto-macrofluxo-corpo"></div>
    </div>
  `;

  wireFiltrosGrupo(container, state);

  await macrofluxo.render(container.querySelector('#contexto-macrofluxo-corpo'), state);
}

async function renderMissaoVisaoValores(container, state) {
  const { supabase, empresaAtual, papelAtual } = state;
  const podeEditar = papelAtual !== 'usuario';

  const { data: empresa, error } = await supabase
    .from('empresas')
    .select('missao, visao, valores')
    .eq('id', empresaAtual.id)
    .single();

  if (error) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar: ${escapeHtml(error.message)}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span><i class="ti ti-map-2"></i> Contexto Organizacional</span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" id="btn-email-contexto"><i class="ti ti-mail"></i> Enviar por e-mail</button>
          <button class="btn btn-secondary btn-sm" id="btn-imprimir-contexto"><i class="ti ti-printer"></i> Imprimir</button>
        </div>
      </div>
      ${renderFiltrosGrupo()}
      <form id="form-mvv">
        <div class="form-group">
          <label>Missão</label>
          <textarea id="mvv-missao" ${podeEditar ? '' : 'readonly'} placeholder="Razão de ser da organização...">${escapeHtml(empresa.missao || '')}</textarea>
        </div>
        <div class="form-group">
          <label>Visão</label>
          <textarea id="mvv-visao" ${podeEditar ? '' : 'readonly'} placeholder="Onde a organização quer chegar...">${escapeHtml(empresa.visao || '')}</textarea>
        </div>
        <div class="form-group">
          <label>Valores</label>
          <textarea id="mvv-valores" ${podeEditar ? '' : 'readonly'} placeholder="Princípios que guiam as decisões...">${escapeHtml(empresa.valores || '')}</textarea>
        </div>
        ${podeEditar ? '<button class="btn btn-primary" type="submit"><i class="ti ti-device-floppy"></i> Salvar</button>' : ''}
      </form>
    </div>
  `;

  wireFiltrosGrupo(container, state);

  container.querySelector('#btn-imprimir-contexto').addEventListener('click', () => {
    imprimirSecao(`
      <h2 style="margin-bottom:4px">Missão, Visão e Valores</h2>
      <p class="text-muted">${escapeHtml(empresaAtual.nome)}</p>
      <hr class="sep">
      <table class="print-detalhe-tabela">
        <tbody>
          <tr><th>Missão</th><td>${escapeHtml(empresa.missao || '—')}</td></tr>
          <tr><th>Visão</th><td>${escapeHtml(empresa.visao || '—')}</td></tr>
          <tr><th>Valores</th><td>${escapeHtml(empresa.valores || '—')}</td></tr>
        </tbody>
      </table>
    `);
  });
  container.querySelector('#btn-email-contexto').addEventListener('click', () => {
    const corpo = `Missão:\n${empresa.missao || '—'}\n\nVisão:\n${empresa.visao || '—'}\n\nValores:\n${empresa.valores || '—'}`;
    enviarPorEmail('Missão, Visão e Valores', corpo);
  });

  if (!podeEditar) return;

  container.querySelector('#form-mvv').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      missao: container.querySelector('#mvv-missao').value.trim(),
      visao: container.querySelector('#mvv-visao').value.trim(),
      valores: container.querySelector('#mvv-valores').value.trim(),
    };
    const { error: errUpd } = await supabase.from('empresas').update(payload).eq('id', empresaAtual.id);
    if (errUpd) return toast('Erro ao salvar: ' + errUpd.message, 'erro');
    toast('Missão, visão e valores salvos com sucesso.', 'sucesso');
  });
}

function renderQuadrante(cat, label, itens, podeEditar) {
  const doQuad = itens.filter((i) => i.categoria === cat);
  return `
    <div class="swot-quad ${SWOT_CLASSES[cat] || ''}">
      <h4>${label} <span class="badge badge-neutral">${doQuad.length}</span></h4>
      ${doQuad.length ? doQuad.map((i) => `
        <div class="swot-item">
          <span class="${i.risco_oportunidade_id ? 'swot-item-clicavel' : ''}" ${i.risco_oportunidade_id ? `data-abrir-risco="${i.risco_oportunidade_id}" title="Ver análise em Riscos e Oportunidades"` : ''}>${escapeHtml(i.descricao)}</span>
          ${podeEditar ? `<span class="swot-item-actions">
            <button class="icon-btn" data-editar="${i.id}" title="Editar"><i class="ti ti-pencil"></i></button>
            <button class="icon-btn" data-excluir="${i.id}" title="Excluir"><i class="ti ti-trash"></i></button>
          </span>` : ''}
        </div>`).join('') : '<p class="text-muted">Nenhum item.</p>'}
    </div>`;
}

function abrirFormulario(state, container, cats, item = null) {
  const { supabase, empresaAtual, user } = state;
  const modal = abrirModal(item ? 'Editar item do contexto' : 'Novo item do contexto', `
    <form id="form-contexto">
      <div class="form-group">
        <label>Categoria</label>
        <select id="ctx-categoria" required>
          ${Object.entries(cats).map(([v, l]) => `<option value="${v}" ${item?.categoria === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Descrição</label>
        <textarea id="ctx-descricao" required>${item ? escapeHtml(item.descricao) : ''}</textarea>
      </div>
      <div class="form-group">
        <label>Data da revisão</label>
        <input type="date" id="ctx-data" value="${item ? item.data_revisao : new Date().toISOString().slice(0, 10)}" required>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#form-contexto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const categoria = modal.querySelector('#ctx-categoria').value;
    const descricao = modal.querySelector('#ctx-descricao').value.trim();
    const dataRevisao = modal.querySelector('#ctx-data').value;
    if (!dataValida(dataRevisao)) return toast('Data de revisão inválida.', 'erro');
    const payload = {
      empresa_id: empresaAtual.id,
      tipo: 'swot',
      categoria,
      descricao,
      data_revisao: dataRevisao,
      created_by: user.id,
    };

    const tipoRisco = SWOT_PARA_RISCO[categoria] || null;
    if (tipoRisco) {
      if (item?.risco_oportunidade_id) {
        await supabase.from('riscos_oportunidades')
          .update({ descricao, tipo: tipoRisco })
          .eq('id', item.risco_oportunidade_id);
        payload.risco_oportunidade_id = item.risco_oportunidade_id;
      } else {
        const { data: novoRisco, error: errRisco } = await supabase.from('riscos_oportunidades')
          .insert({ empresa_id: empresaAtual.id, tipo: tipoRisco, descricao, categoria: 'Identificado na SWOT', probabilidade: 3, impacto: 3 })
          .select().single();
        if (errRisco) return toast('Erro ao sincronizar com Riscos e Oportunidades: ' + errRisco.message, 'erro');
        payload.risco_oportunidade_id = novoRisco.id;
      }
    }

    const query = item
      ? supabase.from('contexto_organizacional').update(payload).eq('id', item.id)
      : supabase.from('contexto_organizacional').insert(payload);
    const { error } = await query;
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    toast('Item salvo com sucesso.' + (tipoRisco ? ' Sincronizado com Riscos e Oportunidades.' : ''), 'sucesso');
    fecharModal();
    render(container, state);
  });
}
