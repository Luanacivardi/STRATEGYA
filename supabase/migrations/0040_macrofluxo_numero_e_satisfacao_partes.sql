-- Macrofluxo: cada processo ganha um número/código, que futuramente será usado para vincular
-- documentos a ele na aba Documentos (ainda não implementada — este campo só prepara o terreno).
alter table macrofluxo_processos add column numero text;

-- Partes Interessadas: separa "necessidades" (o que a parte espera) de "satisfação" (como está
-- sendo percebida/avaliada hoje), em vez de um único campo genérico.
alter table partes_interessadas add column satisfacao text;
