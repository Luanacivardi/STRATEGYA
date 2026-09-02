# Migrações: o estado real em 02/09/2026

## O resumo

**Os arquivos em `supabase/migrations/` não descrevem o banco de produção.** Reaplicá-los numa
base vazia **não** reproduz o que está no ar hoje. Isso importa no dia em que for preciso criar um
ambiente de homologação, ou reconstruir o banco do zero.

O caminho confiável de reconstrução hoje é o **backup semanal** (`01-estrutura.sql` dentro do zip
em `backups/semanal/`), que é um `supabase db dump` de verdade — não a pasta de migrações.

## Os números

| | |
|---|---|
| Migrações registradas no banco | 132 |
| Arquivos no repositório | 103 |
| Aplicadas sem arquivo correspondente | 29 |
| Arquivos cujo nome não bate com o banco | 6 (são renomeações, não faltas) |

## Os 6 que são só nome diferente

O mesmo trabalho, gravado no banco com outro nome. Não falta nada aqui:

| Arquivo no repositório | Nome no banco |
|---|---|
| `0006_fix_select_logos_e_logo_no_cabecalho` | `remover_listagem_publica_logos` |
| `0015_colaboradores_nome_e_ativo` | `colaboradores_nome_e_ativo_v2` |
| `0028_restringir_execucao_fn_log_alteracao` | `revogar_execucao_direta_fn_log_alteracao` |
| `0055_auditorias_relatorio_detalhado` | `auditorias_relatorio_detalhado_tabelas` + `_rls` (dividido em dois) |
| `0090_move_pg_net_out_of_public` | `reinstall_pg_net_in_extensions_schema` |
| `0099_treinamentos_revoga_execute_trigger` | `revoga_execute_trigger_versatilidade` |

## As 29 que existem só no banco

Aplicadas direto pelo painel/SQL Editor e nunca viraram arquivo. Concentram-se em três ondas:

- **Correções de advisor (12/07)** — `fix_security_advisors`, `add_missing_fk_indexes`,
  `consolidate_rls_policies_part1` e `part2`, `fix_remaining_auth_uid_initplan`,
  `fix_anon_execute_grants`, `fix_remaining_select_initplan`
- **Gestão de Auditorias em pedaços (18/07)** — `gestao_auditorias_main_table`, `_child_tables`,
  `_integracao_acoes`, `_rls`, `_storage`, `_revoke_trigger_fn_execute`. O repositório tem um
  arquivo único (`0048_gestao_auditorias.sql`) onde o banco tem seis registros.
- **Endurecimento de permissões (02/08)** — `revoga_escrita_anon_e_truncate`,
  `limites_de_upload_nos_buckets`, `permissao_aprovacao_terceiro_por_flag`,
  `corrige_initplan_e_indices_fk`

As demais são pontuais: `proteger_papel_orbeex_bootstrap`, `restringir_funcoes_trigger`,
`log_alteracoes_departamentos`, `documentos_copia_controlada_revogar_anon`,
`fix_criar_empresa_permissao`, `fix_gerar_numero_documento_search_path`,
`fn_buscar_usuario_id_por_email`, `consolidar_policies_all_em_insert_update_delete`,
`corrige_auth_uid_initplan_nas_novas_policies`, `fix_permissoes_edicao_upsert_on_conflict`,
`gestao_apuracoes_fix_search_path`.

## Consolidar: por que agora, e o que falta

Enquanto **todos os dados forem de teste** (situação em 02/09/2026), dá para gerar um marco zero
limpo e aposentar os 103 arquivos. Depois do primeiro contrato, essa janela fecha.

O passo que falta não é meu: **rodar o workflow "Espelhar schema de producao"**
(Actions → Run workflow). Ele produz `supabase/schema_producao.sql` a partir de um `pg_dump` real
— que é o único jeito honesto de gerar o marco zero. Reconstruir esse DDL por consulta ao catálogo
sairia pior e com risco de perder detalhe (grants, extensões, triggers, RLS do schema `storage`).

Esse workflow rodava toda segunda desde 15/08 sem fazer nada: a checagem usava
`git diff --quiet` num arquivo que nunca tinha sido rastreado, e `git diff` ignora arquivo não
rastreado — então concluía "nada mudou" e terminava verde. Corrigido no commit `a53faae`.

### Procedimento, quando o dump existir

1. Conferir que `schema_producao.sql` foi gerado e tem tamanho compatível (esperado: alguns
   milhares de linhas).
2. Criar um projeto Supabase descartável e aplicar **só** esse arquivo. Confirmar que sobe sem erro.
3. Comparar o resultado com produção: contagem de tabelas (66), de policies (240) e de funções (36).
4. Só então: mover os 103 arquivos para `supabase/migrations/_historico/`, gravar o dump como
   `0001_marco_zero.sql` e alinhar `supabase_migrations.schema_migrations`.
5. Manter o workflow semanal ligado — é ele que impede a divergência de voltar.

**Não pular o passo 2.** O valor inteiro da consolidação está em o marco zero realmente reproduzir
produção; um marco zero que não sobe é pior que a bagunça atual, porque parece confiável.

## Convenção daqui pra frente

Toda alteração de banco: aplicar **e** salvar o arquivo em `supabase/migrations/`, com o mesmo nome
usado no registro. Os prefixos `0034`/`0035` estão duplicados no histórico — não renomear
(os arquivos já foram aplicados e renomear só confunde uma restauração futura); usar numeração
nova a partir de `0104`.
