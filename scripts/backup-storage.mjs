// Baixa TODOS os arquivos de TODOS os buckets do Supabase Storage.
//
// Por que este script existe: o backup nativo do Supabase (mesmo no plano Pro)
// cobre apenas o banco de dados. Os arquivos do Storage — PDFs de procedimentos
// aprovados, evidencias de auditoria, anexos — NAO sao copiados por ele.
// Sem este passo, um incidente devolveria um SGQ com todos os registros
// apontando para arquivos que nao existem mais.
//
// Uso: node scripts/backup-storage.mjs <pasta-destino>
// Precisa das variaveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.

import fs from 'node:fs/promises';
import path from 'node:path';

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, '');
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DESTINO = process.argv[2] || 'backup/arquivos';

if (!URL_BASE || !CHAVE) {
  console.error('ERRO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const cabecalhos = {
  apikey: CHAVE,
  Authorization: `Bearer ${CHAVE}`,
};

async function listarBuckets() {
  const r = await fetch(`${URL_BASE}/storage/v1/bucket`, { headers: cabecalhos });
  if (!r.ok) throw new Error(`Falha ao listar buckets: ${r.status} ${await r.text()}`);
  return r.json();
}

// A API lista um nivel por vez. Pastas vem com id === null, entao descemos nelas.
async function listarObjetos(bucket, prefixo = '') {
  const encontrados = [];
  let deslocamento = 0;
  const PAGINA = 100;

  for (;;) {
    const r = await fetch(`${URL_BASE}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { ...cabecalhos, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prefix: prefixo,
        limit: PAGINA,
        offset: deslocamento,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });
    if (!r.ok) throw new Error(`Falha ao listar ${bucket}/${prefixo}: ${r.status}`);

    const itens = await r.json();
    if (!itens.length) break;

    for (const item of itens) {
      const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
      if (item.id === null) {
        encontrados.push(...(await listarObjetos(bucket, caminho))); // e uma pasta
      } else {
        encontrados.push(caminho);
      }
    }

    if (itens.length < PAGINA) break;
    deslocamento += PAGINA;
  }
  return encontrados;
}

async function baixar(bucket, caminho, destino) {
  const url = `${URL_BASE}/storage/v1/object/${bucket}/${caminho
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  const r = await fetch(url, { headers: cabecalhos });
  if (!r.ok) throw new Error(`Falha ao baixar ${bucket}/${caminho}: ${r.status}`);

  const arquivo = path.join(destino, bucket, caminho);
  await fs.mkdir(path.dirname(arquivo), { recursive: true });
  await fs.writeFile(arquivo, Buffer.from(await r.arrayBuffer()));
  return (await fs.stat(arquivo)).size;
}

async function main() {
  await fs.mkdir(DESTINO, { recursive: true });

  const buckets = await listarBuckets();
  console.log(`Buckets encontrados: ${buckets.length}\n`);

  let totalArquivos = 0;
  let totalBytes = 0;
  const falhas = [];
  const relatorio = [];

  for (const bucket of buckets) {
    const objetos = await listarObjetos(bucket.id);
    console.log(`${bucket.id} — ${objetos.length} arquivo(s)`);

    let bytesBucket = 0;
    for (const caminho of objetos) {
      try {
        bytesBucket += await baixar(bucket.id, caminho, DESTINO);
        totalArquivos++;
      } catch (e) {
        console.error(`  FALHA: ${caminho} — ${e.message}`);
        falhas.push(`${bucket.id}/${caminho}`);
      }
    }
    totalBytes += bytesBucket;
    relatorio.push({
      bucket: bucket.id,
      publico: bucket.public,
      arquivos: objetos.length,
      bytes: bytesBucket,
    });
  }

  await fs.writeFile(
    path.join(DESTINO, '_inventario.json'),
    JSON.stringify(
      { gerado_em: new Date().toISOString(), total_arquivos: totalArquivos, total_bytes: totalBytes, buckets: relatorio, falhas },
      null,
      2,
    ),
  );

  console.log(`\n${totalArquivos} arquivo(s), ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

  if (falhas.length) {
    console.error(`\nERRO: ${falhas.length} arquivo(s) nao foram baixados.`);
    process.exit(1); // backup incompleto e um backup em que nao se pode confiar
  }
  console.log('Backup dos arquivos concluido sem falhas.');
}

main().catch((e) => {
  console.error('ERRO FATAL:', e.message);
  process.exit(1);
});
