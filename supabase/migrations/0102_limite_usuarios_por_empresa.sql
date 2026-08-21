-- Precificação hoje é vendida por faixa de usuários (ver Plano de Negócio), mas o banco nunca
-- impôs esse limite: nada impedia uma empresa cadastrar mais colaboradores do que contratou.
-- Isso passa a valer no banco, nos dois pontos que aumentam o número de vínculos ativos:
-- convidar_usuario_por_email() (cadastro/reconvite) e definir_ativo_usuario_empresa() (reativação).
--
-- "Ilimitado" continua existindo como opção comercial, mas nunca como NULL/sem controle técnico —
-- todo contrato "ilimitado" recebe um teto de fair-use alto (ex.: 999999) para preservar o
-- direito de renegociar se o uso real disparar. Ver conversa de precificação de 2026-08-21.

alter table empresas
  add column if not exists limite_usuarios integer not null default 10;

alter table empresas
  add constraint empresas_limite_usuarios_positivo check (limite_usuarios > 0);

comment on column empresas.limite_usuarios is
  'Teto de colaboradores ativos (usuarios_empresas.ativo = true) vendido para esta empresa. '
  'Nunca usar valor "ilimitado real" (sem teto) — planos "ilimitados" recebem um número alto '
  '(ex.: 999999) com cláusula de fair-use/revisão no contrato, não ausência de controle técnico.';

-- Helper reaproveitável pelo backend e pelo frontend (tela de colaboradores mostra "X de Y").
create or replace function public.usuarios_ativos_e_limite_empresa(p_empresa_id uuid)
returns table (usuarios_ativos integer, limite_usuarios integer)
language sql
security definer
stable
set search_path = public
as $$
  select
    (select count(*)::int from usuarios_empresas where empresa_id = p_empresa_id and ativo = true),
    (select e.limite_usuarios from empresas e where e.id = p_empresa_id);
$$;

revoke execute on function public.usuarios_ativos_e_limite_empresa(uuid) from public, anon;
grant execute on function public.usuarios_ativos_e_limite_empresa(uuid) to authenticated;

-- convidar_usuario_por_email(): só bloqueia quando o vínculo é novo (aumenta o total de ativos).
-- Reconvite de quem já está vinculado (só troca papel/departamento) não mexe em headcount.
create or replace function public.convidar_usuario_por_email(p_empresa_id uuid, p_email text, p_papel text, p_departamento_id uuid default null::uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_usuario_id uuid;
  v_ja_vinculado boolean;
  v_ativos integer;
  v_limite integer;
begin
  if not usuario_tem_acesso_empresa(p_empresa_id, array['orbeex', 'admin']) then
    raise exception 'Sem permissão para gerenciar usuários desta empresa';
  end if;

  if p_papel not in ('orbeex', 'admin', 'gestor', 'usuario') then
    raise exception 'Papel inválido';
  end if;

  if p_departamento_id is not null and not exists (
    select 1 from departamentos d where d.id = p_departamento_id and d.empresa_id = p_empresa_id
  ) then
    raise exception 'Departamento inválido para esta empresa';
  end if;

  select id into v_usuario_id from auth.users where email = p_email limit 1;
  if v_usuario_id is null then
    raise exception 'Nenhum usuário cadastrado com este e-mail';
  end if;

  select exists (
    select 1 from usuarios_empresas where usuario_id = v_usuario_id and empresa_id = p_empresa_id
  ) into v_ja_vinculado;

  if not v_ja_vinculado then
    select limite_usuarios into v_limite from empresas where id = p_empresa_id;
    select count(*) into v_ativos from usuarios_empresas where empresa_id = p_empresa_id and ativo = true;
    if v_ativos >= v_limite then
      raise exception 'Limite de % usuários ativos atingido para esta empresa. Fale com a ORBEEX para ampliar o plano.', v_limite;
    end if;
  end if;

  insert into usuarios_empresas (usuario_id, empresa_id, papel, departamento_id)
    values (v_usuario_id, p_empresa_id, p_papel, p_departamento_id)
    on conflict (usuario_id, empresa_id) do update
      set papel = excluded.papel,
          departamento_id = coalesce(excluded.departamento_id, usuarios_empresas.departamento_id);
end;
$function$;

-- definir_ativo_usuario_empresa(): reativar alguém (false -> true) também aumenta headcount ativo.
create or replace function public.definir_ativo_usuario_empresa(p_empresa_id uuid, p_usuario_id uuid, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estava_ativo boolean;
  v_ativos integer;
  v_limite integer;
begin
  if not usuario_tem_acesso_empresa(p_empresa_id, array['orbeex', 'admin']) then
    raise exception 'Sem permissão para gerenciar usuários desta empresa';
  end if;

  select ativo into v_estava_ativo from usuarios_empresas
    where empresa_id = p_empresa_id and usuario_id = p_usuario_id;

  if p_ativo and not coalesce(v_estava_ativo, false) then
    select limite_usuarios into v_limite from empresas where id = p_empresa_id;
    select count(*) into v_ativos from usuarios_empresas where empresa_id = p_empresa_id and ativo = true;
    if v_ativos >= v_limite then
      raise exception 'Limite de % usuários ativos atingido para esta empresa. Fale com a ORBEEX para ampliar o plano.', v_limite;
    end if;
  end if;

  update usuarios_empresas set ativo = p_ativo where empresa_id = p_empresa_id and usuario_id = p_usuario_id;
end;
$$;

revoke execute on function definir_ativo_usuario_empresa(uuid, uuid, boolean) from public, anon;
grant execute on function definir_ativo_usuario_empresa(uuid, uuid, boolean) to authenticated;

-- Mesma defesa em profundidade usada em modulos_habilitados: só ORBEEX altera o teto comercial,
-- reforçado no banco (a tela de Permissões já é ORBEEX-only, mas isso não pode ser proteção só de tela).
create or replace function public.proteger_limite_usuarios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.limite_usuarios is distinct from old.limite_usuarios
     and not usuario_tem_acesso_empresa(new.id, array['orbeex']) then
    raise exception 'Apenas usuários ORBEEX podem alterar o limite de usuários desta empresa';
  end if;
  return new;
end;
$$;

create trigger trg_proteger_limite_usuarios
  before update on empresas
  for each row execute function proteger_limite_usuarios();

revoke execute on function proteger_limite_usuarios() from public, anon, authenticated;
