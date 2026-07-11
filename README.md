# Atualizações — STRATEGYA

## O que foi feito
- "Ações" e "Controladoria" agora são módulos próprios no menu (antes, Ações era uma aba dentro
  do Planejamento Estratégico).
- Em Configurações, o controle por usuário agora é por nível de edição (Leitura / Só o que for
  responsável / Edição total), em vez de módulos.
- Novo módulo Controladoria: contas gerenciais, análises periódicas, upload de relatórios e
  integração com Plano de Ação e Tarefas.

## Como aplicar
1. Suba os arquivos desta pasta no repositório, mantendo os mesmos nomes e pastas.
2. Rode as migrations (arquivos `.sql`) no Supabase, na ordem dos números.
3. Depois de publicado, vá em Permissões e habilite o módulo "Controladoria" para as empresas
   que devem usá-lo.
4. Revise o nível de edição de cada usuário em Configurações.
