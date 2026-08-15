-- criar_empresa() era executável por qualquer usuário autenticado: como o cadastro na tela de
-- login é aberto, qualquer pessoa da internet podia criar conta e sair criando empresas no banco
-- de produção (a UI esconder o botão "Nova empresa" de quem não é ORBEEX era proteção só de tela).
-- Efeito colateral do mesmo buraco: colaborador desativado (ativo = false) perde acesso a tudo,
-- cai na tela "você não está vinculado a nenhuma empresa" e podia criar a própria empresa por ali.
--
-- Agora a regra vale no banco: só quem tem vínculo ORBEEX ativo em alguma empresa cria empresa.
create or replace function public.criar_empresa(p_nome text, p_cnpj text default null)
returns empresas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa empresas;
begin
  if not exists (
    select 1 from usuarios_empresas
    where usuario_id = auth.uid() and papel = 'orbeex' and ativo
  ) then
    raise exception 'Apenas a equipe ORBEEX pode criar empresas';
  end if;

  insert into empresas (nome, cnpj) values (p_nome, p_cnpj) returning * into v_empresa;
  insert into usuarios_empresas (usuario_id, empresa_id, papel)
    values (auth.uid(), v_empresa.id, 'admin');
  return v_empresa;
end;
$$;

revoke execute on function public.criar_empresa(text, text) from public, anon;
grant execute on function public.criar_empresa(text, text) to authenticated;
