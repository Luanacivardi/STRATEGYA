# STRATEGYA · by ORBEEX

**Versão 1.0**

Sistema de Gestão Integrada multiempresa, usado pela ORBEEX Consultoria para atender múltiplos clientes (ex: Tedesco) com dados isolados por empresa. Organizado em módulos — o primeiro implementado é o **Planejamento Estratégico**, aderente à ISO 9001:2015. Um módulo próprio de **Riscos e Oportunidades** também está disponível. Os módulos de Documentos, Não Conformidades, Auditorias e Treinamentos já aparecem no menu como "em breve".

## Stack

- Frontend: HTML/CSS/JS puro (ES Modules, sem build step), pronto para GitHub Pages
- Backend: Supabase (PostgreSQL + Auth + RLS por `empresa_id`)
- Gráficos: Chart.js
- Ícones: Tabler Icons

## Projeto Supabase

- Nome: `orbeex-planejamento-estrategico`
- Project ref: `qfmzgsoindjtqzewgecp`
- URL: `https://qfmzgsoindjtqzewgecp.supabase.co`

As credenciais em `js/config.js` usam a chave pública (`anon`/`publishable`), protegida pelas políticas de RLS — é seguro expor no frontend estático.

## Estrutura

```
index.html                  Shell da aplicação (login + app)
css/style.css                Tema visual ORBEEX (navy/gold), inclui timbre de impressão
js/config.js                 URL e chave pública do Supabase
js/supabaseClient.js         Instância do client Supabase
js/ui.js                     Helpers de UI (modal, toast, escapeHtml, impressão, e-mail)
js/tema.js                   Aplica cores/logo da empresa selecionada ao tema visual
js/app.js                    Auth, seleção de empresa, roteamento de abas
js/modules/                  Um módulo por funcionalidade:
  dashboard.js                 Atalhos de navegação e semáforo de indicadores
  contexto.js                  SWOT, Partes Interessadas, Missão/Visão/Valores, Macrofluxo
  macrofluxo.js                Corpo do Macrofluxo (reordenação com setas), embutido em Contexto
  partesInteressadas.js        Corpo de Partes Interessadas, embutido em Contexto
  mapaEstrategico.js           Mapa Estratégico BSC (lanes), embutido em Mapa e Objetivos
  objetivos.js                 Tabela de objetivos, aba "Mapa e Objetivos"
  planosAcao.js                Ações: Planos de Ação (macro/micro) e grupo TO DO
  todo.js                      Consolida tarefas de planos, atas e itens manuais
  indicadores.js                Indicadores e resultados apurados
  atasReuniao.js               Atas de Reunião (RAC), com indicadores/decisões/ações e impressão
  riscosOportunidades.js       Módulo próprio de Riscos e Oportunidades
  empresaUsuarios.js           Tela Configurações (colaboradores da empresa atual)
  permissoes.js                Tela Permissões (só ORBEEX): usuários e módulos por empresa
supabase/migrations/         Histórico de migrations SQL aplicadas ao projeto
supabase/functions/          Edge Functions (criar/editar colaborador, alterar senha)
```

## Rodando localmente

Como o app usa ES Modules, é preciso servir os arquivos via HTTP (não abrir o `index.html` direto no navegador). Qualquer servidor estático simples funciona, por exemplo:

```
npx serve .
```

## Fases de desenvolvimento (v1.0)

Backlog original de 11 fases, todas concluídas nesta versão:

- [x] **Fase 1** — Colaboradores e permissões (cadastro completo, papéis, ativar/inativar, recuperação de senha)
- [x] **Fase 2** — Dashboard com atalhos de navegação e listas em ordem alfabética
- [x] **Fase 3** — Reorganização de Contexto/Macrofluxo (grupos dentro da mesma aba)
- [x] **Fase 4** — Mapa Estratégico integrado à navegação de Indicadores
- [x] **Fase 5** — Indicadores: classificação, descrição, unidade padronizada
- [x] **Fase 6** — Plano de Ação: numeração sequencial, ações micro, % de conclusão calculado
- [x] **Fase 7** — Ata de Reunião: múltiplos indicadores, ações em formato TO DO
- [x] **Fase 8** — Módulo de Tarefas (TO DO) consolidando plano/ata/itens manuais
- [x] **Fase 9** — Macrofluxo: reordenação de itens e numeração visual
- [x] **Fase 10** — Tarefas: edição unificada e campo de evolução
- [x] **Fase 11** — Reestruturação de abas, nomes de responsáveis e impressão profissional com timbre

Módulos de Documentos, Não Conformidades, Auditorias e Treinamentos permanecem como "em breve" — ficam para a próxima versão.

Detalhes de cada fase em `CONTEXTO_SESSAO.md`.

## Papéis de usuário (por empresa)

- `orbeex`: acesso total, único papel que pode conceder papel ORBEEX ou excluir empresa; gerencia a tela Permissões (todas as empresas)
- `admin`: gerencia dados e colaboradores da empresa atual (tela Configurações)
- `usuario`: acesso de leitura/uso conforme os módulos habilitados para a empresa

Um usuário pode ter papéis diferentes em empresas diferentes, e o vínculo empresa-usuário pode ser ativado/inativado sem afetar outras empresas.
