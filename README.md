# STRATEGYA · by ORBEEX

Sistema de Gestão Integrada multiempresa, usado pela ORBEEX Consultoria para atender múltiplos clientes (Maxicorte, Tedesco, Qualytool, etc.) com dados isolados por empresa. Organizado em módulos — o primeiro implementado é o **Planejamento Estratégico**, aderente à ISO 9001:2015.

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
css/style.css                Tema visual ORBEEX (navy/gold)
js/config.js                 URL e chave pública do Supabase
js/supabaseClient.js         Instância do client Supabase
js/ui.js                     Helpers de UI (modal, toast, escapeHtml)
js/app.js                    Auth, seleção de empresa, roteamento de abas
js/modules/                  Um módulo por funcionalidade (dashboard, contexto, etc.)
supabase/migrations/         Histórico de migrations SQL aplicadas ao projeto
```

## Rodando localmente

Como o app usa ES Modules, é preciso servir os arquivos via HTTP (não abrir o `index.html` direto no navegador). Qualquer servidor estático simples funciona, por exemplo:

```
npx serve .
```

## Fases de desenvolvimento

- [x] **Fase 1 — Base:** cadastro de empresas, usuários, contexto organizacional (SWOT/PESTEL), partes interessadas
- [x] **Fase 2 — Núcleo estratégico:** objetivos, mapa estratégico BSC, indicadores + resultados
- [ ] **Fase 3 — Riscos e ações:** riscos/oportunidades, planos de ação 5W2H (schema já criado, UI pendente)
- [ ] **Fase 4 — Governança:** reuniões de análise crítica, dashboard executivo avançado (schema já criado, UI pendente)
- [ ] **Fase 5 — Refinamento:** desdobramento por setor, relatórios exportáveis (PDF/Excel)

## Papéis de usuário (por empresa)

- `admin`: gerencia dados e usuários da empresa, pode editar CNPJ/nome
- `consultor`: mesmo acesso de escrita que admin, usado pela equipe ORBEEX
- `cliente`: apenas leitura

Um usuário pode ter papéis diferentes em empresas diferentes (ex: consultor da ORBEEX vinculado a vários clientes).
