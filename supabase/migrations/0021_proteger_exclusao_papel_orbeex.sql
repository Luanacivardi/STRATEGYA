-- Impede que qualquer usuário que não seja ORBEEX remova (exclua) o vínculo de um usuário ORBEEX
-- numa empresa, ou rebaixe o papel dele para admin/usuário — reforça no banco a mesma regra já
-- aplicada na interface (só quem já é ORBEEX pode mexer no cadastro de outro ORBEEX).
-- Complementa o trigger trg_proteger_papel_orbeex (0014), que só cobria conceder o papel ORBEEX.

create or replace function proteger_exclusao_papel_orbeex()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.papel != 'orbeex' then
    return old;
  end if;

  if usuario_tem_acesso_empresa(old.empresa_id, array['orbeex']) then
    return old;
  end if;

  raise exception 'Apenas usuários ORBEEX podem remover o acesso de outro usuário ORBEEX';
end;
$$;

create trigger trg_proteger_exclusao_papel_orbeex
  before delete on usuarios_empresas
  for each row execute function proteger_exclusao_papel_orbeex();

-- Amplia a proteção de UPDATE existente para também bloquear o rebaixamento (demote) de um
-- vínculo ORBEEX por quem não é ORBEEX — antes só bloqueava conceder o papel, não retirar.
create or replace function proteger_papel_orbeex()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.papel = 'orbeex' then
    if usuario_tem_acesso_empresa(new.empresa_id, array['orbeex']) then
      return new;
    end if;

    if not exists (select 1 from usuarios_empresas where empresa_id = new.empresa_id) then
      return new;
    end if;

    raise exception 'Apenas usuários ORBEEX podem conceder o papel ORBEEX';
  end if;

  if tg_op = 'UPDATE' and old.papel = 'orbeex' and not usuario_tem_acesso_empresa(new.empresa_id, array['orbeex']) then
    raise exception 'Apenas usuários ORBEEX podem alterar o papel de outro usuário ORBEEX';
  end if;

  return new;
end;
$$;
