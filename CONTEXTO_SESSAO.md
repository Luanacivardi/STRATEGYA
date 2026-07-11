# STRATEGYA — Contexto para continuar em outra janela

## O que é
Sistema de Gestão Integrada multiempresa (STRATEGYA, by ORBEEX), rodando como app web estático (HTML/CSS/JS puro, sem build), com Supabase de backend. ORBEEX Consultoria usa para gerenciar planejamento estratégico de vários clientes (ex: Tedesco).

## Onde está
- **Pasta do projeto:** `C:\Users\luana\OneDrive\ORBEEX\STRATEGYA SOFTWARE\planejamento-estrategico_rev00`
- **Git:** repositório local (ainda sem remoto no GitHub), tag `v1.0` marca o fechamento da primeira versão
- **Supabase:** projeto `orbeex-planejamento-estrategico` (id `qfmzgsoindjtqzewgecp`, região `sa-east-1`)
- **Preview local:** `.claude/launch.json` na pasta `AGENTE_TEDESCO` tem a config `planejamento-estrategico` (PowerShell HttpListener, porta 8890) — usar `preview_start` com esse nome

## Login de teste
- E-mail: `luana.civardi@orbeex.com.br`
- Senha: `lu21li15`
- Papel: ORBEEX (acesso total)

## Empresas cadastradas
- **Tedesco** — empresa real do cliente, com objetivos/colaboradores reais
- **STRATEGYA** — empresa interna da ORBEEX, com **todos os módulos liberados** (usada como ambiente de testes/demo)

## Estrutura de módulos
- **Planejamento Estratégico** (módulo com abas): Dashboard, Contexto (SWOT/Partes Interessadas/Missão-Visão-Valores/Macrofluxo — grupos dentro da mesma aba), Mapa e Objetivos (BSC + tabela de objetivos numa única aba), Ações (Planos de Ação/Tarefas), Indicadores, Atas de Reunião
- **Riscos e Oportunidades** (módulo próprio, tela única)
- Documentos / Não Conformidades / Auditorias / Treinamentos — ainda não implementados ("em breve"), mas já aparecem no menu

Módulos habilitados são configuráveis **por empresa**, só por quem tem papel ORBEEX (tela Permissões).

## Papéis e permissões
- `orbeex`, `admin`, `usuario` — por empresa (um usuário pode ter papéis diferentes em empresas diferentes)
- `ativo`/`inativo` por vínculo empresa-usuário (inativar tira acesso na hora, sem afetar outras empresas)
- Só ORBEEX pode conceder papel ORBEEX ou excluir empresa (reforçado por trigger no banco, não só na interface)
- Tela **Configurações** (Empresa & Usuários): visível a Admin+ORBEEX, gerencia colaboradores da empresa atual
- Tela **Permissões**: só ORBEEX, gerencia todas as empresas de uma vez (usuários + módulos habilitados)

## Cadastro de colaboradores
Feito via 3 Supabase Edge Functions (usam service role no servidor, nunca exposto no navegador):
- `criar-usuario-empresa` — cria conta nova (e-mail+senha+papel+nome) ou vincula se já existir
- `editar-colaborador` — edita nome de exibição (user_metadata)
- `alterar-senha-colaborador` — troca senha de qualquer colaborador

## Bugs importantes já corrigidos
1. **Ícones invisíveis em todo o app** — a URL da fonte de ícones estava errada desde o início (`@tabler/icons` em vez de `@tabler/icons-webfont`), causava 404 e o navegador bloqueava (ERR_BLOCKED_BY_ORB). Corrigido.
2. **Botões da topbar inclicáveis** — containers flex aninhados calculavam largura errado, botões ficavam sobrepostos. Corrigido achatando a estrutura.
3. **Tabelas largas cortando a coluna de ações** — `.modulo-area` crescia com o conteúdo em vez de conter/rolar. Corrigido com `overflow-x` correto.

