// Impressão/PDF de documentos LEGADOS (sem arquivo anexado, só com o conteúdo digitado nas
// seções antigas do sistema). Documentos criados a partir da introdução do upload de arquivo
// (ver documentos.js) usam o botão "Abrir Arquivo" em vez desta geração de HTML — este módulo
// existe só para não perder a função de impressão dos documentos antigos já cadastrados.
// Separado de documentos.js por tamanho de arquivo (mantém os dois módulos menores).
import { escapeHtml, imprimirSecao } from '../ui.js';

const STATUS = {
  elaboracao: 'Elaboração',
  revisao: 'Revisão',
  aprovacao: 'Aguardando Aprovação',
  publicado: 'Publicado',
  obsoleto: 'Obsoleto',
};

const CLASSIFICACAO = {
  publico: 'Público',
  confidencial: 'Confidencial',
  restrito: 'Restrito',
};

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function gerarCabecalhoDocumento(doc, emp) {
  const controlada = !!doc.copia_controlada;
  return (
    '<div class="doc-header">'
    + '<div class="doc-header-logo">' + (emp && emp.logo_url ? ('<img src="' + emp.logo_url + '" alt="">') : ('<span>' + escapeHtml(emp ? emp.nome : '') + '</span>')) + '</div>'
    + '<div class="doc-header-titulo">' + escapeHtml(doc.tipos_documento.nome.toUpperCase()) + ' — ' + escapeHtml(doc.nome.toUpperCase()) + '</div>'
    + '<div class="doc-header-codigo">'
    + '<div class="doc-header-numero">' + escapeHtml(doc.numero) + '</div>'
    + '<div class="doc-header-copia">' + (controlada ? 'CÓPIA CONTROLADA' : 'CÓPIA NÃO CONTROLADA') + '</div>'
    + '</div></div>'
  );
}

function gerarRodapeDocumento(doc, emp) {
  return (
    '<div class="doc-footer">'
    + '<b class="codigo">' + escapeHtml(doc.numero) + ' — ' + escapeHtml(doc.nome) + '</b>'
    + ' <span class="sep">|</span> Revisão: ' + String(doc.revisao_atual).padStart(2, '0')
    + ' <span class="sep">|</span> <b class="empresa">' + escapeHtml(emp ? emp.nome : '') + '</b>'
    + ' <span class="sep">|</span> Documento: <b class="classificacao">' + CLASSIFICACAO[doc.classificacao] + '</b>'
    + ' <span class="sep">|</span> Emitido em ' + new Date().toLocaleDateString('pt-BR')
    + '</div>'
  );
}

function gerarCorpoDocumento(doc, revisoes, ctx) {
  const { nomeUsuario } = ctx;
  const secoes = doc.tipos_documento.secoes || [];
  const rascunho = doc.status !== 'publicado';
  const statusTexto = STATUS[doc.status] || '';

  const blocoAviso = rascunho ? ('<p class="doc-aviso-rascunho">Documento em ' + statusTexto.toLowerCase() + ' — esta impressão não é a versão publicada vigente.</p>') : '';

  const blocoSecoes = secoes.map((s, idx) => {
    const titulo = '<p class="doc-secao-titulo">' + (idx + 1) + '. ' + escapeHtml(s.toUpperCase()) + '</p>';
    const texto = '<p class="doc-secao-texto">' + escapeHtml((doc.conteudo || {})[s] || '—').replaceAll('\n', '<br>') + '</p>';
    return titulo + texto;
  }).join('');

  const linhaAprovado = doc.status === 'publicado'
    ? (escapeHtml(nomeUsuario(doc.aprovado_por)) + ' em ' + formatarData(doc.data_publicacao))
    : '—';

  const linhasRevisoes = (revisoes || []).length
    ? revisoes.map((r) => '<tr><td>' + String(r.numero_revisao).padStart(2, '0') + '</td><td>' + formatarData(r.data) + '</td><td>' + escapeHtml(r.descricao_alteracao) + '</td></tr>').join('')
    : '<tr><td colspan="3">Nenhuma revisão publicada ainda.</td></tr>';

  return (
    blocoAviso
    + blocoSecoes
    + '<table class="doc-elaboracao-tabela"><tr><th>Elaborado por</th><th>Aprovado por</th></tr>'
    + '<tr><td>' + escapeHtml(nomeUsuario(doc.elaborado_por)) + '</td><td>' + linhaAprovado + '</td></tr></table>'
    + '<p class="doc-secao-titulo" style="margin-top:18px">HISTÓRICO DE REVISÕES</p>'
    + '<table class="doc-revisoes-tabela"><tr><th>Revisão</th><th>Data</th><th>Descrição</th></tr>' + linhasRevisoes + '</table>'
  );
}

