// Gera a pasta dist/ com o app pronto para publicacao.
//
// Ofuscacao LEVE: renomeacao de identificadores + stringArray, para dificultar que um cliente
// pagante copie a logica a partir do bundle servido.
//
// ATENCAO — este comentario dizia que "o repositorio e privado", e isso esta ERRADO: em
// 02/09/2026 a API do GitHub confirma "private": false. Ou seja, o fonte legivel esta publico
// ao lado do bundle ofuscado, e a ofuscacao hoje nao protege nada — so custa bytes, tempo de
// build e a legibilidade de qualquer erro que venha de producao (relevante ao ligar o Sentry:
// sem source maps as pilhas chegam como "erro na funcao a(), linha 1").
// Decisao pendente: ou o repositorio fecha e a ofuscacao passa a fazer sentido, ou ela sai.
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

// Cache-busting dos assets locais (css/style.css, js/app.js, js/pdfSetup.js): sem isso, o
// Cloudflare/navegador do usuario pode continuar servindo a versao antiga em cache por horas
// depois de um deploy, mesmo com o index.html novo (os links dos CDNs ja tem versao+integrity
// fixas no proprio nome, entao ficam de fora). "?v=<timestamp do build>" forca um recurso "novo"
// a cada deploy, sem precisar mexer em configuracao de cache do Cloudflare.
function aplicarCacheBusting(html) {
  const v = Date.now();
  return html
    .replace('href="css/style.css"', `href="css/style.css?v=${v}"`)
    .replace('src="js/pdfSetup.js"', `src="js/pdfSetup.js?v=${v}"`)
    .replace('src="js/app.js"', `src="js/app.js?v=${v}"`);
}

function main() {
  limparDist();
  copiarRecursivo(path.join(ROOT, 'js'), path.join(DIST, 'js'), { ofuscarJs: true });
  copiarRecursivo(path.join(ROOT, 'css'), path.join(DIST, 'css'));
  copiarRecursivo(path.join(ROOT, 'img'), path.join(DIST, 'img'));  // favicon, apple-touch-icon e cartao de compartilhamento
  const htmlOriginal = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  fs.writeFileSync(path.join(DIST, 'index.html'), aplicarCacheBusting(htmlOriginal), 'utf8');
  copiarSeExistir('CNAME');                  // inofensivo no Cloudflare; util enquanto o GH Pages coexiste
  copiarSeExistir('_headers');               // cabecalhos de seguranca (CSP etc) — lido pelo Cloudflare
  copiarSeExistir('manifest.json');           // nome e icones ao salvar na tela de inicio do celular

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
