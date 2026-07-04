export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export function toast(msg, tipo = 'info') {
  const box = document.getElementById('toast-box');
  const item = el(`<div class="toast toast-${tipo}">${msg}</div>`);
  box.appendChild(item);
  requestAnimationFrame(() => item.classList.add('show'));
  setTimeout(() => {
    item.classList.remove('show');
    setTimeout(() => item.remove(), 250);
  }, 3200);
}

export function abrirModal(titulo, conteudoHtml) {
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = '';
  const modal = el(`
    <div class="modal">
      <div class="modal-header">
        <h3>${titulo}</h3>
        <button class="modal-close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-body">${conteudoHtml}</div>
    </div>
  `);
  overlay.appendChild(modal);
  overlay.classList.add('open');
  modal.querySelector('.modal-close').addEventListener('click', fecharModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharModal(); }, { once: true });
  return modal;
}

export function fecharModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('open');
  overlay.innerHTML = '';
}

export async function confirmar(msg) {
  return window.confirm(msg);
}

// Garante que o valor é uma data real no formato YYYY-MM-DD (evita valores corrompidos
// que os inputs type="date" às vezes deixam passar, ex: "72026-06-02" ou "0026-05-10" —
// tecnicamente datas válidas, mas com ano implausível, o que quebra a ordenação cronológica)
export function dataValida(valor) {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [ano, mes, dia] = valor.split('-').map(Number);
  if (ano < 2000 || ano > 2100) return false;
  const d = new Date(valor + 'T00:00:00');
  return !Number.isNaN(d.getTime()) && d.getUTCFullYear() === ano && d.getUTCMonth() + 1 === mes && d.getUTCDate() === dia;
}

// Formata "YYYY-MM-DD" como "mmm/aaaa" (ex: "2026-05-10" -> "mai/2026"), usado nos rótulos do
// eixo do gráfico de resultados (o eixo só precisa indicar o mês/ano do período apurado).
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function formatarMesAno(periodo) {
  if (!periodo) return periodo;
  const [ano, mes] = periodo.split('-');
  const idx = Number(mes) - 1;
  if (!ano || idx < 0 || idx > 11) return periodo;
  return `${MESES_ABREV[idx]}/${ano}`;
}

// Formata um valor numérico com separador de milhar (padrão pt-BR: ponto), usado nos indicadores
// em Reais (meta e resultados apurados). Para outras unidades, mantém o valor como veio.
export function formatarValor(valor, unidade) {
  if (valor === null || valor === undefined || valor === '') return valor;
  const num = Number(valor);
  if (Number.isNaN(num)) return valor;
  if (unidade !== 'R$') return valor;
  return num.toLocaleString('pt-BR');
}

// Abre o cliente de e-mail padrão do usuário com um resumo em texto do que seria impresso.
// Sem um serviço de e-mail no backend não é possível anexar o PDF automaticamente — por isso
// o botão "Enviar por e-mail" sempre aparece ao lado do botão de imprimir (que gera o PDF via
// "Salvar como PDF" na própria caixa de impressão do navegador, para quem quiser anexar).
export function enviarPorEmail(assunto, corpoTexto) {
  const url = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpoTexto)}`;
  window.open(url, '_blank');
}

// Imprime um documento limpo e profissional (não a tela do app): substitui o conteúdo de
// #print-secao pelo HTML dado, mostra só o timbre + esse conteúdo durante a impressão
// (classe "imprimindo-secao" no body) e limpa tudo depois — usado por todos os botões de
// imprimir do sistema, para nunca gerar um "print de tela" cheio de menus/filtros/botões.
export function imprimirSecao(htmlConteudo) {
  const area = document.getElementById('print-secao');
  if (!area) return;
  area.innerHTML = htmlConteudo;
  document.body.classList.add('imprimindo-secao');
  window.print();
  const limpar = () => { document.body.classList.remove('imprimindo-secao'); area.innerHTML = ''; };
  window.addEventListener('afterprint', limpar, { once: true });
  setTimeout(limpar, 60000);
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