## Backlog geral — status das fases
Peça o documento completo "BACKLOG MELHORIAS APP ORBEEX" enviado por você se precisar dos detalhes originais (12 seções). Progresso:

- [x] **Fase 1 — Colaboradores e permissões:** cadastro completo (nome/e-mail/senha/papel), editar colaborador (nome+papel juntos), alterar senha, ativar/inativar, excluir empresa (só ORBEEX), recuperar senha no login
- [x] **Fase 2 — Dashboard e ordenação:** cards do dashboard viram atalhos de navegação (Objetivos, Indicadores, Plano de Ação, Atas, Mapa Estratégico, Macrofluxo); listas em ordem alfabética (Objetivos, Partes Interessadas, Riscos, Planos de Ação, Contexto) — exceto onde ordem cronológica/sequencial faz mais sentido (Atas, resultados de indicadores, Macrofluxo)
- [x] **Fase 3 — Contexto/Macrofluxo:** filtros de Contexto reorganizados em "Análise de Cenário / Informações da Empresa / Macrofluxo" (grupo) com sub-filtro SWOT/PESTEL dentro de Cenário; aba Macrofluxo removida do menu superior e absorvida como conteúdo dentro de Contexto (`macrofluxo.js` agora exporta só o corpo, sem card próprio); atalho do Dashboard e a navegação por evento (`strategya:mudar-aba`) atualizados para abrir `contexto` com `grupo: 'macrofluxo'`
- [x] **Fase 4 — Mapa Estratégico e Objetivos:** clique num card de objetivo no Mapa Estratégico (`mapaEstrategico.js`) navega para a aba Indicadores já filtrada por `objetivo_id`, com banner "Filtrando indicadores do objetivo X" e botão "Limpar filtro" (`indicadores.js` exporta `filtrarPorObjetivo(id)`); o filtro é limpo automaticamente ao clicar manualmente na aba Indicadores ou no atalho "Indicadores" do Dashboard
- [x] **Fase 5 — Indicadores:** migração `0016_indicadores_classificacao_descricao.sql` adicionou `classificacao` (com_meta/monitoramento/complementar, default com_meta) e `descricao`; `meta`/`polaridade` agora são opcionais no banco. Formulário: unidade virou `<select>` com lista fixa (%, R$, un, dias, horas, pontos, kg, ton, m²) + opção "Outra..." com campo de texto; classificação com toggle que esconde Meta/Polaridade quando não é "Com meta"; descrição em campo próprio, separado da fórmula. Telas que exibem meta/unidade (indicadores, dashboard, atas de reunião) tratam meta nula com "—"
- [x] **Fase 6 — Plano de Ação (reestruturação grande):** migração `0017_planos_acao_macro_micro.sql` adicionou `numero` (gerado por trigger `gerar_numero_plano_acao`, formato 001/2026 sequencial por empresa+ano, com backfill dos planos existentes) e a tabela `planos_acao_itens` (ações micro: descrição/responsável/prazo/status/%). Tela: botão "Ações micro" por linha abre modal de gerenciamento das ações; `recalcularPercentualMacro()` recalcula o % do macro (média das micro) a cada criação/edição/exclusão de ação micro e persiste em `planos_acao.percentual_conclusao`; o campo "% de conclusão" saiu do formulário do macro (agora somente leitura, com nota explicando onde editar). Lista ordenada por número (cronológica) em vez de alfabética, já que a numeração sequencial estabelece a ordem natural
- [x] **Fase 7 — Ata de Reunião (reestruturação):** migração `0018_atas_multiplos_indicadores_e_todo.sql` — tabela `rac_indicadores` (vários indicadores por ata, cada um com sua consideração; substituiu a coluna única `indicador_id`, com migração dos dados existentes), `consideracoes` na ata agora é só "considerações gerais", `decisoes` já era campo dedicado (só relabelado). Nova tabela `rac_acoes` para as ações em formato TO DO (descrição/responsável/prazo/concluída), gerenciadas num modal próprio (botão "Ações (to-do)" na lista, contagem x/y concluídas). Botão "Abrir Plano de Ação" por ação cria um `planos_acao` (origem `rac`, precisou liberar esse valor no check constraint) e navega direto pra aba Planos de Ação já mostrando o plano criado
- [x] **Fase 8 — Módulo TO DO:** por pedido da Luana, NÃO virou aba própria — a aba "Planos de Ação" foi renomeada para "Ações" e ganhou um filtro de grupo "Planos de Ação / TO DO" (mesmo padrão do Contexto/Macrofluxo da Fase 3), gerenciado em `planosAcao.js` (`irParaGrupo`). O TO DO (`js/modules/todo.js`, `renderCorpo`) consolida 3 fontes: `todo_itens` (nova tabela, inclusão manual — migração `0019_todo_itens.sql`), `planos_acao_itens` (ações micro dos planos) e `rac_acoes` (ações das atas), com filtros por responsável/indicador/status/mês e exportação CSV (client-side) e PDF (via `window.print()`). Itens de plano/ata mostram "gerenciado na origem" (edição continua nos seus modais próprios); só os itens manuais têm editar/excluir aqui
- [x] **Fase 9 — Macrofluxo:** reordenação de itens com setas ←/→ (persistida no campo `ordem`, que antes existia no banco mas nunca era usado — todos os itens tinham ordem=0; ao mover, a lista inteira do tipo é renumerada em sequência para corrigir dados legados), numeração visual (1, 2, 3...) nos processos principais, hover com leve elevação/sombra nos cards de processo principal e de apoio para dar feedback de interatividade

