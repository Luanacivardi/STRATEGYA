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

// Formata "YYYY-MM-DD" (ou qualquer ISO) como "dd/mm/aaaa" (pt-BR).
export function formatarData(iso) {
  if (!iso) return iso;
  return new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('pt-BR');
}

// Formata um timestamp ISO como "dd/mm/aaaa hh:mm" (pt-BR), usado na Auditoria de Dados e no
// visualizador de ciclos fechados do Planejamento Estratégico.
export function formatarDataHora(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

// Gera e baixa um CSV a partir de cabeçalho + linhas já em array de valores brutos (sem escapar) —
// usado por Documentos, Planos de Ação e Tarefas, que antes reimplementavam o mesmo escape/blob/
// download cada um por conta própria.
export function baixarCsv(nomeArquivo, cabecalho, linhasValores) {
  const escaparCsv = (v) => '"' + String(v ?? '').replaceAll('"', '""') + '"';
  const csv = [cabecalho, ...linhasValores].map((linha) => linha.map(escaparCsv).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
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
  // Documentos (procedimento/IT/registro) tem cabeçalho/rodapé próprios de controle de qualidade
  // (código, revisão, classificação) — não duplica com o rodapé genérico de marca abaixo.
  const rodapeGenerico = document.body.classList.contains('imprimindo-documento') ? '' : `
    <div class="print-footer-strategya">Sistema STRATEGYA · by ORBEEX — Todos os direitos reservados.</div>`;
  area.innerHTML = htmlConteudo + rodapeGenerico;
  document.body.classList.add('imprimindo-secao');

  const limpar = () => { document.body.classList.remove('imprimindo-secao'); area.innerHTML = ''; };

  // Garante que toda imagem (ex: gráfico anexado) já esteja carregada/decodificada antes de abrir
  // a janela de impressão — sem isso, o navegador pode imprimir a página com a imagem em branco.
  const imagens = [...area.querySelectorAll('img')];
  const prontas = imagens.map((img) => (img.decode ? img.decode().catch(() => {}) : new Promise((res) => { img.onload = res; img.onerror = res; })));

  Promise.all(prontas).then(() => {
    window.print();
    window.addEventListener('afterprint', limpar, { once: true });
    setTimeout(limpar, 60000);
  });
}

// supabase.functions.invoke() não entrega o corpo da resposta em `data` quando a função retorna
// um status de erro (ex: 400/403) — só um erro genérico tipo "Edge Function returned a non-2xx
// status code". O corpo real (com a mensagem de erro específica) fica em error.context, que
// precisa ser lido manualmente. Usar isso em vez de `data?.error || error.message` sempre que
// chamar supabase.functions.invoke().
export async function mensagemErroFuncao(error) {
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.clone().json();
      if (body?.error) return body.error;
    } catch { /* corpo não veio em JSON — cai no fallback abaixo */ }
  }
  return error?.message || 'Erro desconhecido.';
}

// Cascata de resolução de nível de edição por módulo/submódulo — espelha exatamente a função SQL
// nivel_edicao_usuario(empresa,modulo,submodulo) (migração 0065, com a exceção de Apurações da
// migração 0078 abaixo): usuário específico (módulo+submódulo > módulo inteiro > coringa '*') >
// departamento (mesma cascata) > default por papel (gestor: 'proprio', exceto Planejamento
// Estratégico = 'leitura'; usuario: 'leitura', exceto Planejamento Estratégico = 'sem_acesso').
// Fica aqui (não em app.js) porque app.js já importa de ui.js — colocar em app.js criaria import
// circular já que este arquivo também precisa dela.
function nivelConfiguradoEm(linhas, filtroChave, filtroValor, modulo, submodulo) {
  const doAlvo = linhas.filter((l) => l[filtroChave] === filtroValor);
  if (submodulo) {
    const exato = doAlvo.find((l) => l.modulo === modulo && l.submodulo === submodulo);
    if (exato) return exato.nivel;
  }
  const doModulo = doAlvo.find((l) => l.modulo === modulo && !l.submodulo);
  if (doModulo) return doModulo.nivel;
  const coringa = doAlvo.find((l) => l.modulo === '*');
  return coringa ? coringa.nivel : null;
}

export function resolverNivel(state, modulo, submodulo = null) {
  const linhas = state.permissoesEdicao || [];
  // Apurações (migração 0078): o gate de comitê vem antes de qualquer outra regra — nem admin nem
  // gestor recebem 'total' automático aqui, diferente de todos os outros módulos. Só ORBEEX passa
  // direto; todo o resto (mesmo Administrador) precisa ser membro ativo do comitê
  // (state.acessoApuracoes, espelho de usuario_no_comite_apuracao) para não ficar 'sem_acesso'.
  if (modulo === 'apuracoes') {
    if (state.papelAtual === 'orbeex') return 'total';
    if (!state.acessoApuracoes) return 'sem_acesso';
    const doUsuario = nivelConfiguradoEm(linhas, 'usuario_id', state.user.id, modulo, submodulo);
    if (doUsuario) return doUsuario;
    const departamentoId = state.empresaAtual?.departamentoId;
    if (departamentoId) {
      const doDepto = nivelConfiguradoEm(linhas, 'departamento_id', departamentoId, modulo, submodulo);
      if (doDepto) return doDepto;
    }
    return 'total';
  }
  if (state.papelAtual === 'orbeex' || state.papelAtual === 'admin') return 'total';
  const doUsuario = nivelConfiguradoEm(linhas, 'usuario_id', state.user.id, modulo, submodulo);
  if (doUsuario) return doUsuario;
  const departamentoId = state.empresaAtual?.departamentoId;
  if (departamentoId) {
    const doDepto = nivelConfiguradoEm(linhas, 'departamento_id', departamentoId, modulo, submodulo);
    if (doDepto) return doDepto;
  }
  if (state.papelAtual === 'gestor') {
    return modulo === 'planejamento-estrategico' ? 'leitura' : 'proprio';
  }
  return modulo === 'planejamento-estrategico' ? 'sem_acesso' : 'leitura';
}

// Nível de edição do usuário nesta empresa, para um módulo/submódulo específico (ver
// catalogo_modulos_submodulos/js/modulosConfig.js para os literais válidos): 'total' já libera
// tudo; 'proprio' libera só quando a própria pessoa é a responsável do registro (comparar com o
// campo responsavel_id do objetivo/indicador/plano/tarefa/etc.); 'leitura'/'sem_acesso' não libera.
// Espelha exatamente as políticas de RLS do banco — mantém a tela e o banco sempre de acordo.
export function podeEditarRegistro(state, responsavelId, modulo, submodulo = null) {
  const nivel = resolverNivel(state, modulo, submodulo);
  if (nivel === 'total') return true;
  return nivel === 'proprio' && !!responsavelId && responsavelId === state.user.id;
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
