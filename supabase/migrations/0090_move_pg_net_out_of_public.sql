-- O linter de segurança do Supabase reclama de extensões instaladas no
-- schema public. pg_net não aceita "alter extension set schema", então
-- reinstala no schema extensions (os objetos net.http_post etc. continuam
-- no schema net de sempre, isso só move o registro da extensão).
drop extension if exists pg_net;
create extension pg_net with schema extensions;
