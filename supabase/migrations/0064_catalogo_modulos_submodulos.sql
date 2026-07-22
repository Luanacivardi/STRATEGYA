-- Catálogo de módulos/submódulos: fonte de verdade no BANCO para o que é um módulo/submódulo válido
-- em permissoes_edicao. Evita divergência entre o que a UI (js/modulosConfig.js) oferece e o que as
-- políticas RLS realmente esperam — um literal errado numa política nova não é pego por isto (isso
-- exige revisão manual), mas um literal errado gravado em permissoes_edicao (por bug de UI ou uso
-- direto da API) é rejeitado pelo trigger abaixo.
--
-- Cada módulo tem uma linha com submodulo = null ("módulo inteiro" — usada tanto por módulos sem
-- submódulo, ex. Controladoria/Documentos, quanto como opção de "aplicar a todo o módulo" para os
-- que têm submódulo, ex. Planejamento Estratégico). configuravel=false marca módulos com sistema de
-- acesso próprio (Apurações via comitê, Auditorias só orbeex/admin) — não entram na matriz de
-- permissões nem aceitam linha em permissoes_edicao.
create table catalogo_modulos_submodulos (
  id serial primary key,
  modulo text not null,
  submodulo text null,
  configuravel boolean not null default true,
  ordem int not null default 0
);

create unique index uq_catalogo_mod_sub on catalogo_modulos_submodulos(modulo, coalesce(submodulo, ''));

insert into catalogo_modulos_submodulos (modulo, submodulo, configuravel, ordem) values
  ('planejamento-estrategico', null, true, 0),
  ('planejamento-estrategico', 'contexto-cenario', true, 1),
  ('planejamento-estrategico', 'contexto-partes', true, 2),
  ('planejamento-estrategico', 'contexto-macrofluxo', true, 3),
  ('planejamento-estrategico', 'contexto-sipoc', true, 4),
  ('planejamento-estrategico', 'objetivos', true, 5),
  ('planejamento-estrategico', 'riscos', true, 6),
  ('planejamento-estrategico', 'indicadores', true, 7),
  ('planejamento-estrategico', 'atas', true, 8),
  ('acoes', null, true, 0),
  ('acoes', 'planos', true, 1),
  ('acoes', 'tarefas', true, 2),
  ('controladoria', null, true, 0),
  ('documentos', null, true, 0),
  ('apuracoes', null, false, 0),
  ('auditorias', null, false, 0),
  ('treinamentos', null, false, 0);

alter table catalogo_modulos_submodulos enable row level security;
create policy catalogo_modulos_submodulos_select on catalogo_modulos_submodulos for select using (true);

create or replace function validar_modulo_submodulo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.modulo = '*' then
    if new.submodulo is not null then
      raise exception 'Coringa de módulo (*) não aceita submódulo';
    end if;
    return new;
  end if;

  if not exists (
    select 1 from catalogo_modulos_submodulos c
    where c.modulo = new.modulo
      and c.submodulo is not distinct from new.submodulo
      and c.configuravel
  ) then
    raise exception 'Módulo/submódulo inválido ou não configurável: % / %', new.modulo, new.submodulo;
  end if;

  return new;
end;
$$;

create trigger trg_validar_modulo_submodulo
before insert or update on permissoes_edicao
for each row execute function validar_modulo_submodulo();
