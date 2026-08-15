-- O backup semanal (banco + arquivos, zipado) tende a crescer com o tempo.
-- Sobe o limite do bucket 'backups' de 25MB pra 100MB por objeto.
update storage.buckets set file_size_limit = 104857600 where id = 'backups';
