// Gera a pasta dist/ com o app pronto para publicacao: JS ofuscado (js-obfuscator) e um
// aviso de copyright/fingerprint no topo de cada arquivo. index.html, css/ e supabase/ sao
// copiados como estao (nao ha logica de negocio sensivel neles).
//
// Uso: npm run build  ->  gera dist/
'use strict';
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const BUILD_ID = new Date().toISOString();

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: true,
  shuffleStringArray: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.85,
  transformObjectKeys: false, // preserva chaves usadas em selects/colunas do Supabase
  unicodeEscapeSequence: false,
};

const COPYRIGHT_BANNER = `/*!
 * STRATEGYA - by ORBEEX. Todos os direitos reservados.
 * Software proprietario. Copia, engenharia reversa ou redistribuicao nao autorizadas sao proibidas.
 * Build: ${BUILD_ID}
 */\n`;

function limparDist() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
}

function copiarRecursivo(origem, destino, { ofuscarJs = false } = {}) {
  const stat = fs.statSync(origem);
  if (stat.isDirectory()) {
    fs.mkdirSync(destino, { recursive: true });
    for (const nome of fs.readdirSync(origem)) {
      copiarRecursivo(path.join(origem, nome), path.join(destino, nome), { ofuscarJs });
    }
    return;
  }
  if (ofuscarJs && origem.endsWith('.js')) {
    const codigoOriginal = fs.readFileSync(origem, 'utf8');
    const ofuscado = JavaScriptObfuscator.obfuscate(codigoOriginal, OBFUSCATOR_OPTIONS).getObfuscatedCode();
    fs.writeFileSync(destino, COPYRIGHT_BANNER + ofuscado, 'utf8');
  } else {
    fs.copyFileSync(origem, destino);
  }
}

function main() {
  limparDist();
  copiarRecursivo(path.join(ROOT, 'js'), path.join(DIST, 'js'), { ofuscarJs: true });
  copiarRecursivo(path.join(ROOT, 'css'), path.join(DIST, 'css'));
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(DIST, 'index.html'));
  fs.copyFileSync(path.join(ROOT, 'CNAME'), path.join(DIST, 'CNAME'));
  if (fs.existsSync(path.join(ROOT, 'manifest.json'))) fs.copyFileSync(path.join(ROOT, 'manifest.json'), path.join(DIST, 'manifest.json'));
  if (fs.existsSync(path.join(ROOT, 'icons'))) copiarRecursivo(path.join(ROOT, 'icons'), path.join(DIST, 'icons'));
  if (fs.existsSync(path.join(ROOT, 'sw.js'))) fs.copyFileSync(path.join(ROOT, 'sw.js'), path.join(DIST, 'sw.js'));
  if (fs.existsSync(path.join(ROOT, 'redefinir-senha.html'))) fs.copyFileSync(path.join(ROOT, 'redefinir-senha.html'), path.join(DIST, 'redefinir-senha.html'));
  console.log(`Build concluido em dist/ (${BUILD_ID})`);
}

main();
