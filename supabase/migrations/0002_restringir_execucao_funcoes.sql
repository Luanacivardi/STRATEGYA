-- Restringe execução das funções auxiliares/RPC ao papel authenticated (remove acesso anônimo)

revoke execute on function usuario_tem_acesso_empresa(uuid, text[]) from public, anon;
grant execute on function usuario_tem_acesso_empresa(uuid, text[]) to authenticated;

revoke execute on function criar_empresa(text, text) from public, anon;
grant execute on function criar_empresa(text, text) to authenticated;
