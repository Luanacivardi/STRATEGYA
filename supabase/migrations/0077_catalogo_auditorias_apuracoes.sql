-- Auditorias e Apurações deixam de ser "configuravel:false" (regra fixa hardcoded) e passam a
-- entrar na matriz de permissões, como os demais módulos — pedido explícito do usuário após a
-- revisão geral do app. Isso também é a correção de raiz para o achado do advisor
-- "multiple_permissive_policies" nessas 22 tabelas (políticas antigas usavam "for all" cobrindo
-- select+write ao mesmo tempo, sobrepondo a policy de select dedicada — a Fase seguinte recria tudo
-- já separado em select/insert/update/delete, eliminando a sobreposição).
--
-- Auditorias ganha 5 submódulos (mesmas abas já existentes na tela: auditorias, processos, turnos,
-- auditores, relatorios). Apurações continua com o comitê como porta de entrada obrigatória (só
-- ORBEEX é automático; Admin/Gestor/Usuário só entram sendo membro ativo do comitê) — o que muda é
-- que, uma vez membro, o nível dentro do comitê (Visualização ou Edição Total) passa a ser
-- configurável na mesma matriz de permissões, em vez de todo membro ganhar edição total automática.

update catalogo_modulos_submodulos set configuravel = true where modulo in ('auditorias', 'apuracoes');

insert into catalogo_modulos_submodulos (modulo, submodulo, configuravel, ordem) values
  ('auditorias', 'auditorias', true, 1),
  ('auditorias', 'processos', true, 2),
  ('auditorias', 'turnos', true, 3),
  ('auditorias', 'auditores', true, 4),
  ('auditorias', 'relatorios', true, 5);
