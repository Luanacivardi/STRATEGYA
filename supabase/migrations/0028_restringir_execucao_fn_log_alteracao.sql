-- fn_log_alteracao só deve rodar disparada pelos triggers (contexto de linha OLD/NEW), nunca
-- chamada direto via RPC pelo client.
revoke execute on function fn_log_alteracao() from anon, authenticated;
