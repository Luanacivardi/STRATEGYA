import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function resposta(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { empresaId, usuarioId, novaSenha } = await req.json();
    if (!empresaId || !usuarioId || !novaSenha) {
      return resposta({ error: 'Preencha empresa, usuário e nova senha.' }, 400);
    }
    if (String(novaSenha).length < 6) {
      return resposta({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return resposta({ error: 'Não autenticado.' }, 401);

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
      return resposta({ error: 'Sem permissão para alterar a senha de colaboradores desta empresa.' }, 403);
    }

    const { data: membros, error: errMembros } = await clienteChamador.rpc('listar_usuarios_empresa', { p_empresa_id: empresaId });
    if (errMembros || !membros?.some((m: { usuario_id: string }) => m.usuario_id === usuarioId)) {
      return resposta({ error: 'Usuário não pertence a esta empresa.' }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { error: errUpd } = await admin.auth.admin.updateUserById(usuarioId, { password: novaSenha });
    if (errUpd) return resposta({ error: errUpd.message }, 400);

    return resposta({ success: true }, 200);
  } catch (err) {
    return resposta({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500);
  }
});
