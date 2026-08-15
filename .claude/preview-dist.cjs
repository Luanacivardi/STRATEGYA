// Servidor de verificação do BUILD: serve dist/ aplicando os cabeçalhos de dist/_headers,
// para conferir a Content-Security-Policy antes de publicar (o dev-server.cjs serve o código-fonte
// da raiz e sem cabeçalho nenhum, então não serve para esse teste).
//
//   node .claude/preview-dist.cjs   ->  http://localhost:5599
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const PORT = 5599;

const TIPOS = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// Lê o mesmo dist/_headers que o Cloudflare vai ler (só o bloco "/*", que é o único que usamos).
function cabecalhosDoArquivo() {
  const arquivo = path.join(DIST, '_headers');
  if (!fs.existsSync(arquivo)) return {};
  const extras = {};
  for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
    const m = linha.match(/^\s{2,}([A-Za-z-]+):\s*(.+)$/);
    if (m) extras[m[1]] = m[2].trim();
  }
  return extras;
}

const EXTRAS = cabecalhosDoArquivo();

http.createServer((req, res) => {
  let caminho = decodeURIComponent(req.url.split('?')[0]);
  if (caminho === '/') caminho = '/index.html';
  const arquivo = path.join(DIST, caminho);
  if (!arquivo.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  fs.readFile(arquivo, (err, dados) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', ...EXTRAS });
    res.end(dados);
  });
}).listen(PORT, () => console.log(`Build servido com cabecalhos em http://localhost:${PORT}`));
