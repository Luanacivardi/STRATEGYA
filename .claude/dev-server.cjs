const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 5500;

const TIPOS = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  let caminho = decodeURIComponent(req.url.split('?')[0]);
  if (caminho === '/') caminho = '/index.html';
  const arquivo = path.join(ROOT, caminho);
  if (!arquivo.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(arquivo, (err, dados) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(arquivo);
    res.writeHead(200, { 'Content-Type': TIPOS[ext] || 'application/octet-stream' });
    res.end(dados);
  });
}).listen(PORT, () => console.log(`Servindo em http://localhost:${PORT}`));
