-- Bug de seguranca real (achado na auditoria funcional de 2026-07-24): as policies de SELECT de
-- ciclos_pe e ciclos_pe_snapshot so exigiam "ue.ativo" (vinculo ativo na empresa), sem checar
-- papel algum. Ou seja, QUALQUER colaborador ativo (inclusive papel 'usuario') conseguia ler o
-- snapshot inteiro de qualquer ano fechado do Planejamento Estrategico via chamada direta ao
-- Supabase (mesmo a UI so mostrando essa secao pra orbeex/admin em empresaUsuarios.js) - exposicao
-- de dado historico (responsaveis, indicadores, planos de acao, riscos) fora do modelo de acesso
-- pretendido. Alinha com o mesmo papel exigido pra ESCREVER (fechar_ciclo_pe ja e orbeex/admin).
drop policy ciclos_pe_select on ciclos_pe;
create policy ciclos_pe_select on ciclos_pe for select using (
  usuario_tem_acesso_empresa(empresa_id, array['orbeex','admin'])
);

drop policy ciclos_pe_snapshot_select on ciclos_pe_snapshot;
create policy ciclos_pe_snapshot_select on ciclos_pe_snapshot for select using (
  exists (
    select 1 from ciclos_pe c
    where c.id = ciclos_pe_snapshot.ciclo_id
      and usuario_tem_acesso_empresa(c.empresa_id, array['orbeex','admin'])
  )
);
