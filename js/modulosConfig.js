// Fonte central de módulos/submódulos do sistema — espelha exatamente o catálogo gravado no banco
// (tabela catalogo_modulos_submodulos, migração 0064). Se um módulo/submódulo mudar aqui, o mesmo
// literal precisa ser atualizado nas políticas RLS e no catálogo (não há sincronização automática
// entre JS e SQL — só a validação no banco impede um literal inválido em permissoes_edicao).
//
// "configuravel: false" marca módulos com sistema de acesso próprio, que não entram na matriz de
// permissões: Apurações (comitê de apuração, tabela apuracoes_comite_membros) e Auditorias (sempre
// leitura para quem acessa a empresa, escrita só orbeex/admin, sem nível configurável).
export const MODULOS_SISTEMA = [
  {
    id: 'planejamento-estrategico', nome: 'Planejamento Estratégico', icone: 'ti-target-arrow', disponivel: true, configuravel: true,
    descricao: 'Contexto (SWOT, partes interessadas, missão/visão/valores, macrofluxo), mapa BSC, objetivos, riscos e oportunidades, indicadores e atas de reunião.',
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
    submodulos: [
      { id: 'planos', nome: 'Planos de Ação' },
      { id: 'tarefas', nome: 'Tarefas' },
    ],
  },
  {
    id: 'controladoria', nome: 'Controladoria', icone: 'ti-report-money', disponivel: true, configuravel: true,
    descricao: 'Cadastro de contas gerenciais, com categoria, área responsável, responsável pela análise e metas mensal/anual.',
    submodulos: [],
  },
  {
    id: 'documentos', nome: 'Documentos', icone: 'ti-file-text', disponivel: true, configuravel: true,
    descricao: 'Controle de documentos e registros da qualidade: numeração automática, ciclo de aprovação com assinatura eletrônica, revisões e lista mestra.',
    submodulos: [],
  },
  {
    id: 'apuracoes', nome: 'Gestão de Apurações', icone: 'ti-shield-lock', disponivel: true, configuravel: false,
    descricao: 'Controle do fluxo de apurações e investigações corporativas (ISO 37301/37002/37001) — acesso restrito ao comitê de apuração. Não armazena evidências ou documentos.',
    submodulos: [],
  },
  {
    id: 'auditorias', nome: 'Gestão de Auditorias', icone: 'ti-clipboard-check', disponivel: true, configuravel: false,
    descricao: 'Auditorias internas e externas (ISO 9001/14001/45001): priorização por risco (IPA), planejamento inteligente, distribuição automática de horas e agenda, execução, resultados e aprovação, com geração automática de plano de ação a partir de não conformidades.',
    submodulos: [],
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

export function moduloConfiguravel(moduloId) {
  return MODULOS_SISTEMA.find((m) => m.id === moduloId)?.configuravel !== false;
}
