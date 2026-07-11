-- Fecha a lacuna: rac_acoes e rac_indicadores (tabelas filhas de reunioes_analise_critica,
-- usadas nas tarefas de origem "ata" em todo.js) ainda não tinham política *_write_nivel,
-- então usuários com nível 'proprio' ou 'total' continuavam bloqueados pela RLS antiga
-- (só orbeex/admin podiam escrever). rac_acoes tem responsavel_id -> mesmo padrão de
-- planos_itens_write_nivel (proprio libera só o que é do próprio responsável). rac_indicadores
-- não tem responsavel_id -> só 'total' libera escrita, como as demais tabelas sem responsável.
create policy rac_acoes_write_nivel on rac_acoes for all using (
  exists (
    select 1 from reunioes_analise_critica r where r.id = rac_acoes.reuniao_id
    and (nivel_edicao_usuario(r.empresa_id) = 'total'
         or (nivel_edicao_usuario(r.empresa_id) = 'proprio' and rac_acoes.responsavel_id = auth.uid()))
  )
) with check (
  exists (
    select 1 from reunioes_analise_critica r where r.id = rac_acoes.reuniao_id
    and (nivel_edicao_usuario(r.empresa_id) = 'total'
         or (nivel_edicao_usuario(r.empresa_id) = 'proprio' and rac_acoes.responsavel_id = auth.uid()))
  )
);

create policy rac_indicadores_write_nivel on rac_indicadores for all using (
  exists (
    select 1 from reunioes_analise_critica r where r.id = rac_indicadores.reuniao_id
    and nivel_edicao_usuario(r.empresa_id) = 'total'
  )
) with check (
  exists (
    select 1 from reunioes_analise_critica r where r.id = rac_indicadores.reuniao_id
    and nivel_edicao_usuario(r.empresa_id) = 'total'
  )
);
