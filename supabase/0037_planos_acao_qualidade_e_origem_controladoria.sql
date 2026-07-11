-- Plano de Ação: permite usar uma conta gerencial (Controladoria) como origem — complementando
-- o que a migration 0036 já fez (origem 'conta_gerencial' já estava liberada no check constraint;
-- aqui é só o reforço de índice pra busca por origem) — e adiciona os campos das ferramentas da
-- qualidade 5 Porquês e Diagrama de Ishikawa, preenchidos sob demanda (ficam ocultos até o usuário
-- clicar no botão da ferramenta).

alter table planos_acao add column analise_5porques jsonb;
alter table planos_acao add column analise_ishikawa jsonb;

comment on column planos_acao.analise_5porques is 'Array com até 5 strings, uma por "por quê" (metodologia 5 Whys).';
comment on column planos_acao.analise_ishikawa is 'Objeto com as 6 categorias do diagrama de Ishikawa (6M): metodo, maquina, mao_de_obra, material, meio_ambiente, medida.';
