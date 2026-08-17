-- Mesma correção de performance da migração 0076 (auth.uid() bruto impede o Postgres de cachear via
-- initplan e reavalia linha a linha) — as políticas 'proprio' de treinamentos/treinamentos_participantes
-- criadas na 0086 têm a mesma regressão. Sem mudança de comportamento, só auth.uid() -> (select auth.uid()).

drop policy treinamentos_insert on treinamentos;
create policy treinamentos_insert on treinamentos for insert with check (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and solicitante_id = (select auth.uid()))
);
drop policy treinamentos_update on treinamentos;
create policy treinamentos_update on treinamentos for update using (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and solicitante_id = (select auth.uid()))
) with check (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and solicitante_id = (select auth.uid()))
);
drop policy treinamentos_delete on treinamentos;
create policy treinamentos_delete on treinamentos for delete using (
  nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'total'
  or (nivel_edicao_usuario(empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and solicitante_id = (select auth.uid()))
);

drop policy treinamentos_participantes_insert on treinamentos_participantes;
create policy treinamentos_participantes_insert on treinamentos_participantes for insert with check (
  exists (select 1 from treinamentos t where t.id = treinamentos_participantes.treinamento_id and (
    nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'total'
    or (nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and t.solicitante_id = (select auth.uid()))
  ))
);
drop policy treinamentos_participantes_update on treinamentos_participantes;
create policy treinamentos_participantes_update on treinamentos_participantes for update using (
  exists (select 1 from treinamentos t where t.id = treinamentos_participantes.treinamento_id and (
    nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'total'
    or (nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and t.solicitante_id = (select auth.uid()))
  ))
) with check (
  exists (select 1 from treinamentos t where t.id = treinamentos_participantes.treinamento_id and (
    nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'total'
    or (nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and t.solicitante_id = (select auth.uid()))
  ))
);
drop policy treinamentos_participantes_delete on treinamentos_participantes;
create policy treinamentos_participantes_delete on treinamentos_participantes for delete using (
  exists (select 1 from treinamentos t where t.id = treinamentos_participantes.treinamento_id and (
    nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'total'
    or (nivel_edicao_usuario(t.empresa_id, 'treinamentos', 'solicitacoes') = 'proprio' and t.solicitante_id = (select auth.uid()))
  ))
);
