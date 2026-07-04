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
    const { empresaId, email, senha, papel, nome } = await req.json();

    if (!empresaId || !email || !senha || !papel) {
      return resposta({ error: 'Preencha e-mail, senha, papel e empresa.' }, 400);
    }
    if (!['orbeex', 'admin', 'usuario'].includes(papel)) {
      return resposta({ error: 'Papel inválido.' }, 400);
    }
    if (String(senha).length < 6) {
      return resposta({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return resposta({ error: 'Não autenticado.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Cliente com a identidade de quem chamou, para checar permissão via RLS/RPC normalmente
    const clienteChamador = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: temAcesso, error: errAcesso } = await clienteChamador.rpc('usuario_tem_acesso_empresa', {
      p_empresa_id: empresaId,
      p_papeis: ['orbeex', 'admin'],
    });
    if (errAcesso || !temAcesso) {
      return resposta({ error: 'Sem permissão para cadastrar usuários nesta empresa.' }, 403);
    }

    // Cliente com privilégio de administrador, só para criar a conta de autenticação
    const admin = createClient(supabaseUrl, serviceKey);
    const { error: errCriar } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: nome ? { nome } : undefined,
    });

    let contaNova = true;
    if (errCriar) {
      const jaExiste = /already.*registered|already.*exists/i.test(errCriar.message);
      if (!jaExiste) return resposta({ error: errCriar.message }, 400);
      contaNova = false;

      // Conta já existe: se um nome foi informado, atualiza o nome de exibição dela também
      if (nome) {
        const { data: existentes } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existente = existentes?.users?.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
        if (existente) {
          await admin.auth.admin.updateUserById(existente.id, { user_metadata: { ...existente.user_metadata, nome } });
        }
      }
    }

    // Vincula (ou atualiza o papel de) o usuário à empresa, reaproveitando a RPC já existente e protegida
    const { error: errVinculo } = await clienteChamador.rpc('convidar_usuario_por_email', {
      p_empresa_id: empresaId,
      p_email: email,
      p_papel: papel,
    });
    if (errVinculo) return resposta({ error: errVinculo.message }, 400);

    return resposta({ success: true, contaNova }, 200);
  } catch (err) {
    return resposta({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500);
  }
});
