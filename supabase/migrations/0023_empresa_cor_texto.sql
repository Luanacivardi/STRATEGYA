-- Cor da fonte usada sobre fundos escuros (topbar, cabeçalhos de tabela, lanes do mapa
-- estratégico etc.), configurável por empresa junto com cor primária/destaque e logo. Default
-- branco (comportamento atual, sem quebrar empresas já cadastradas).
alter table empresas add column cor_texto text not null default '#ffffff';
