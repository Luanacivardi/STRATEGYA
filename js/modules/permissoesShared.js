// Componentes de UI de permissão compartilhados entre empresaUsuarios.js (escopo 1 empresa) e
// permissoes.js (escopo global, só ORBEEX) — antes cada arquivo reimplementava seu próprio modal de
// "editar colaborador" (quase idêntico, com pequenas divergências de trava de papel ORBEEX) e só
// empresaUsuarios.js tinha nível de edição configurável. Agora os dois reaproveitam exatamente o
// mesmo código.
import { toast, escapeHtml, confirmar, abrirModal, fecharModal, mensagemErroFuncao } from '../ui.js';
import { MODULOS_SISTEMA, NIVEL_LABEL } from '../modulosConfig.js';

const NIVEIS_SELECIONAVEIS = ['leitura', 'proprio', 'total', 'aprovacao', 'sem_acesso'];

// ---------- Editar colaborador (nome / papel / departamento) ----------
// escopo 'empresa': mostra departamento (empresaUsuarios.js). escopo 'global': sem departamento,
// mesma trava de papel ORBEEX (permissoes.js, tela cross-empresa).
export function abrirModalEditarUsuario(state, { escopo, empresaId, membro, departamentos = [] }, aoSalvar) {
  const { supabase, papelAtual, user } = state;
  const ehOrbeex = papelAtual === 'orbeex';
  const editandoSiMesmo = membro.usuario_id === user.id;
  // Cadastros ORBEEX só podem ter o papel alterado (rebaixado ou não) por outro usuário ORBEEX —
  // mesma regra reforçada no banco pelo trigger trg_proteger_papel_orbeex.
  const podeEditarPapel = !editandoSiMesmo && (ehOrbeex || membro.papel !== 'orbeex');
  const motivoTravado = editandoSiMesmo
    ? 'Você não pode alterar seu próprio papel'
    : (!podeEditarPapel ? 'Cadastros ORBEEX só podem ter o papel alterado por outro usuário ORBEEX' : '');

  const modal = abrirModal('Editar colaborador', `
    <form id="form-editar-usuario">
      <div class="form-group">
        <label>Nome</label>
        <input type="text" id="edit-nome" required value="${escapeHtml(membro.nome || '')}">
      </div>
      <div class="form-group">
        <label>Papel</label>
        <select id="edit-papel" ${!podeEditarPapel ? `disabled title="${motivoTravado}"` : ''}>
          <option value="usuario" ${membro.papel === 'usuario' ? 'selected' : ''}>Usuário</option>
          <option value="gestor" ${membro.papel === 'gestor' ? 'selected' : ''}>Gestor</option>
          <option value="admin" ${membro.papel === 'admin' ? 'selected' : ''}>Administrador</option>
          ${(ehOrbeex || membro.papel === 'orbeex') ? `<option value="orbeex" ${membro.papel === 'orbeex' ? 'selected' : ''}>ORBEEX</option>` : ''}
        </select>
      </div>
      ${escopo === 'empresa' ? `
      <div class="form-group">
        <label>Departamento</label>
        <select id="edit-departamento">
          <option value="">—</option>
          ${departamentos.map((d) => `<option value="${d.id}" ${membro.departamento_id === d.id ? 'selected' : ''}>${escapeHtml(d.nome)}</option>`).join('')}
        </select>
      </div>` : ''}
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#form-editar-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = modal.querySelector('#edit-nome').value.trim();
    const papel = modal.querySelector('#edit-papel').value;
    const departamentoEl = modal.querySelector('#edit-departamento');

    // Nome, papel e departamento são independentes entre si — uma falha em um não deve impedir os
    // outros de serem salvos (ex: nome falhar não pode travar a troca de papel).
    const erros = [];

    if (nome !== (membro.nome || '')) {
      const { error: errNome } = await supabase.functions.invoke('editar-colaborador', {
        body: { empresaId, usuarioId: membro.usuario_id, nome },
      });
      if (errNome) erros.push('nome: ' + await mensagemErroFuncao(errNome));
    }

    if (!editandoSiMesmo && podeEditarPapel && papel !== membro.papel) {
      const { error: errPapel } = await supabase.from('usuarios_empresas')
        .update({ papel }).eq('empresa_id', empresaId).eq('usuario_id', membro.usuario_id);
      if (errPapel) erros.push('papel: ' + errPapel.message);
    }

    if (departamentoEl) {
      const departamentoId = departamentoEl.value || null;
      if (departamentoId !== membro.departamento_id) {
        const { error: errDepto } = await supabase.from('usuarios_empresas')
          .update({ departamento_id: departamentoId }).eq('empresa_id', empresaId).eq('usuario_id', membro.usuario_id);
        if (errDepto) erros.push('departamento: ' + errDepto.message);
      }
    }

    if (erros.length) return toast('Erro ao salvar — ' + erros.join(' | '), 'erro');
    toast('Usuário atualizado.', 'sucesso');
    fecharModal();
    aoSalvar();
  });
}

// ---------- Matriz de permissões (Módulo → Submódulo x Nível), por usuário ou por departamento ----------
export async function abrirModalMatrizPermissoes(state, { sujeitoTipo, sujeitoId, empresaId, titulo }, aoSalvar) {
  const { supabase } = state;
  const coluna = sujeitoTipo === 'usuario' ? 'usuario_id' : 'departamento_id';

  const { data, error } = await supabase.from('permissoes_edicao')
    .select('modulo, submodulo, nivel')
    .eq('empresa_id', empresaId)
    .eq(coluna, sujeitoId);
  if (error) return toast('Erro ao carregar permissões: ' + error.message, 'erro');

  const linhas = data || [];
  const nivelDe = (modulo, submodulo) =>
    linhas.find((l) => l.modulo === modulo && (l.submodulo || null) === (submodulo || null))?.nivel || '';

  const linhaHtml = (modulo, submodulo, nome, comIndentacao) => `
    <tr>
      <td${comIndentacao ? ' style="padding-left:2rem"' : ''}>${escapeHtml(nome)}</td>
      <td>
        <select data-nivel-modulo="${modulo}" data-nivel-submodulo="${submodulo || ''}">
          <option value="" ${!nivelDe(modulo, submodulo) ? 'selected' : ''}>Padrão do papel</option>
          ${NIVEIS_SELECIONAVEIS.map((n) => `<option value="${n}" ${nivelDe(modulo, submodulo) === n ? 'selected' : ''}>${NIVEL_LABEL[n]}</option>`).join('')}
        </select>
      </td>
    </tr>`;

  const corpoHtml = MODULOS_SISTEMA.filter((m) => m.disponivel).map((m) => {
    if (m.configuravel === false) {
      const motivo = m.id === 'apuracoes'
        ? 'Acesso controlado pelo comitê de apuração (fora deste sistema de níveis).'
        : 'Somente leitura para todos com acesso à empresa; edição restrita a Admin/ORBEEX.';
      return `<tr><td>${escapeHtml(m.nome)}</td><td class="text-muted" style="font-size:12px">${motivo}</td></tr>`;
    }
    const linhaModulo = linhaHtml(m.id, null, m.submodulos?.length ? `${m.nome} (todo o módulo)` : m.nome, false);
    const linhasSub = (m.submodulos || []).map((s) => linhaHtml(m.id, s.id, s.nome, true)).join('');
    return linhaModulo + linhasSub;
  }).join('');

  const modal = abrirModal(titulo, `
    <form id="form-matriz-permissoes">
      <p class="text-muted" style="margin-bottom:1rem;font-size:13px">"Padrão do papel" segue o nível automático do papel (ex: Gestor = Edição sob Responsabilidade, exceto Planejamento Estratégico = Visualização; Usuário = Visualização, exceto Planejamento Estratégico = Sem acesso). Escolha um nível específico só para sobrepor o padrão naquele módulo/submódulo.</p>
      <table class="table">
        <thead><tr><th>Módulo / Submódulo</th><th>Nível</th></tr></thead>
        <tbody>${corpoHtml}</tbody>
      </table>
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:1rem">Salvar</button>
    </form>
  `);

  modal.querySelector('#form-matriz-permissoes').addEventListener('submit', async (e) => {
    e.preventDefault();
    const selects = [...modal.querySelectorAll('select[data-nivel-modulo]')];
    const paraUpsert = [];
    const paraApagar = [];
    for (const sel of selects) {
      const modulo = sel.dataset.nivelModulo;
      const submodulo = sel.dataset.nivelSubmodulo || null;
      const valor = sel.value;
      if (valor === '') {
        if (nivelDe(modulo, submodulo)) paraApagar.push({ modulo, submodulo });
      } else {
        paraUpsert.push({ empresa_id: empresaId, [coluna]: sujeitoId, modulo, submodulo, nivel: valor });
      }
    }

    for (const { modulo, submodulo } of paraApagar) {
      let q = supabase.from('permissoes_edicao').delete().eq('empresa_id', empresaId).eq(coluna, sujeitoId).eq('modulo', modulo);
      q = submodulo ? q.eq('submodulo', submodulo) : q.is('submodulo', null);
      const { error: errDel } = await q;
      if (errDel) return toast('Erro ao remover override: ' + errDel.message, 'erro');
    }

    if (paraUpsert.length) {
      const onConflict = sujeitoTipo === 'usuario' ? 'usuario_id,empresa_id,modulo,submodulo_norm' : 'departamento_id,modulo,submodulo_norm';
      const { error: errUp } = await supabase.from('permissoes_edicao').upsert(paraUpsert, { onConflict });
      if (errUp) return toast('Erro ao salvar permissões: ' + errUp.message, 'erro');
    }

    toast('Permissões atualizadas.', 'sucesso');
    fecharModal();
    aoSalvar();
  });
}

// ---------- Copiar permissões entre usuários ----------
export function abrirModalCopiarPermissoes(state, { empresaId, membros }, aoSalvar) {
  const { supabase } = state;
  const opcoes = (nomeVazio) => [`<option value="">${nomeVazio}</option>`]
    .concat(membros.map((m) => `<option value="${m.usuario_id}">${escapeHtml(m.nome || m.email)}</option>`)).join('');

  const modal = abrirModal('Copiar permissões entre usuários', `
    <form id="form-copiar-permissoes">
      <div class="form-group">
        <label>Copiar permissões de</label>
        <select id="cp-origem" required>${opcoes('Selecione o usuário de origem')}</select>
      </div>
      <div class="form-group">
        <label>Para</label>
        <select id="cp-destino" required>${opcoes('Selecione o usuário de destino')}</select>
      </div>
      <p class="text-muted" style="font-size:12px">Isso substitui todas as permissões granulares atuais do destino pelas do usuário de origem (módulo, submódulo e nível — inclusive removendo overrides que o destino já tinha e a origem não tem).</p>
      <button class="btn btn-primary btn-block" type="submit">Copiar permissões</button>
    </form>
  `);

  modal.querySelector('#form-copiar-permissoes').addEventListener('submit', async (e) => {
    e.preventDefault();
    const origemId = modal.querySelector('#cp-origem').value;
    const destinoId = modal.querySelector('#cp-destino').value;
    if (!origemId || !destinoId) return;
    if (origemId === destinoId) return toast('Escolha usuários diferentes.', 'erro');
    if (!(await confirmar('Isso substitui todas as permissões granulares atuais do destino pelas da origem. Continuar?'))) return;

    const { error } = await supabase.rpc('copiar_permissoes_edicao', {
      p_empresa_id: empresaId, p_usuario_origem: origemId, p_usuario_destino: destinoId,
    });
    if (error) return toast('Erro ao copiar permissões: ' + error.message, 'erro');
    toast('Permissões copiadas.', 'sucesso');
    fecharModal();
    aoSalvar();
  });
}
