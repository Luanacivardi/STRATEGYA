-- Impede que um Administrador conceda o papel ORBEEX a si mesmo ou a outros (só quem já é
-- ORBEEX numa empresa pode conceder ORBEEX nela), tanto via INSERT (convite/criação de usuário)
-- quanto via UPDATE direto em usuarios_empresas (ex: tela de Permissões).
-- Exceção: bootstrap — a primeira vinculação de uma empresa recém-criada (criar_empresa)
-- pode ser ORBEEX, senão ninguém conseguiria criar empresas.

create or replace function proteger_papel_orbeex()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.papel != 'orbeex' then
    return new;
  end if;

  if usuario_tem_acesso_empresa(new.empresa_id, array['orbeex']) then
    return new;
  end if;

  if not exists (select 1 from usuarios_empresas where empresa_id = new.empresa_id) then
    return new;
  end if;

  raise exception 'Apenas usuários ORBEEX podem conceder o papel ORBEEX';
end;
$$;

create trigger trg_proteger_papel_orbeex
  before insert or update on usuarios_empresas
  for each row execute function proteger_papel_orbeex();