- [x] **Fase 10 — Tarefas (unificação de edição):** migração `0020_evolucao_tarefas.sql` adicionou coluna `evolucao` (texto livre) em `todo_itens`, `planos_acao_itens` e `rac_acoes`. A aba Tarefas (`todo.js`) ganhou: filtro de data "De/Até" (substituiu o filtro de mês único) além do filtro de responsável já existente; botão de concluir/reabrir direto na lista para as 3 origens (manual, plano, ata — sem precisar abrir a origem); botão de editar unificado (`abrirDetalheTarefa`) que abre um modal com descrição, responsável, prazo, status (só editável para itens manuais; plano/ata usam o botão de concluir) e o novo campo "Evolução / descrição das ações realizadas". `recalcularPercentualMacro` foi exportado de `planosAcao.js` para ser reaproveitado quando uma tarefa de plano é concluída/reaberta direto pela aba Tarefas.

- [x] **Fase 11 — Reestruturação de abas e impressão profissional:** Contexto perdeu o sub-filtro PESTEL (só SWOT) e ganhou "Partes Interessadas" como grupo (antes era aba própria, agora embutida como no Macrofluxo); filtros de grupo agora numa única linha. Mapa Estratégico foi unificado com Objetivos numa única aba ("Mapa e Objetivos") — o mapa (lanes BSC) aparece no topo, tabela de objetivos embaixo; a seção de "Relações de Causa e Efeito" foi removida (tabela `objetivos_relacoes` continua no banco, só a UI foi retirada). Todos os campos de "Responsável" (Objetivos, Indicadores, Planos de Ação, Atas, Tarefas) agora mostram o nome de exibição do usuário em vez do e-mail (`m.nome || m.email`, o RPC `listar_usuarios_empresa` já retornava `nome` desde a Fase 1, só não era usado). Atas de Reunião ganhou botão de impressão por linha que gera um documento formatado da ata (pauta, indicadores com considerações, decisões, tarefas) via `#print-secao` + classe `imprimindo-secao` no body. Semáforo de indicadores no Dashboard ganhou link direto para abrir os resultados do indicador (`indicadores.abrirIndicadorPorId`). Toda impressão do app (Contexto, ata individual, Tarefas) agora usa um timbre padrão (`#print-letterhead`, atualizado em `selecionarEmpresa`) com logo e dados da empresa atual + marca fixa "STRATEGYA by ORBEEX".

