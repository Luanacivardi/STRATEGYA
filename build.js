// Gera a pasta dist/ com o app pronto para publicacao.
//
// Ofuscacao LEVE: o repositorio e privado, entao o objetivo aqui nao e mais esconder
// o codigo do mundo — e apenas dificultar que um cliente pagante copie a logica a partir
// do bundle servido. Renomeacao de identificadores + stringArray entregam a maior parte
// dessa dissuasao a custo quase zero.
//
// Removidos deliberadamente (mediram 2,93x de inflacao no bundle, 740 KB -> 2168 KB):
//   controlFlowFlattening  - principal responsavel pelo tamanho e pela lentidao de execucao
//   deadCodeInjection      - injeta codigo morto so para confundir; puro peso
//   selfDefending          - quebra qualquer tentativa de depurar producao
//   splitStrings           - fragmenta strings, inflando sem ganho relevante
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
  simplify: true,
  identifierNamesGenerator: 'mangled',
  renameGlobals: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  rotateStringArray: true,
  shuffleStringArray: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  splitStrings: false,
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

function copiarSeExistir(nome) {
  const origem = path.join(ROOT, nome);
  if (fs.existsSync(origem)) fs.copyFileSync(origem, path.join(DIST, nome));
}

function main() {
  limparDist();
  copiarRecursivo(path.join(ROOT, 'js'), path.join(DIST, 'js'), { ofuscarJs: true });
  copiarRecursivo(path.join(ROOT, 'css'), path.join(DIST, 'css'));
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(DIST, 'index.html'));
  copiarSeExistir('CNAME');            // inofensivo no Cloudflare; util enquanto o GH Pages coexiste
  copiarSeExistir('manifest.json');
  copiarSeExistir('sw.js');
  copiarSeExistir('redefinir-senha.html');
  if (fs.existsSync(path.join(ROOT, 'icons'))) {
    copiarRecursivo(path.join(ROOT, 'icons'), path.join(DIST, 'icons'));
  }

  // Relatorio de tamanho: se o bundle inflar de novo, aparece aqui no log do build.
  let bytes = 0;
  (function medir(dir) {
    for (const nome of fs.readdirSync(dir)) {
      const p = path.join(dir, nome);
      const s = fs.statSync(p);
      s.isDirectory() ? medir(p) : (bytes += s.size);
    }
  })(DIST);
  console.log(`Build concluido em dist/ (${BUILD_ID}) — ${(bytes / 1024).toFixed(0)} KB`);
}

main();
