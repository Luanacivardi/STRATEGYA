-- Registro de erros de JavaScript que acontecem no navegador do usuario.
--
-- Por que existe: ate agora, quando um modulo falhava, o app mostrava "Nao foi possivel carregar"
-- e a informacao morria ali, na tela da pessoa. A ORBEEX so descobria por reclamacao — e a maioria
-- nao reclama, so usa menos. Esta tabela e o destino do js/erros.js.
--
-- Optamos por gravar no proprio Supabase em vez de um servico externo (Sentry e afins) por dois
-- motivos: nao depende de conta nova para comecar a funcionar, e nao acrescenta um suboperador
-- estrangeiro a documentacao de LGPD que esta sendo escrita agora. Se um dia fizer falta o painel
-- de agrupamento e alerta de um servico dedicado, ele entra por cima disto sem conflito.

create table if not exists public.erros_cliente (
  id           uuid primary key default gen_random_uuid(),
  criado_em    timestamptz not null default now(),
  usuario_id   uuid references auth.users(id) on delete set null,
  empresa_id   uuid references public.empresas(id) on delete set null,
  contexto     text,               -- modulo/aba onde aconteceu, quando da para saber
  mensagem     text not null,
  pilha        text,
  caminho      text,               -- so o pathname, nunca a URL completa com parametros
  navegador    text,
  build        text                -- carimbo do build, para separar "erro antigo" de "erro novo"
);

comment on table public.erros_cliente is
  'Erros de JavaScript capturados no navegador (ver js/erros.js). Somente ORBEEX le.';

create index if not exists idx_erros_cliente_criado_em on public.erros_cliente (criado_em desc);
create index if not exists idx_erros_cliente_empresa   on public.erros_cliente (empresa_id);

alter table public.erros_cliente enable row level security;

-- INSERT: qualquer pessoa autenticada pode registrar o proprio erro, e so o proprio.
-- O with check amarra a linha ao autor: ninguem consegue gravar erro em nome de outro usuario.
drop policy if exists erros_cliente_insert on public.erros_cliente;
create policy erros_cliente_insert on public.erros_cliente
  for insert to authenticated
  with check (usuario_id = (select auth.uid()));

-- SELECT: exclusivo da equipe ORBEEX. Um erro pode carregar trecho de dado da empresa dentro da
-- mensagem, entao nem o administrador da propria empresa le esta tabela.
-- O (select auth.uid()) esta encapsulado de proposito — mesma correcao de initplan das migracoes
-- 0076 e 0100, que evita reavaliar a funcao linha a linha.
drop policy if exists erros_cliente_select_orbeex on public.erros_cliente;
create policy erros_cliente_select_orbeex on public.erros_cliente
  for select to authenticated
  using (
    exists (
      select 1 from public.usuarios_empresas ue
      where ue.usuario_id = (select auth.uid())
        and ue.papel = 'orbeex'
        and ue.ativo
    )
  );

-- Sem policy de UPDATE nem de DELETE: registro de erro nao se edita nem se apaga pela aplicacao.
-- A limpeza por idade e feita pela service_role (ver rotina de retencao).

revoke all on public.erros_cliente from anon;
grant insert on public.erros_cliente to authenticated;
grant select on public.erros_cliente to authenticated;
