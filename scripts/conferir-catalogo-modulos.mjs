// Confere se os literais de modulo/submodulo do JS batem com o catalogo gravado no banco.
//
// Por que existe: js/modulosConfig.js avisa no proprio comentario que nao ha sincronizacao
// automatica entre os literais do JS, o catalogo (catalogo_modulos_submodulos) e as politicas
// RLS. Um literal digitado errado num dos lados nao quebra nada visivelmente — so faz uma
// permissao parar de valer, em silencio, e a pessoa perde acesso sem ninguem entender por que.
// Este script transforma esse erro silencioso em falha de build.
//
// Nao precisa de segredo: a policy catalogo_modulos_submodulos_select libera SELECT para o papel
// public, entao a chave publicavel do config.js basta.
//
// Uso: node scripts/conferir-catalogo-modulos.mjs
// Sai com codigo 1 se houver divergencia.

import { MODULOS_SISTEMA } from '../js/modulosConfig.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../js/config.js';

const chave = (modulo, submodulo) => `${modulo}${submodulo ? ' > ' + submodulo : ''}`;

// Modulos com "configuravel: false" ficam de fora da matriz de permissoes por definicao, entao
// tambem nao devem estar no catalogo (hoje: os 4 modulos "em elaboracao").
function esperadoPeloJs() {
  const esperado = new Set();
  for (const m of MODULOS_SISTEMA) {
    if (m.configuravel === false) continue;
    esperado.add(chave(m.id, null));
    for (const s of m.submodulos || []) esperado.add(chave(m.id, s.id));
  }
  return esperado;
}

async function noBanco() {
  const url = `${SUPABASE_URL}/rest/v1/catalogo_modulos_submodulos?select=modulo,submodulo`;
  const resp = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!resp.ok) {
    throw new Error(`Nao consegui ler o catalogo (HTTP ${resp.status}): ${await resp.text()}`);
  }
  const linhas = await resp.json();
  if (!Array.isArray(linhas) || linhas.length === 0) {
    throw new Error('O catalogo voltou vazio — isso nunca deveria acontecer.');
  }
  return new Set(linhas.map((l) => chave(l.modulo, l.submodulo)));
}

const js = esperadoPeloJs();
const banco = await noBanco();

const soNoJs = [...js].filter((k) => !banco.has(k)).sort();
const soNoBanco = [...banco].filter((k) => !js.has(k)).sort();

// process.exit() NAO e usado aqui de proposito. Chamar exit com a conexao do fetch ainda aberta
// derruba o Node no Windows com "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" e devolve
// codigo 127 — ou seja, o script imprimia "OK" e mesmo assim reprovava o build. Definindo apenas
// process.exitCode, o Node encerra sozinho depois de fechar a conexao, com o codigo certo.
if (soNoJs.length === 0 && soNoBanco.length === 0) {
  console.log(`OK: ${js.size} literais de modulo/submodulo conferem entre o JS e o banco.`);
} else {

  console.error('DIVERGENCIA entre js/modulosConfig.js e catalogo_modulos_submodulos:\n');
  if (soNoJs.length) {
    console.error('  Existe no JS e falta no banco (a permissao nao vai valer):');
    for (const k of soNoJs) console.error(`    - ${k}`);
    console.error('    -> criar a linha no catalogo, via migracao.\n');
  }
  if (soNoBanco.length) {
    console.error('  Existe no banco e falta no JS (orfao — ninguem consegue configurar):');
    for (const k of soNoBanco) console.error(`    - ${k}`);
    console.error('    -> ou o literal do JS foi renomeado, ou a linha do catalogo ficou para tras.\n');
  }
  process.exitCode = 1;
}
