import { escapeHtml, formatarDataHora } from '../ui.js';

// Rótulos amigáveis para as tabelas rastreadas (trigger fn_log_alteracao, migração 0024).
const TABELA_LABEL = {
  empresas: 'Empresa',
  objetivos_estrategicos: 'Objetivo Estratégico',
  objetivos_relacoes: 'Relação entre Objetivos',
  indicadores: 'Indicador',
  planos_acao: 'Plano de Ação',
  reunioes_analise_critica: 'Ata de Reunião',
  riscos_oportunidades: 'Risco/Oportunidade',
  contexto_organizacional: 'Contexto (SWOT)',
  partes_interessadas: 'Parte Interessada',
  macrofluxo_processos: 'Macrofluxo',
  todo_itens: 'Tarefa',
  usuarios_empresas: 'Colaborador',
  resultados_indicadores: 'Resultado de Indicador',
  planos_acao_itens: 'Tarefa do Plano de Ação',
  rac_indicadores: 'Indicador em Ata de Reunião',
  rac_acoes: 'Ação de Ata de Reunião',
};

const OPERACAO_LABEL = { insert: 'Criação', update: 'Edição', delete: 'Exclusão' };
const OPERACAO_ICONE = { insert: 'ti-plus', update: 'ti-pencil', delete: 'ti-trash' };

function truncar(valor, tam = 80) {
  if (valor === null || valor === undefined) return '—';
  const str = String(valor);
  return str.length > tam ? str.slice(0, tam) + '…' : str;
}

