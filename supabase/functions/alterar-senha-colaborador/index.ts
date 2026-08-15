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
    const { empresaId, usuarioId, novaSenha } = await req.json();
    if (!empresaId || !usuarioId || !novaSenha) {
      return resposta({ error: 'Preencha empresa, usuário e nova senha.' }, 400, origem);
    }
    if (String(novaSenha).length < 8) {
      return resposta({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400, origem);
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
      return resposta({ error: 'Sem permissão para alterar a senha de colaboradores desta empresa.' }, 403, origem);
    }

    type Membro = { usuario_id: string; papel: string };
    const { data: membros, error: errMembros } = await clienteChamador.rpc('listar_usuarios_empresa', { p_empresa_id: empresaId });
    const alvo = (membros as Membro[] | null)?.find((m) => m.usuario_id === usuarioId);
    if (errMembros || !alvo) {
      return resposta({ error: 'Usuário não pertence a esta empresa.' }, 403, origem);
    }

    // Quem é o alvo importa tanto quanto quem chama. Sem esta trava, um Administrador de um cliente
    // podia redefinir a senha da conta ORBEEX (que é membro de todas as empresas que administra),
    // logar com ela e alcançar TODAS as empresas da plataforma — escalada de privilégio completa.
    // Os triggers proteger_papel_orbeex/proteger_exclusao_papel_orbeex já cobrem o papel no banco;
    // a senha era o caminho que faltava fechar.
    const { data: dadosChamador } = await clienteChamador.auth.getUser();
    const chamadorId = dadosChamador?.user?.id;
    if (!chamadorId) return resposta({ error: 'Não autenticado.' }, 401, origem);
    const chamadorEhOrbeex = (membros as Membro[]).find((m) => m.usuario_id === chamadorId)?.papel === 'orbeex';

    if (alvo.papel === 'orbeex' && !chamadorEhOrbeex) {
      return resposta({ error: 'Somente a equipe ORBEEX pode redefinir a senha de uma conta ORBEEX.' }, 403, origem);
    }
    if (alvo.papel === 'admin' && !chamadorEhOrbeex && alvo.usuario_id !== chamadorId) {
      return resposta({ error: 'Um Administrador não pode redefinir a senha de outro Administrador. Peça à equipe ORBEEX ou use "Esqueci minha senha".' }, 403, origem);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { error: errUpd } = await admin.auth.admin.updateUserById(usuarioId, { password: novaSenha });
    if (errUpd) return resposta({ error: errUpd.message }, 400, origem);

    return resposta({ success: true }, 200, origem);
  } catch (err) {
    return resposta({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500, origem);
  }
});
