// Fonte central de módulos/submódulos do sistema — espelha exatamente o catálogo gravado no banco
// (tabela catalogo_modulos_submodulos, migração 0064). Se um módulo/submódulo mudar aqui, o mesmo
// literal precisa ser atualizado nas políticas RLS e no catálogo (não há sincronização automática
// entre JS e SQL — só a validação no banco impede um literal inválido em permissoes_edicao).
//
// "configuravel: false" marca módulos sem sistema de nível algum (hoje só Treinamentos, ainda não
// lançado) — ficam de fora da matriz de permissões porque não têm o que configurar.
//
// Apurações e Auditorias são configuráveis (migrações 0077-0080), mas cada um com uma peculiaridade
// que a matriz de permissões (js/modules/permissoesShared.js) e o resolvedor de nível (resolverNivel
// em ui.js / nivel_edicao_usuario no banco) tratam à parte:
// - Apurações: ser membro ativo do comitê (tabela apuracoes_comite_membros) continua sendo um
//   pré-requisito absoluto e não-contornável (proteção contra conflito de interesse) — o nível
//   configurado aqui (Visualização/Edição Total) só tem efeito para quem já é membro.
// - Auditorias: não existe responsável único por registro, então o nível 'proprio' (Edição sob
//   Responsabilidade) não se aplica — só Visualização, Edição Total e Sem acesso.
export const MODULOS_SISTEMA = [
  {
    id: 'planejamento-estrategico', nome: 'Planejamento Estratégico', icone: 'ti-target-arrow', disponivel: true, configuravel: true,
    descricao: 'Contexto (SWOT, partes interessadas, missão/visão/valores, macrofluxo), mapa BSC, objetivos, riscos e oportunidades, indicadores e atas de reunião.',
    teaser: 'Sua estratégia sai do papel: SWOT, missão, visão, indicadores e o mapa que conecta tudo isso aos resultados.',
    submodulos: [
      { id: 'contexto-cenario', nome: 'Contexto — Cenário (SWOT)' },
      { id: 'contexto-partes', nome: 'Contexto — Partes Interessadas' },
      { id: 'contexto-macrofluxo', nome: 'Contexto — Macrofluxo' },
      { id: 'contexto-sipoc', nome: 'Contexto — SIPOC' },
      { id: 'objetivos', nome: 'Objetivos e Mapa Estratégico' },
      { id: 'riscos', nome: 'Riscos e Oportunidades' },
      { id: 'indicadores', nome: 'Indicadores' },
      { id: 'atas', nome: 'Atas de Reunião' },
    ],
  },
  {
    id: 'acoes', nome: 'Gestão de Ações', icone: 'ti-list-check', disponivel: true, configuravel: true,
    descricao: 'Planos de ação e tarefas vinculados a objetivos, indicadores, riscos, não conformidades e atas de reunião.',
    teaser: 'Quem faz o quê, até quando — e o que está atrasado. Tudo num só lugar.',
    submodulos: [
      { id: 'planos', nome: 'Planos de Ação' },
      { id: 'tarefas', nome: 'Tarefas' },
    ],
  },
  {
    id: 'controladoria', nome: 'Controladoria', icone: 'ti-report-money', disponivel: true, configuravel: true,
    descricao: 'Cadastro de contas gerenciais, com categoria, área responsável, responsável pela análise e metas mensal/anual.',
    teaser: 'Metas financeiras por área, mês a mês: veja quem está no azul antes que vire problema.',
    submodulos: [],
  },
  {
    id: 'documentos', nome: 'Documentos', icone: 'ti-file-text', disponivel: true, configuravel: true,
    descricao: 'Controle de documentos e registros da qualidade: numeração automática, ciclo de aprovação com assinatura eletrônica, revisões e lista mestra.',
    teaser: 'Nunca mais aquela dúvida de qual é a versão certa do procedimento.',
    submodulos: [],
  },
  {
    id: 'apuracoes', nome: 'Gestão de Apurações', icone: 'ti-shield-lock', disponivel: true, configuravel: true,
    descricao: 'Controle do fluxo de apurações e investigações corporativas (ISO 37301/37002/37001) — acesso restrito ao comitê de apuração. Não armazena evidências ou documentos.',
    teaser: 'Um canal seguro e restrito para apurar o que precisa ser apurado — com sigilo de verdade.',
    submodulos: [],
  },
  {
    id: 'auditorias', nome: 'Gestão de Auditorias', icone: 'ti-clipboard-check', disponivel: true, configuravel: true,
    descricao: 'Auditorias internas e externas (ISO 9001/14001/45001): priorização por risco (IPA), planejamento inteligente, distribuição automática de horas e agenda, execução, resultados e aprovação, com geração automática de plano de ação a partir de não conformidades.',
    teaser: 'Auditorias priorizadas por risco, não por sorteio — saiba onde olhar primeiro.',
    submodulos: [
      { id: 'auditorias', nome: 'Auditorias' },
      { id: 'processos', nome: 'Processos Auditáveis' },
      { id: 'turnos', nome: 'Turnos' },
      { id: 'auditores', nome: 'Auditores' },
      { id: 'relatorios', nome: 'Relatórios' },
    ],
  },
  {
    id: 'treinamentos', nome: 'Treinamentos', icone: 'ti-school', disponivel: false, configuravel: false,
    descricao: 'Gestão de treinamentos e competências da equipe.',
    teaser: 'Saiba exatamente quem já foi treinado — e quem ainda precisa.',
    submodulos: [],
  },
];

// Papéis (usuarios_empresas.papel) — lista única, usada em todos os selects/labels do sistema.
export const PAPEL_LABEL = { orbeex: 'ORBEEX', admin: 'Administrador', gestor: 'Gestor', usuario: 'Usuário' };

// Níveis de acesso (permissoes_edicao.nivel) — as chaves internas continuam leitura/proprio/total/
// aprovacao/sem_acesso (ver migração 0063), só o rótulo exibido muda para bater com a nomenclatura
// nova (Visualização / Edição sob Responsabilidade / Edição Total / Aprovação).
export const NIVEL_LABEL = {
  leitura: 'Visualização',
  proprio: 'Edição sob Responsabilidade',
  total: 'Edição Total',
  aprovacao: 'Aprovação',
  sem_acesso: 'Sem acesso',
};
export const NIVEL_DESCRICAO = {
  leitura: 'Só visualiza — não pode criar, editar ou excluir nada neste módulo/submódulo.',
  proprio: 'Edita apenas os registros em que é o responsável. O resto fica somente leitura.',
  total: 'Mesma liberdade de edição de um Administrador, neste módulo/submódulo.',
  aprovacao: 'Elegível para ser designado como aprovador. Hoje só tem efeito prático em Documentos (fluxo de aprovação de documentos); nos demais módulos equivale a Visualização, reservado para futuros fluxos de aprovação.',
  sem_acesso: 'Módulo/submódulo fica oculto — nem aparece no menu nem pode ser acessado.',
};

