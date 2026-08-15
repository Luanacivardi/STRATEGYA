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
    const { empresaId, email, senha, papel, nome, departamentoId } = await req.json();

    if (!empresaId || !email || !senha || !papel) {
      return resposta({ error: 'Preencha e-mail, senha, papel e empresa.' }, 400, origem);
    }
    if (!['orbeex', 'admin', 'gestor', 'usuario'].includes(papel)) {
      return resposta({ error: 'Papel inválido.' }, 400, origem);
    }
    if (String(senha).length < 8) {
      return resposta({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400, origem);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return resposta({ error: 'Não autenticado.' }, 401, origem);

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
      return resposta({ error: 'Sem permissão para cadastrar usuários nesta empresa.' }, 403, origem);
    }

    // Cliente com privilégio de administrador, só para criar a conta de autenticação.
    // email_confirm: false — mesmo sendo o admin/ORBEEX a definir a senha, a conta só é liberada
    // para login depois que o dono do e-mail clicar no link de confirmação enviado por ele
    // (evita cadastrar alguém com um e-mail errado ou que não é dela).
    const admin = createClient(supabaseUrl, serviceKey);
    const { error: errCriar } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: false,
      user_metadata: nome ? { nome } : undefined,
    });

    let contaNova = true;
    if (errCriar) {
      const jaExiste = /already.*registered|already.*exists/i.test(errCriar.message);
      if (!jaExiste) return resposta({ error: errCriar.message }, 400, origem);
      contaNova = false;

      // Conta já existe: se um nome foi informado, atualiza o nome de exibição dela também.
      // Busca direta por e-mail (função de banco), em vez de listUsers paginado — que passa a
      // "esquecer" contas mais antigas quando o total de usuários do projeto ultrapassa 1000.
      if (nome) {
        const { data: existenteId } = await admin.rpc('buscar_usuario_id_por_email', { p_email: email });
        if (existenteId) {
          const { data: existente } = await admin.auth.admin.getUserById(existenteId);
          if (existente?.user) {
            await admin.auth.admin.updateUserById(existenteId, { user_metadata: { ...existente.user.user_metadata, nome } });
          }
        }
      }
    }

    // Vincula (ou atualiza o papel de) o usuário à empresa, reaproveitando a RPC já existente e protegida
    const { error: errVinculo } = await clienteChamador.rpc('convidar_usuario_por_email', {
      p_empresa_id: empresaId,
      p_email: email,
      p_papel: papel,
      p_departamento_id: departamentoId || null,
    });
    if (errVinculo) return resposta({ error: errVinculo.message }, 400, origem);

    return resposta({ success: true, contaNova }, 200, origem);
  } catch (err) {
    return resposta({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500, origem);
  }
});
