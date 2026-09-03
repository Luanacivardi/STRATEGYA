// Confere que todo modulo referenciado pelo carregador sob demanda existe e expoe render().
//
// Por que existe: ao trocar os imports estaticos do app.js por import() sob demanda, perdemos uma
// protecao. Antes, um caminho errado quebrava o app inteiro na hora, para todo mundo — impossivel
// nao notar. Agora um nome errado em TABS_PLANEJAMENTO ou MODULOS_SIMPLES so falha quando alguem
// clica naquele modulo especifico, e possivelmente so na maquina de um cliente. Este script
// devolve essa falha para o momento do build.
//
// Nao importa os modulos de verdade: eles dependem de `window` (js/supabaseClient.js), que nao
// existe no Node. A conferencia e do contrato — o arquivo existe e exporta render — que e
// exatamente o que o carregador espera encontrar.
//
// Uso: node scripts/conferir-modulos-carregaveis.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const appJs = readFileSync(join(RAIZ, 'js', 'app.js'), 'utf8');

// Extrai os valores (nomes de arquivo) de um mapa literal do app.js.
function nomesDoMapa(nomeDoMapa) {
  const m = appJs.match(new RegExp(`const ${nomeDoMapa}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!m) {
    console.error(`ERRO: nao encontrei o mapa ${nomeDoMapa} em js/app.js.`);
    console.error('Se ele foi renomeado ou reformatado, este script precisa acompanhar —');
    console.error('falhar aqui e melhor do que passar sem conferir nada.');
    process.exit(1);
  }
  return [...m[1].matchAll(/:\s*'([^']+)'/g)].map((x) => x[1]);
}

const alvos = [
  ...nomesDoMapa('TABS_PLANEJAMENTO').map((n) => ({ arquivo: n, origem: 'TABS_PLANEJAMENTO' })),
  ...nomesDoMapa('MODULOS_SIMPLES').map((n) => ({ arquivo: n, origem: 'MODULOS_SIMPLES' })),
];

if (alvos.length === 0) {
  console.error('ERRO: os mapas existem mas vieram vazios — a extracao quebrou.');
  process.exit(1);
}

const problemas = [];
for (const { arquivo, origem } of alvos) {
  const caminho = join(RAIZ, 'js', 'modules', `${arquivo}.js`);
  if (!existsSync(caminho)) {
    problemas.push(`${origem} aponta para '${arquivo}', mas js/modules/${arquivo}.js nao existe`);
    continue;
  }
  const fonte = readFileSync(caminho, 'utf8');
  if (!/^export\s+(async\s+)?function\s+render\b/m.test(fonte)) {
    problemas.push(`js/modules/${arquivo}.js existe, mas nao exporta render() — o carregador espera render(container, state)`);
  }
}

if (problemas.length === 0) {
  console.log(`OK: os ${alvos.length} modulos sob demanda existem e expoem render().`);
} else {
  console.error('MODULOS SOB DEMANDA COM PROBLEMA:\n');
  for (const p of problemas) console.error(`  - ${p}`);
  console.error('\nIsto so apareceria em producao quando alguem clicasse no modulo. Corrija antes de publicar.');
  process.exitCode = 1;
}
