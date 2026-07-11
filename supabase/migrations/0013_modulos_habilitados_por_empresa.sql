-- Cada empresa agora tem uma lista configurável de módulos habilitados (o que os usuários
-- dela veem no sistema). Só quem tem papel ORBEEX pode alterar essa lista — reforçado por
-- trigger no banco, não apenas escondendo o controle na interface.

alter table empresas add column modulos_habilitados text[] not null default array['planejamento-estrategico', 'riscos-oportunidades'];

update empresas set modulos_habilitados = array['planejamento-estrategico', 'riscos-oportunidades', 'documentos', 'nao-conformidades', 'auditorias', 'treinamentos']
where nome = 'STRATEGYA';

create or replace function proteger_modulos_habilitados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.modulos_habilitados is distinct from old.modulos_habilitados
     and not usuario_tem_acesso_empresa(new.id, array['orbeex']) then
    raise exception 'Apenas usuários ORBEEX podem alterar os módulos habilitados desta empresa';
  end if;
  return new;
end;
$$;

create trigger trg_proteger_modulos_habilitados
  before update on empresas
  for each row execute function proteger_modulos_habilitados();
