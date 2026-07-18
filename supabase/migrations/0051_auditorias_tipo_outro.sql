-- Auditorias: adiciona o tipo "Outro" com descrição livre, para casos que não se encaixam nas
-- categorias fixas (interna/externa/cliente/fornecedor/certificação/manutenção/recertificação/extraordinária).

alter table auditorias drop constraint auditorias_tipo_check;
alter table auditorias add constraint auditorias_tipo_check
  check (tipo in ('interna', 'externa', 'cliente', 'fornecedor', 'certificacao', 'manutencao', 'recertificacao', 'extraordinaria', 'outro'));

alter table auditorias add column tipo_outro_descricao text;
comment on column auditorias.tipo_outro_descricao is 'Descrição livre do tipo de auditoria, preenchida apenas quando tipo = ''outro''.';
