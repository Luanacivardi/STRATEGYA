import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RETENCAO_DIAS = 30;

function resposta(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Comparação em tempo constante — não vaza, pelo tempo de resposta, quantos caracteres do token
// o chamador acertou.
function tokensIguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

Deno.serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Autorização própria (por isso esta função roda com verify_jwt desligado): antes ela aceitava
    // qualquer chamada com a chave anon, que é pública — ou seja, qualquer um disparava um dump
    // completo do banco. O token vem da tabela public.backup_token, legível só pela service_role.
    const tokenRecebido = req.headers.get('x-backup-token') ?? '';
    const { data: config, error: errToken } = await supabase
      .from('backup_token')
      .select('token')
      .eq('id', true)
      .single();
    if (errToken || !config?.token) {
      console.error('Backup diario: nao foi possivel ler o token de autorizacao:', errToken);
      return resposta({ ok: false, erro: 'Configuracao de backup indisponivel.' }, 500);
    }
    if (!tokenRecebido || !tokensIguais(tokenRecebido, config.token)) {
      return resposta({ ok: false, erro: 'Nao autorizado.' }, 401);
    }

    const { data: dump, error: dumpError } = await supabase.rpc('gerar_dump_backup');
    if (dumpError) throw dumpError;

    const dataISO = new Date().toISOString().slice(0, 10);
    const nomeArquivo = `dados_${dataISO}.json`;
    const conteudo = new TextEncoder().encode(JSON.stringify(dump));

    const { error: uploadError } = await supabase.storage
      .from('backups')
      .upload(nomeArquivo, conteudo, { contentType: 'application/json', upsert: true });
    if (uploadError) throw uploadError;

    // Retenção: mantém só os backups mais recentes, apaga o resto
    const { data: arquivos, error: listError } = await supabase.storage
      .from('backups')
      .list('', { limit: 1000 });
    if (listError) throw listError;

    const backups = (arquivos ?? [])
      .filter((f) => f.name.startsWith('dados_') && f.name.endsWith('.json'))
      .sort((a, b) => a.name.localeCompare(b.name));

    const excedente = backups.length - RETENCAO_DIAS;
    if (excedente > 0) {
      const paraExcluir = backups.slice(0, excedente).map((f) => f.name);
      await supabase.storage.from('backups').remove(paraExcluir);
    }

    // Registra o resultado para o monitoramento: sem isto, uma falha do backup só apareceria
    // no dia em que alguém precisasse restaurar.
    await supabase.rpc('registrar_execucao_backup', {
      p_sucesso: true,
      p_arquivo: nomeArquivo,
      p_bytes: conteudo.byteLength,
      p_erro: null,
    });

    return resposta(
      { ok: true, arquivo: nomeArquivo, tabelas: Object.keys(dump ?? {}).length, backupsMantidos: Math.min(backups.length, RETENCAO_DIAS) },
      200,
    );
  } catch (err) {
    console.error('Falha no backup diario:', err);
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await supabase.rpc('registrar_execucao_backup', {
        p_sucesso: false,
        p_arquivo: null,
        p_bytes: null,
        p_erro: String(err).slice(0, 500),
      });
    } catch { /* se nem o registro do erro funcionar, resta o log da função */ }
    return resposta({ ok: false, erro: String(err) }, 500);
  }
});