// Renderiza a Auditoria de Dados (histórico de alterações) dentro de Configurações — como um
// item de auditoria, recolhido por padrão (<details>), não exposto aberto na tela.
// Visibilidade: só ORBEEX/admin chegam a ver esse bloco (usuário comum nunca — reforçado também
// pela RLS de log_alteracoes, que só libera SELECT pra papel orbeex/admin ativo na empresa).
// Escopo dos dados: ORBEEX enxerga as alterações de TODAS as empresas onde tem acesso (a RLS já
// restringe automaticamente às empresas onde o usuário logado é orbeex/admin — não vaza dados de
// empresas de terceiros); admin só enxerga as alterações da própria empresa selecionada.
export async function render(container, state) {
  const { supabase, empresaAtual, papelAtual, empresas } = state;
  const ehOrbeex = papelAtual === 'orbeex';

  const { data: membrosRaw } = await supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id });
  const membros = membrosRaw || [];
  const nomePorId = new Map(membros.map((m) => [m.usuario_id, m.nome || m.email]));
  const nomeEmpresaPorId = new Map((empresas || []).map((e) => [e.id, e.nome]));

  async function carregarLogs() {
    const tabelaFiltro = container.querySelector('#hist-filtro-tabela')?.value || '';
    const usuarioFiltro = container.querySelector('#hist-filtro-usuario')?.value || '';
    const empresaFiltro = container.querySelector('#hist-filtro-empresa')?.value || '';
    const de = container.querySelector('#hist-filtro-de')?.value || '';
    const ate = container.querySelector('#hist-filtro-ate')?.value || '';

    let query = supabase.from('log_alteracoes').select('*').order('criado_em', { ascending: false }).limit(300);
    // ORBEEX vê todas as empresas onde tem acesso (a RLS já cuida de não vazar outras); admin
    // fica travado na empresa atualmente selecionada, mesmo que a RLS já reforce isso também.
    query = ehOrbeex ? (empresaFiltro ? query.eq('empresa_id', empresaFiltro) : query) : query.eq('empresa_id', empresaAtual.id);
    if (tabelaFiltro) query = query.eq('tabela', tabelaFiltro);
    if (usuarioFiltro) query = query.eq('usuario_id', usuarioFiltro);
    if (de) query = query.gte('criado_em', de + 'T00:00:00');
    if (ate) query = query.lte('criado_em', ate + 'T23:59:59');

    const { data, error } = await query;
    const area = container.querySelector('#historico-tabela-area');
    if (error) {
      area.innerHTML = `<div class="alert alert-warning">Erro ao carregar histórico: ${escapeHtml(error.message)}</div>`;
      return;
    }

    area.innerHTML = data.length ? `
      <table class="table">
        <thead><tr><th>Quando</th>${ehOrbeex ? '<th>Empresa</th>' : ''}<th>Usuário</th><th>Registro</th><th>Ação</th><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead>
        <tbody>
          ${data.map((l) => `
            <tr>
              <td>${formatarDataHora(l.criado_em)}</td>
              ${ehOrbeex ? `<td>${escapeHtml(nomeEmpresaPorId.get(l.empresa_id) || '—')}</td>` : ''}
              <td>${escapeHtml(nomePorId.get(l.usuario_id) || 'Sistema')}</td>
              <td>${escapeHtml(TABELA_LABEL[l.tabela] || l.tabela)}</td>
              <td><span class="badge badge-neutral"><i class="ti ${OPERACAO_ICONE[l.operacao]}"></i> ${OPERACAO_LABEL[l.operacao]}</span></td>
              <td>${escapeHtml(l.campo || '—')}</td>
              <td class="text-muted" title="${escapeHtml(l.valor_anterior || '')}">${escapeHtml(truncar(l.valor_anterior))}</td>
              <td title="${escapeHtml(l.valor_novo || '')}">${escapeHtml(truncar(l.valor_novo))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${data.length === 300 ? '<p class="text-muted" style="margin-top:8px">Mostrando as 300 alterações mais recentes. Use os filtros para refinar.</p>' : ''}
    ` : '<div class="empty-state"><i class="ti ti-history"></i>Nenhuma alteração encontrada com esses filtros.</div>';
  }

  container.innerHTML = `
    <details class="card audit-card">
      <summary class="card-header audit-card-summary">
        <span><i class="ti ti-shield-lock"></i> Auditoria de Dados</span>
        <i class="ti ti-chevron-down audit-card-chevron"></i>
      </summary>
      <div class="audit-card-body">
        <p class="text-muted" style="margin-bottom:1rem">Registro automático de quem alterou o quê, quando — para auditoria e conformidade.${ehOrbeex ? ' Visível apenas para ORBEEX (todas as empresas) e Administradores (própria empresa).' : ''}</p>
        <div class="filters filters-compact">
          ${ehOrbeex ? `
            <select id="hist-filtro-empresa" class="filter-select filter-select-sm">
              <option value="">Todas as empresas</option>
              ${(empresas || []).map((e) => `<option value="${e.id}">${escapeHtml(e.nome)}</option>`).join('')}
            </select>
          ` : ''}
          <select id="hist-filtro-tabela" class="filter-select filter-select-sm">
            <option value="">Registro</option>
            ${Object.entries(TABELA_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
          <select id="hist-filtro-usuario" class="filter-select filter-select-sm">
            <option value="">Usuário</option>
            ${membros.map((m) => `<option value="${m.usuario_id}">${escapeHtml(m.nome || m.email)}</option>`).join('')}
          </select>
          <input type="date" id="hist-filtro-de" class="filter-select filter-select-sm" title="De">
          <input type="date" id="hist-filtro-ate" class="filter-select filter-select-sm" title="Até">
        </div>
        <div id="historico-tabela-area"></div>
      </div>
    </details>
  `;

  const detalhes = container.querySelector('details.audit-card');
  let carregouUmaVez = false;
  detalhes.addEventListener('toggle', () => {
    if (detalhes.open && !carregouUmaVez) {
      carregouUmaVez = true;
      carregarLogs();
    }
  });

  container.querySelectorAll('#hist-filtro-tabela, #hist-filtro-usuario, #hist-filtro-empresa, #hist-filtro-de, #hist-filtro-ate').forEach((el) => {
    el.addEventListener('change', carregarLogs);
  });
}
