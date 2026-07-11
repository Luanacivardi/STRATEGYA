# Atualizações — STRATEGYA

## O que foi feito
- "Ações" e "Controladoria" agora são módulos próprios no menu. "Riscos e Oportunidades" voltou a
  ser aba dentro do Planejamento Estratégico. Para o papel ORBEEX, Ações e Controladoria ficam
  sempre visíveis em qualquer empresa, mesmo que a empresa não tenha habilitado.
- Em Configurações, o controle por usuário agora é por nível de edição (Leitura / Só o que for
  responsável / Edição total), em vez de módulos.
- Módulo Controladoria: contas gerenciais, análises periódicas, upload de relatórios/gráficos
  (com visualização em tela cheia e análise vinculada ao arquivo), impressão (com a imagem do
  último upload) e integração com Plano de Ação e Tarefas (com a tag "Controladoria").
- Plano de Ação: origem "Controladoria", ferramentas da qualidade (5 Porquês e Ishikawa, ocultas
  até clicar no botão), formulário maior, e nova aba "Indicadores dos Planos".
- Apresentação do indicador: ao salvar uma análise, ela também é registrada automaticamente na
  Ata de Reunião aberta do dia. Atas agora têm status Aberta/Fechada. A apresentação também passou
  a mostrar as observações lançadas com os resultados e o histórico de análises com data e autor.
- Macrofluxo: processos ganham um número (usado futuramente para vincular documentos) e uma
  visualização em tela cheia.
- Partes Interessadas: campo único virou dois — Necessidades e Satisfação de partes interessadas.
- Correção geral: impressões com imagem (Controladoria) agora esperam a imagem carregar antes de
  abrir a janela de impressão.
- Módulo Documentos (ISO 9001, cláusula 7.5) ativado: numeração automática por tipo (Procedimento,
  IT, Registro, Manual, Política), ciclo Elaboração → Aprovação → Publicado → Obsoleto, nova revisão
  ao editar um publicado (o publicado continua vigente até a nova ser aprovada), assinatura
  eletrônica simples na aprovação (reautenticação de senha + hash do conteúdo), Registro exigindo
  Processo e Procedimento vinculados, Lista Mestra com filtros/CSV/impressão e aba de Obsoletos com
  aviso "NÃO UTILIZAR". Arquivos: `js/modules/documentos.js` (novo) e `js/app.js` (integrado ao
  MODULOS_SIMPLES, junto de Ações e Controladoria).

## Como aplicar
1. Suba os arquivos desta pasta no repositório, mantendo os mesmos nomes e pastas.
2. As migrations (pasta `supabase/migrations`) **já foram aplicadas direto no banco de produção**
   durante esta conversa — não precisa rodá-las de novo. Se for aplicar em outro ambiente (ex:
   staging), rode na ordem dos números (0034 a 0043).
3. Depois de publicado, vá em Permissões e habilite os módulos "Controladoria" e "Documentos" para
   as empresas que devem usá-los (para o papel ORBEEX, Ações e Controladoria já ficam sempre
   visíveis; Documentos segue a regra normal de habilitação por empresa).
4. Revise o nível de edição de cada usuário em Configurações.