export function imprimirDocumentoLegado(state, doc, revisoes, ctx) {
  const emp = state.empresaAtual;
  document.body.classList.add('imprimindo-documento');
  const limparClasse = () => document.body.classList.remove('imprimindo-documento');
  window.addEventListener('afterprint', limparClasse, { once: true });
  setTimeout(limparClasse, 60000);
  const html = gerarCabecalhoDocumento(doc, emp) + gerarRodapeDocumento(doc, emp) + '<div class="doc-corpo">' + gerarCorpoDocumento(doc, revisoes, ctx) + '</div>';
  imprimirSecao(html);
}

export function visualizarPdfDocumentoLegado(state, doc, revisoes, ctx) {
  const emp = state.empresaAtual;
  const corpo = gerarCorpoDocumento(doc, revisoes, ctx);
  const janela = window.open('', '_blank');
  if (!janela) return false;

  const estilo = [
    'body { font-family: Arial, Helvetica, sans-serif; color: #222; margin: 0; padding: 90px 36px 60px; position: relative; }',
    '.doc-header { position: fixed; top: 0; left: 0; right: 0; display: flex; align-items: stretch; border: 1.5px solid #000; height: 68px; background: #fff; z-index: 10; }',
    '.doc-header-logo { flex: 0 0 150px; display: flex; align-items: center; justify-content: center; border-right: 1.5px solid #000; padding: 6px; overflow: hidden; }',
    '.doc-header-logo img { max-height: 50px; max-width: 130px; object-fit: contain; }',
    '.doc-header-logo span { font-weight: 700; font-size: 13px; text-align: center; }',
    '.doc-header-titulo { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 15px; font-weight: 800; padding: 4px 12px; border-right: 1.5px solid #000; }',
    '.doc-header-codigo { flex: 0 0 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; }',
    '.doc-header-numero { font-size: 21px; font-weight: 800; }',
    '.doc-header-copia { font-size: 10px; font-weight: 700; letter-spacing: 0.5px; color: #c00000; text-transform: uppercase; }',
    '.doc-footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 10px; padding: 6px 10px; border-top: 1px solid #999; background: #fff; z-index: 10; }',
    '.doc-footer b.codigo, .doc-footer b.empresa, .doc-footer b.classificacao { color: #c00000; }',
    '.doc-footer .sep { color: #2f5496; font-weight: 700; }',
    '.doc-aviso-rascunho { background: #fff3cd; border: 1px solid #e8b84b; border-radius: 6px; padding: 8px 12px; font-size: 12px; font-weight: 700; margin-bottom: 14px; }',
    '.doc-secao-titulo { font-size: 13.5px; font-weight: 800; text-transform: uppercase; margin: 16px 0 4px; }',
    '.doc-secao-texto { font-size: 12.5px; line-height: 1.5; margin: 0 0 4px; white-space: pre-wrap; }',
    'table.doc-elaboracao-tabela, table.doc-revisoes-tabela { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }',
    'table.doc-elaboracao-tabela th, table.doc-elaboracao-tabela td, table.doc-revisoes-tabela th, table.doc-revisoes-tabela td { border: 1px solid #999; padding: 6px 10px; text-align: left; }',
    'table.doc-elaboracao-tabela th, table.doc-revisoes-tabela th { background: #666; color: #fff; font-weight: 700; }',
    '.toolbar { position: fixed; top: 76px; right: 20px; z-index: 20; }',
    '.toolbar button { padding: 8px 16px; font-size: 13px; cursor: pointer; }',
    '@media print { .toolbar { display: none; } body { padding-top: 78px; } }',
  ].join('\n');

  const paginaHtml = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">'
    + '<title>' + escapeHtml(doc.numero) + ' — ' + escapeHtml(doc.nome) + '</title>'
    + '<style>' + estilo + '</style></head><body>'
    + '<div class="toolbar"><button type="button" onclick="window.print()">Imprimir / Salvar como PDF</button></div>'
    + gerarCabecalhoDocumento(doc, emp)
    + gerarRodapeDocumento(doc, emp)
    + '<div class="doc-corpo">' + corpo + '</div>'
    + '</body></html>';

  janela.document.write(paginaHtml);
  janela.document.close();
  return true;
}
