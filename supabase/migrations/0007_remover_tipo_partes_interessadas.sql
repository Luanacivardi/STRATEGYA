-- O campo "tipo" era preenchido de forma redundante com o próprio nome da parte interessada
-- (ex: nome "CLIENTE" e tipo "CLIENTE"), então foi removido a pedido do usuário.
alter table partes_interessadas drop column tipo;
