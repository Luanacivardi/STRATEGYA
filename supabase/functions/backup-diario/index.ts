import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RETENCAO_DIAS = 30;

function resposta(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (_req: Request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

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

    return resposta(
      { ok: true, arquivo: nomeArquivo, tabelas: Object.keys(dump ?? {}).length, backupsMantidos: Math.min(backups.length, RETENCAO_DIAS) },
      200,
    );
  } catch (err) {
    console.error('Falha no backup diario:', err);
    return resposta({ ok: false, erro: String(err) }, 500);
  }
});
