// Captura de erros de JavaScript do navegador e envio para public.erros_cliente (migracao 0103).
//
// Antes disto, um modulo que quebrava mostrava "Nao foi possivel carregar esta aba" e a informacao
// parava ali. Agora o erro chega ate a ORBEEX.
//
// Regras de ouro deste arquivo, porque ele roda dentro do tratamento de erro:
//   1. NUNCA lancar excecao. Um erro aqui dentro viraria laco infinito.
//   2. NUNCA bloquear a tela. Todo envio e "dispara e esquece".
//   3. Volume limitado. Um erro dentro de um laco de render geraria milhares de linhas.

import { supabase } from './supabaseClient.js';

const LIMITE_POR_SESSAO = 12;   // teto rigido: passou disto, para de enviar ate recarregar a pagina
const LIMITE_FILA_PRE_LOGIN = 5;
const TAM = { mensagem: 500, pilha: 4000, caminho: 300, navegador: 300, contexto: 120 };

let enviados = 0;
let contextoAtual = 'inicial';
const jaVistos = new Set();       // evita repetir o mesmo erro identico na mesma sessao
const filaPreLogin = [];          // erro antes do login nao passa no RLS; guarda e manda depois

const cortar = (v, n) => (v == null ? null : String(v).slice(0, n));

// Marca em que parte do sistema a pessoa estava. Chamado pelo app.js a cada troca de tela — sem
// isso, "Cannot read properties of undefined" chega sem dizer onde aconteceu, que e quase inutil.
export function definirContexto(nome) {
  contextoAtual = String(nome || 'desconhecido').slice(0, TAM.contexto);
}

async function gravar(linha) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // Sem sessao o insert seria barrado pelo RLS. Guarda para mandar assim que alguem entrar.
      if (filaPreLogin.length < LIMITE_FILA_PRE_LOGIN) filaPreLogin.push(linha);
      return;
    }
    await supabase.from('erros_cliente').insert({ ...linha, usuario_id: session.user.id });
  } catch {
    // Falhou registrar o erro. Nao ha para onde escalar isso — engolir e o comportamento correto.
  }
}

// Chamada pelo app.js depois que a sessao existe, para esvaziar o que aconteceu na tela de login.
export function despejarFilaPreLogin() {
  const pendentes = filaPreLogin.splice(0, filaPreLogin.length);
  for (const linha of pendentes) gravar(linha);
}

export function relatarErro(erro, contexto) {
  try {
    if (enviados >= LIMITE_POR_SESSAO) return;

    const mensagem = cortar(erro?.message || erro || 'erro sem mensagem', TAM.mensagem);
    const pilha = cortar(erro?.stack, TAM.pilha);

    const impressao = `${contexto || contextoAtual}|${mensagem}`;
    if (jaVistos.has(impressao)) return;
    jaVistos.add(impressao);
    enviados++;

    gravar({
      contexto: cortar(contexto || contextoAtual, TAM.contexto),
      mensagem,
      pilha,
      // So o pathname de proposito: a URL completa poderia levar junto parametro com dado da empresa.
      caminho: cortar(window.location.pathname, TAM.caminho),
      navegador: cortar(navigator.userAgent, TAM.navegador),
      build: document.querySelector('script[src*="app.js"]')?.src.split('?v=')[1] || null,
      empresa_id: window.__strategyaEmpresaId || null,
    });
  } catch {
    // idem: erro dentro do relator de erro nao pode escapar.
  }
}

export function iniciarCapturaDeErros() {
  window.addEventListener('error', (e) => {
    // Falha ao carregar <img>/<script> tambem dispara 'error', mas sem objeto de erro — ignora,
    // senao todo logo de empresa que nao carrega vira uma linha na tabela.
    if (!e.error) return;
    relatarErro(e.error);
  });

  window.addEventListener('unhandledrejection', (e) => {
    relatarErro(e.reason instanceof Error ? e.reason : new Error(String(e.reason)));
  });
}
