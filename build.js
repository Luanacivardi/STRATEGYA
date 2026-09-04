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

function copiarRecursivo(origem, destino, { ofuscarJs = false, v } = {}) {
  const stat = fs.statSync(origem);
  if (stat.isDirectory()) {
    fs.mkdirSync(destino, { recursive: true });
    for (const nome of fs.readdirSync(origem)) {
      copiarRecursivo(path.join(origem, nome), path.join(destino, nome), { ofuscarJs, v });
    }
    return;
  }
  if (ofuscarJs && origem.endsWith('.js')) {
    const codigoOriginal = fs.readFileSync(origem, 'utf8');
    const ofuscado = JavaScriptObfuscator.obfuscate(codigoOriginal, OBFUSCATOR_OPTIONS).getObfuscatedCode();
    fs.writeFileSync(destino, COPYRIGHT_BANNER + aplicarCacheBustingImportsJs(ofuscado, v), 'utf8');
  } else {
    fs.copyFileSync(origem, destino);
  }
}

// Cache-busting dos imports estaticos ENTRE modulos (ex: dashboard.js importando de
// objetivos.js): sem isso, so o modulo pedido via import() dinamico (carregarModulo() em
// app.js) ganhava "?v=", porque a marca vem do proprio endereco da requisicao dinamica
// (import.meta.url + VERSAO_ASSETS). Um `import {x} from './objetivos.js'` ESTATICO dentro de
// outro modulo resolve como endereco literal, sem query — e o navegador podia continuar servindo
// esse arquivo do cache antigo mesmo depois do deploy, quebrando com "does not provide an export
// named X" sempre que uma dependencia ganhava uma exportacao nova (bug real, visto em producao em
// 04/09/2026: dashboard.js importou progressoObjetivo de objetivos.js, e quem tinha objetivos.js
// em cache continuou vendo a versao sem essa funcao). Aplicado depois da ofuscacao porque o
// javascript-obfuscator preserva os specifiers de import/export como estao (nao os move para o
// vetor de strings), entao o texto ainda e' facil de casar por regex.
function aplicarCacheBustingImportsJs(codigo, v) {
  const comQuery = (aspas, caminho) => `${aspas}${caminho}?v=${v}${aspas}`;
  return codigo
    .replace(/from(\s*)(['"])(\.\.?\/[^'"?]+\.js)\2/g, (m, espaco, aspas, caminho) => `from${espaco}${comQuery(aspas, caminho)}`)
    .replace(/import(\s*)\((\s*)(['"])(\.\.?\/[^'"?]+\.js)\3(\s*)\)/g, (m, e1, e2, aspas, caminho, e3) => `import${e1}(${e2}${comQuery(aspas, caminho)}${e3})`);
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
function aplicarCacheBusting(html, v) {
  return html
    .replace('href="css/style.css"', `href="css/style.css?v=${v}"`)
    .replace('src="js/pdfSetup.js"', `src="js/pdfSetup.js?v=${v}"`)
    .replace('src="js/app.js"', `src="js/app.js?v=${v}"`);
}

// Carimbo do que foi publicado, gravado em dist/versao.json.
//
// Por que existe: em 02/09/2026 descobrimos que o Worker do Cloudflare estava servindo o commit
// 7a30c26 (17/08) enquanto o GitHub Pages ja servia o 1cd8903 (21/08) — onze dias de diferenca,
// sem ninguem perceber, porque nao havia como perguntar a um deploy "qual versao voce e?".
// A comparacao so foi possivel garimpando nome de coluna dentro do bundle ofuscado.
// Com este arquivo, um `curl <endereco>/versao.json` responde na hora, e o monitor de
// disponibilidade pode conferir se os dois deploys estao no mesmo commit.
function gravarVersao() {
  const env = process.env;
  let commit = env.GITHUB_SHA || env.WORKERS_CI_COMMIT_SHA || env.CF_PAGES_COMMIT_SHA || null;
  if (!commit) {
    try {
      commit = require('child_process').execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString().trim();
    } catch { /* fora de um clone git (ex.: tarball) — segue sem o commit */ }
  }
  const versao = { commit: commit ? commit.slice(0, 7) : 'desconhecido', build: BUILD_ID };
  fs.writeFileSync(path.join(DIST, 'versao.json'), JSON.stringify(versao, null, 2), 'utf8');
  return versao;
}

function main() {
  const v = Date.now(); // um unico carimbo de versao para o HTML e para os imports entre modulos JS deste build
  limparDist();
  copiarRecursivo(path.join(ROOT, 'js'), path.join(DIST, 'js'), { ofuscarJs: true, v });
  copiarRecursivo(path.join(ROOT, 'css'), path.join(DIST, 'css'));
  copiarRecursivo(path.join(ROOT, 'img'), path.join(DIST, 'img'));  // favicon, apple-touch-icon e cartao de compartilhamento
  const htmlOriginal = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  fs.writeFileSync(path.join(DIST, 'index.html'), aplicarCacheBusting(htmlOriginal, v), 'utf8');
  copiarSeExistir('CNAME');                  // inofensivo no Cloudflare; util enquanto o GH Pages coexiste
  copiarSeExistir('_headers');               // cabecalhos de seguranca (CSP etc) — lido pelo Cloudflare
  copiarSeExistir('manifest.json');           // nome e icones ao salvar na tela de inicio do celular
  const versao = gravarVersao();              // dist/versao.json — "qual commit este deploy esta servindo?"

  // Relatorio de tamanho: se o bundle inflar de novo, aparece aqui no log do build.
  let bytes = 0;
  (function medir(dir) {
    for (const nome of fs.readdirSync(dir)) {
      const p = path.join(dir, nome);
      const s = fs.statSync(p);
      s.isDirectory() ? medir(p) : (bytes += s.size);
    }
  })(DIST);
  console.log(`Build concluido em dist/ (${BUILD_ID}) — ${(bytes / 1024).toFixed(0)} KB — commit ${versao.commit}`);
}

main();
