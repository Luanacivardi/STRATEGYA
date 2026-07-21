import { abrirModal, fecharModal, toast, escapeHtml, confirmar, imprimirSecao } from '../ui.js';

// SIPOC (Suppliers, Inputs, Process, Outputs, Customers) por processo do Macrofluxo.
// Uma linha por processo (unique processo_id no banco) — o processo em si vem do Macrofluxo,
// então cadastrar/renomear processos continua sendo feito lá.

const TIPO_LABEL = { direcao: 'Direção', principal: 'Processo Principal', apoio: 'Processo de Apoio' };

const COLUNAS = [
  { chave: 'fornecedores', label: 'Fornecedores (S)', placeholder: 'Quem fornece as entradas deste processo...' },
  { chave: 'entradas', label: 'Entradas (I)', placeholder: 'Insumos, informações e recursos recebidos...' },
  { chave: 'atividades', label: 'Processo (P)', placeholder: 'Principais atividades/etapas do processo...' },
  { chave: 'saidas', label: 'Saídas (O)', placeholder: 'Produtos, serviços e informações gerados...' },
  { chave: 'clientes', label: 'Clientes (C)', placeholder: 'Quem recebe as saídas deste processo...' },
];

function rotuloProcesso(p) {
  return p.numero ? `${p.numero} — ${p.nome}` : p.nome;
}

export async function render(container, state) {
  const { supabase, empresaAtual, papelAtual } = state;
  const podeEditar = papelAtual !== 'usuario';

  let processos, itens;
  try {
    const [resProcessos, resSipoc] = await Promise.all([
      supabase.from('macrofluxo_processos').select('*').eq('empresa_id', empresaAtual.id).neq('tipo', 'direcao').order('ordem'),
      supabase.from('sipoc').select('*').eq('empresa_id', empresaAtual.id),
    ]);
    if (resProcessos.error) throw resProcessos.error;
    if (resSipoc.error) throw resSipoc.error;
    // Mesma ordenação do Macrofluxo: principais primeiro, depois apoio, por ordem/criação.
    processos = [...resProcessos.data].sort((a, b) =>
      (a.tipo === b.tipo ? (a.ordem - b.ordem || a.created_at.localeCompare(b.created_at)) : (a.tipo === 'principal' ? -1 : 1)));
    itens = resSipoc.data;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar SIPOC: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const sipocPorProcesso = new Map(itens.map((s) => [s.processo_id, s]));

  const celula = (texto) => (texto || '').trim()
    ? escapeHtml(texto).replaceAll('\n', '<br>')
    : '<span class="text-muted">—</span>';

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
      <span style="font-weight:700;font-size:13px;color:var(--navy-titulo)"><i class="ti ti-arrows-right-left"></i> SIPOC por Processo</span>
      <button class="btn btn-secondary btn-sm" id="btn-imprimir-sipoc"><i class="ti ti-printer"></i> Imprimir</button>
    </div>
    ${processos.length ? `
      <table class="table sipoc-tabela">
        <thead><tr>
          <th>Processo</th>
          ${COLUNAS.map((c) => `<th>${c.label}</th>`).join('')}
          ${podeEditar ? '<th></th>' : ''}
        </tr></thead>
        <tbody>
          ${processos.map((p) => {
            const s = sipocPorProcesso.get(p.id);
            return `
              <tr>
                <td>
                  <strong>${escapeHtml(rotuloProcesso(p))}</strong>
                  <br><span class="text-muted" style="font-size:11px">${TIPO_LABEL[p.tipo] || ''}</span>
                </td>
                ${COLUNAS.map((c) => `<td>${celula(s?.[c.chave])}</td>`).join('')}
                ${podeEditar ? `<td class="table-actions">
                  <button class="icon-btn" data-editar="${p.id}" title="${s ? 'Editar SIPOC' : 'Preencher SIPOC'}"><i class="ti ${s ? 'ti-pencil' : 'ti-plus'}"></i></button>
                  ${s ? `<button class="icon-btn" data-excluir="${s.id}" title="Limpar SIPOC deste processo"><i class="ti ti-trash"></i></button>` : ''}
                </td>` : ''}
              </tr>`;
          }).join('')}
        </tbody>
      </table>
      <p class="text-muted" style="font-size:12px">Os processos vêm do Macrofluxo — para incluir, renomear ou reordenar processos, use a aba Macrofluxo.</p>
    ` : '<div class="empty-state"><i class="ti ti-arrows-right-left"></i>Nenhum processo cadastrado no Macrofluxo ainda. Cadastre os processos na aba Macrofluxo para descrever o SIPOC de cada um.</div>'}
  `;

  container.querySelector('#btn-imprimir-sipoc')?.addEventListener('click', () => {
    imprimirSecao(`
      <h2 style="margin-bottom:4px">SIPOC por Processo</h2>
      <p class="text-muted">${escapeHtml(empresaAtual.nome)}</p>
      <hr class="sep">
      ${processos.map((p) => {
        const s = sipocPorProcesso.get(p.id);
        return `
          <h4 style="margin:14px 0 6px">${escapeHtml(rotuloProcesso(p))} <span style="font-weight:400;color:#666">(${TIPO_LABEL[p.tipo] || ''})</span></h4>
          <table class="print-detalhe-tabela">
            <tbody>
              ${COLUNAS.map((c) => `<tr><th>${c.label}</th><td>${(s?.[c.chave] || '').trim() ? escapeHtml(s[c.chave]).replaceAll('\n', '<br>') : '—'}</td></tr>`).join('')}
            </tbody>
          </table>`;
      }).join('')}
    `);
  });

  container.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const processo = processos.find((p) => p.id === btn.dataset.editar);
      abrirFormulario(state, container, processo, sipocPorProcesso.get(processo.id));
    });
  });

  container.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Limpar o SIPOC deste processo?'))) return;
      const { error } = await supabase.from('sipoc').delete().eq('id', btn.dataset.excluir);
      if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
      toast('SIPOC removido.', 'sucesso');
      render(container, state);
    });
  });
}

function abrirFormulario(state, container, processo, item = null) {
  const { supabase, empresaAtual } = state;
  const modal = abrirModal(`SIPOC — ${escapeHtml(rotuloProcesso(processo))}`, `
    <form id="form-sipoc">
      ${COLUNAS.map((c) => `
        <div class="form-group">
          <label>${c.label}</label>
          <textarea id="sipoc-${c.chave}" placeholder="${c.placeholder}">${item ? escapeHtml(item[c.chave] || '') : ''}</textarea>
        </div>`).join('')}
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#form-sipoc').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      empresa_id: empresaAtual.id,
      processo_id: processo.id,
    };
    COLUNAS.forEach((c) => { payload[c.chave] = modal.querySelector(`#sipoc-${c.chave}`).value.trim() || null; });

    const { error } = await supabase.from('sipoc').upsert(payload, { onConflict: 'processo_id' });
    if (error) return toast('Erro ao salvar: ' + error.message, 'erro');
    toast('SIPOC salvo com sucesso.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}
