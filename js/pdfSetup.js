// Carrega o pdf.js e publica em window.pdfjsLib (usado pelo visualizador em js/modules/documentos.js).
//
// Duas razões para existir este arquivo, em vez do <script> inline que ficava no index.html:
//   1) A Content-Security-Policy servida em dist/_headers proíbe script inline — que é justamente
//      o que impede um HTML injetado de executar código na página.
//   2) A versão 3.11.174 que estava em uso é anterior à correção da CVE-2024-4367: um PDF
//      malicioso (via fonte manipulada) executava JavaScript na origem do app, com a sessão de
//      quem abriu o documento. Como os PDFs vêm de upload dos próprios usuários, isso importa.
//      Da 4.x em diante a distribuição é ESM (.mjs), por isso o import abaixo em vez de <script>.
//
// A versão é fixada de propósito (nada de @latest): atualização de terceiro não entra em produção
// sem alguém revisar. Ao subir de versão, trocar nos dois lugares — biblioteca e worker.
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
window.pdfjsLib = pdfjsLib;
