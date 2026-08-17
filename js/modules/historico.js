import { escapeHtml, formatarDataHora } from '../ui.js';

// Rótulos amigáveis para as tabelas rastreadas (trigger fn_log_alteracao, migração 0024 + extensões
// em 0025, 0029, 0031, 0034/0042, 0035, 0036, 0041, 0086, 0087 — sempre que um módulo novo ganha o
// trigger, o rótulo precisa entrar aqui também, senão a tabela aparece com o nome cru (snake_case)
// e some do filtro "Registro"). Auditorias (ISO), Apurações e Treinamentos não usam esse trigger —
// não é esquecimento: Apurações é propositalmente fora da trilha geral (confidencialidade do
// comitê), e Auditorias/Treinamentos ainda não tiveram rastreabilidade genérica adicionada.
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
  departamentos: 'Departamento',
  modulos_restritos: 'Restrição de Módulo',
  permissoes_edicao: 'Permissão de Edição',
  documentos: 'Documento',
  contas_gerenciais: 'Conta Gerencial',
  contas_analises: 'Análise de Conta',
  contas_anexos: 'Anexo de Conta',
  indicador_analises: 'Análise de Indicador',
  contas_lancamentos_mensais: 'Lançamento Mensal',
  empresa_rol_mensal: 'ROL Mensal',
  empresa_rol_historico_anual: 'Histórico Anual de ROL',
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

  // Rastreabilidade não pode ter teto invisível: antes a tela trazia as 300 alterações mais
  // recentes e pronto — o que ficasse para trás não era alcançável por nenhum filtro de tela,
  // justamente num registro que existe para auditoria. Agora a página avança sob demanda.
  const TAMANHO_PAGINA = 300;
  let paginaAtual = 0;
  let linhasCarregadas = [];

  async function carregarLogs({ continuar = false } = {}) {
    if (!continuar) { paginaAtual = 0; linhasCarregadas = []; }

    const tabelaFiltro = container.querySelector('#hist-filtro-tabela')?.value || '';
    const usuarioFiltro = container.querySelector('#hist-filtro-usuario')?.value || '';
    const empresaFiltro = container.querySelector('#hist-filtro-empresa')?.value || '';
    const de = container.querySelector('#hist-filtro-de')?.value || '';
    const ate = container.querySelector('#hist-filtro-ate')?.value || '';

    let query = supabase.from('log_alteracoes').select('*').order('criado_em', { ascending: false })
      .range(paginaAtual * TAMANHO_PAGINA, (paginaAtual + 1) * TAMANHO_PAGINA - 1);
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

    const temMais = (data || []).length === TAMANHO_PAGINA;
    linhasCarregadas = linhasCarregadas.concat(data || []);
    const linhas = linhasCarregadas;

    area.innerHTML = linhas.length ? `
      <table class="table">
        <thead><tr><th>Quando</th>${ehOrbeex ? '<th>Empresa</th>' : ''}<th>Usuário</th><th>Registro</th><th>Ação</th><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead>
        <tbody>
          ${linhas.map((l) => `
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
      <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
        <span class="text-muted">${linhas.length} alteração(ões) carregada(s).</span>
        ${temMais ? '<button class="btn btn-secondary btn-sm" id="hist-carregar-mais" type="button"><i class="ti ti-chevron-down"></i> Carregar mais 300</button>' : '<span class="text-muted">Fim do histórico para estes filtros.</span>'}
      </div>
    ` : '<div class="empty-state"><i class="ti ti-history"></i>Nenhuma alteração encontrada com esses filtros.</div>';

    const btnMais = area.querySelector('#hist-carregar-mais');
    if (btnMais) {
      btnMais.addEventListener('click', async () => {
        btnMais.disabled = true;
        btnMais.textContent = 'Carregando...';
        paginaAtual += 1;
        await carregarLogs({ continuar: true });
      });
    }
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
