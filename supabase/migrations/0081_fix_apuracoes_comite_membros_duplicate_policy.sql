-- apuracoes_comite_write era um "for all" que sobrepunha apuracoes_comite_select
-- (a causa do advisor "multiple_permissive_policies" nesta tabela, mesma classe de bug
-- já corrigida nas migrações 0079/0080 para as demais tabelas). Aqui só se separa o
-- "for all" em insert/update/delete, mantendo a mesma condição (só ORBEEX/Administrador
-- gerencia quem está no comitê) — apuracoes_comite_select não é tocada.

drop policy apuracoes_comite_write on apuracoes_comite_membros;

create policy apuracoes_comite_insert on apuracoes_comite_membros for insert with check (
  usuario_tem_acesso_empresa(empresa_id, ARRAY['orbeex','admin'])
);
create policy apuracoes_comite_update on apuracoes_comite_membros for update using (
  usuario_tem_acesso_empresa(empresa_id, ARRAY['orbeex','admin'])
) with check (
  usuario_tem_acesso_empresa(empresa_id, ARRAY['orbeex','admin'])
);
create policy apuracoes_comite_delete on apuracoes_comite_membros for delete using (
  usuario_tem_acesso_empresa(empresa_id, ARRAY['orbeex','admin'])
);
