-- Itens da SWOT (fraqueza/ameaça/oportunidade) passam a alimentar automaticamente
-- a tabela riscos_oportunidades; esta coluna guarda o vínculo.
alter table contexto_organizacional
  add column risco_oportunidade_id uuid references riscos_oportunidades(id) on delete set null;
