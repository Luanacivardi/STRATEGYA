-- treinamentos_atualizar_versatilidade() é uma função de trigger pura (usa NEW/OLD, só faz sentido
-- disparada por UPDATE em treinamentos) — não deveria estar exposta como RPC via PostgREST (advisor
-- "anon/authenticated_security_definer_function_executable"). O disparo automático da trigger não
-- depende de EXECUTE do usuário na função (é o executor do banco quem invoca), então revogar aqui
-- não quebra a atualização automática da matriz de versatilidade.
revoke execute on function treinamentos_atualizar_versatilidade() from public, anon, authenticated;
