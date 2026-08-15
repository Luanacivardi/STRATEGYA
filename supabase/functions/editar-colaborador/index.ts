import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Só as origens do próprio STRATEGYA podem chamar estas funções pelo navegador. Com '*', qualquer
// site conseguia montar a requisição (ainda precisaria do token da pessoa, mas não há motivo para
// deixar a porta aberta). Ao trocar de domínio, incluir o novo aqui.
const ORIGENS_PERMITIDAS = new Set([
  'https://strategya.orbeex.com.br',
  'https://strategya.luana-civardi.workers.dev',
  'http://localhost:5500',
  'http://localhost:5599',
]);

function corsHeaders(origem: string | null) {
  return {
    'Access-Control-Allow-Origin': origem && ORIGENS_PERMITIDAS.has(origem) ? origem : 'https://strategya.orbeex.com.br',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function resposta(body: unknown, status: number, origem: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origem), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  const origem = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origem) });

  try {
    const { empresaId, usuarioId, nome } = await req.json();
    if (!empresaId || !usuarioId || !nome) {
      return resposta({ error: 'Preencha empresa, usuário e nome.' }, 400, origem);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return resposta({ error: 'Não autenticado.' }, 401, origem);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const clienteChamador = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: temAcesso, error: errAcesso } = await clienteChamador.rpc('usuario_tem_acesso_empresa', {
      p_empresa_id: empresaId,
      p_papeis: ['orbeex', 'admin'],
    });
    if (errAcesso || !temAcesso) {
      return resposta({ error: 'Sem permissão para editar colaboradores desta empresa.' }, 403, origem);
    }

    // Confirma que o usuário-alvo realmente pertence a esta empresa (evita editar quem é de outra empresa)
    const { data: membros, error: errMembros } = await clienteChamador.rpc('listar_usuarios_empresa', { p_empresa_id: empresaId });
    if (errMembros || !membros?.some((m: { usuario_id: string }) => m.usuario_id === usuarioId)) {
      return resposta({ error: 'Usuário não pertence a esta empresa.' }, 403, origem);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: usuarioAtual, error: errBusca } = await admin.auth.admin.getUserById(usuarioId);
    if (errBusca || !usuarioAtual) return resposta({ error: 'Usuário não encontrado.' }, 404, origem);

    const { error: errUpd } = await admin.auth.admin.updateUserById(usuarioId, {
      user_metadata: { ...usuarioAtual.user.user_metadata, nome },
    });
    if (errUpd) return resposta({ error: errUpd.message }, 400, origem);

    return resposta({ success: true }, 200, origem);
  } catch (err) {
    return resposta({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500, origem);
  }
});