**Backlog completo — todas as 11 fases concluídas (fechado como v1.0).**

## Backlog v2 (pós v1.0) — recebido de Luana em 11/07/2026

### Já implementado nesta leva (fase 12)
- **Mapa Estratégico:** perspectiva BSC "Clientes" renomeada para "Mercado" (chave interna `clientes` mantida, só o rótulo mudou — `objetivos.js` e `dashboard.js`).
- **Objetivos Estratégicos:** filtro por responsável e por status; seleção em massa (checkboxes, mesmo padrão de Planos de Ação) com botão "Imprimir" que imprime a seleção ou, se nada estiver marcado, os itens filtrados na tela (`imprimirListaObjetivos`).
- **Indicadores:** filtro por responsável (`renderTabela` extraído para permitir refiltrar sem recarregar a tela toda).
- **Identidade Visual do Cliente:** novo seletor "Cor da fonte (sobre fundo escuro)" — migração `0023_empresa_cor_texto.sql` (coluna `empresas.cor_texto`, default `#ffffff`), aplicada via nova CSS var `--navy-text` em `tema.js`/`style.css` (topbar, cabeçalho de tabelas, lanes do mapa, toast etc. — trocado de `#fff`/`rgba(255,255,255,x)` fixos para `var(--navy-text)` / `color-mix(...)`).
- **Planos de Ação:** exclusão de plano agora é bloqueada se houver tarefas (ações micro) vinculadas em `planos_acao_itens` — pede pra excluir as tarefas primeiro.
- **Campo "Análise" no modo Apresentação dos Indicadores:** já estava implementado (migração `0022`, textarea + botão "Salvar análise" em `abrirApresentacao`), só não tinha sido comitado — confirmado que persiste em `indicadores.analise` e recarrega ao reabrir. Se o pedido de Luana for especificamente um **link compartilhável** (fora do login) para a apresentação, isso ainda não existe e entra como item novo a especificar.

### Fase 13 — Identidade Visual redesenhada + Rastreabilidade + Departamentos (implementado em 11/07/2026)

Luana pediu pra corrigir o campo de cor da fonte (feio) e seguir com o restante do backlog, com estas decisões: Fase 13 = "fechar o ano" (snapshot); Fase 14 e 16 = seguir com as propostas padrão; Fase 15 = aguardando ela decidir provedor de e-mail antes de programar.

