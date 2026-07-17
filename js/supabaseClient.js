import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// storage: sessionStorage (em vez do padrão, localStorage) — a sessão fica presa à aba/janela
// atual e é apagada quando a pessoa fecha a página, exigindo login de novo no próximo acesso
// (requisito de segurança: não manter sessão aberta indefinidamente no navegador).
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: window.sessionStorage },
});