- **Identidade Visual redesenhada:** ao enviar/trocar o logo, `extrairCoresDoLogo` já existente agora também aciona `corTextoIdeal(hex)` (nova função em `tema.js`, luminância WCAG) pra sugerir a cor de fonte com bom contraste automaticamente — cor primária, destaque e fonte ficam editáveis nos "swatches" redondos com hex visível, com pré-visualização ao vivo (topbar + card de exemplo) antes de salvar. Mesmo fluxo replicado no modal "Nova empresa" (`app.js`). CSS novo: `.brand-editor` e afins em `style.css`.
- **Fase 14 — Rastreabilidade (auditoria):** migração `0024_log_alteracoes.sql` — tabela `log_alteracoes` (empresa_id, tabela, registro_id, usuario_id, operação, campo, valor_anterior, valor_novo, criado_em) + função genérica `fn_log_alteracao()` (trigger `security definer`, faz diff campo a campo via `to_jsonb`) instalada via `AFTER INSERT/UPDATE/DELETE` em 12 tabelas principais (empresas, objetivos_estrategicos, objetivos_relacoes, indicadores, planos_acao, reunioes_analise_critica, riscos_oportunidades, contexto_organizacional, partes_interessadas, macrofluxo_processos, todo_itens, usuarios_empresas). RLS: só orbeex/admin da empresa leem (`log_alteracoes_select`); client não grava direto (`revoke insert/update/delete`), só o trigger grava. UI: `js/modules/historico.js` (novo módulo) — card "Histórico de Alterações" com filtros (tabela/usuário/data), embutido em Configurações (`empresaUsuarios.js`, `area-historico`). Tabelas filhas sem `empresa_id` direto (resultados_indicadores, planos_acao_itens, rac_indicadores, rac_acoes) ficaram de fora desta leva — dá pra estender depois se precisar.
- **Fase 16 — Departamentos e permissão por usuário/departamento:** migração `0025_departamentos_e_permissoes.sql` — tabela `departamentos` (empresa_id, nome) e `usuarios_empresas.departamento_id` (opcional). Tabela `modulos_restritos` (empresa_id, departamento_id OU usuario_id, modulo_id): presença de qualquer linha ativa modo "lista de permissão" pra aquele alvo (só os módulos listados aparecem), sem nenhuma linha mantém o padrão (vê tudo que `empresas.modulos_habilitados` liberou pra empresa toda) — restrição por usuário tem prioridade sobre a do departamento. Enforcement em `app.js`: `carregarRestricoesModulo()` roda a cada troca de empresa e alimenta `state.modulosPermitidos`, consultado dentro de `moduloHabilitadoParaEmpresa()`. UI em `empresaUsuarios.js`: card "Departamentos" (CRUD simples) + botão "Módulos" por departamento e por colaborador, abrindo modal reutilizável `abrirModalModulosPermitidos` (checkboxes dos módulos habilitados na empresa). Migração `0027` atualizou o RPC `listar_usuarios_empresa` pra devolver `departamento_id` também.
- **"Primeiro acesso" (validação por e-mail):** Supabase Auth tem confirmação de e-mail nativa, mas não existe ferramenta de API pra ativar isso programaticamente — fica pendente de Luana habilitar manualmente em Authentication → Settings → "Confirm email" no painel do Supabase. O advisor de segurança também apontou "Leaked Password Protection" desligado (mesma tela) — vale ativar junto.
- **Fase 13 (versionamento anual):** migração `0026_versionamento_anual_pe.sql` — tabelas `ciclos_pe` (empresa_id, ano, fechado_em, fechado_por) e `ciclos_pe_snapshot` (ciclo_id, tabela, dados jsonb) + função `fechar_ciclo_pe(empresa_id, ano)` (security definer, só orbeex/admin, congela objetivos/indicadores/resultados/planos+itens/contexto/partes interessadas/macrofluxo/riscos daquele momento em JSON). Não reseta nem trava os dados vivos — o "novo ciclo" é a continuidade natural dos mesmos registros. UI: card "Ciclos do Planejamento Estratégico" em Configurações, com botão "Fechar ano [atual]" e lista dos anos já fechados. Ainda não tem tela de visualização detalhada do snapshot (só lista ano + data) — se precisar consultar o conteúdo congelado, por enquanto é via SQL direto (`ciclos_pe_snapshot`).

### Pendente
- **Fase 15 — E-mail:** Luana ainda precisa decidir o provedor de e-mail transacional (Resend, SendGrid etc.) antes de programar — sem isso não dá pra registrar envios nem gerar anexos de verdade. `enviarPorEmail()` continua só abrindo o `mailto:` do cliente local por enquanto.
- Tela de detalhe do snapshot de um ciclo fechado (Fase 13) e extensão da rastreabilidade (Fase 14) pras tabelas filhas, se fizer falta.
- **Regras já confirmadas como implementadas** (não precisaram de trabalho novo): usuários com papel "usuario" já não conseguem incluir/editar/excluir colaboradores nem acessar Configurações (`podeGerenciar` em `empresaUsuarios.js`, tela só visível a admin+orbeex).

## Observações
- Várias vezes durante o desenvolvimento você mesma testou em paralelo (criou empresas de teste, colaboradores reais como "alexander@tedescoarmazenagem.com.br" etc.) — dados reais da Tedesco já estão no sistema.
- Regra geral pendente de reforçar em cada fase nova: ordem alfabética, visual padronizado, menos cliques.
