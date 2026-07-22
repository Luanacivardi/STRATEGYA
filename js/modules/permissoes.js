import { toast, escapeHtml, confirmar, abrirModal, fecharModal, mensagemErroFuncao } from '../ui.js';
import { MODULOS_SISTEMA, PAPEL_LABEL } from '../modulosConfig.js';
import { abrirModalEditarUsuario, abrirModalMatrizPermissoes, abrirModalCopiarPermissoes } from './permissoesShared.js';

export async function render(container, state) {
  const { supabase, user, empresas } = state;

  container.innerHTML = '<p class="text-muted">Carregando permissões...</p>';

  const porEmpresa = await Promise.all(empresas.map(async (empresa) => {
    const { data } = await supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresa.id });
    const membros = [...(data || [])].sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email));
    return { empresa, membros };
  }));
  porEmpresa.sort((a, b) => a.empresa.nome.localeCompare(b.empresa.nome));

  container.innerHTML = `
    <div class="card">
      <div class="card-header"><span><i class="ti ti-shield-lock"></i> Permissões</span></div>
      <p class="text-muted">Gerencie o papel de cada usuário em cada empresa, tudo em um só lugar. Visível apenas para o papel ORBEEX.</p>
    </div>

    ${porEmpresa.map(({ empresa, membros }) => `
      <div class="card">
        <div class="card-header">
          <span><i class="ti ti-building"></i> ${escapeHtml(empresa.nome)}</span>
          ${membros.length > 1 ? `<button class="btn btn-secondary btn-sm" data-copiar-permissoes="${empresa.id}"><i class="ti ti-copy"></i> Copiar permissões</button>` : ''}
        </div>

        <label>Módulos habilitados para esta empresa</label>
        <div class="permissoes-modulos-grid" data-modulos-empresa="${empresa.id}">
          ${MODULOS_SISTEMA.map((m) => `
            <label class="checkbox-linha">
              <input type="checkbox" data-modulo-check="${empresa.id}|${m.id}" ${(empresa.modulos_habilitados || []).includes(m.id) ? 'checked' : ''}>
              <i class="ti ${m.icone}"></i> ${escapeHtml(m.nome)}
            </label>
          `).join('')}
        </div>
        <hr class="sep">

        <form class="form-row" style="align-items:end" data-form-criar="${empresa.id}">
          <div class="form-group"><label>Cadastrar colaborador — nome</label><input type="text" required data-novo-nome></div>
          <div class="form-group"><label>E-mail</label><input type="email" required data-novo-email></div>
          <div class="form-group"><label>Senha</label><input type="password" required minlength="6" data-novo-senha></div>
          <div class="form-group">
            <label>Papel</label>
            <select data-novo-papel>
              <option value="usuario">Usuário</option>
              <option value="gestor">Gestor</option>
              <option value="admin">Administrador</option>
              <option value="orbeex">ORBEEX</option>
            </select>
          </div>
          <div class="form-group"><button class="btn btn-primary btn-block" type="submit"><i class="ti ti-user-plus"></i> Cadastrar</button></div>
        </form>
        ${membros.length ? `
          <table class="table">
            <thead><tr><th>Nome</th><th>Papel</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${membros.map((m) => `
                <tr>
                  <td>${escapeHtml(m.nome || m.email)}</td>
                  <td><span class="badge badge-neutral">${PAPEL_LABEL[m.papel]}</span></td>
                  <td><span class="badge ${m.ativo ? 'badge-success' : 'badge-danger'}">${m.ativo ? 'Ativo' : 'Inativo'}</span></td>
                  <td class="table-actions">
                    <button class="icon-btn" data-editar-usuario="${empresa.id}|${m.usuario_id}" title="Editar colaborador"><i class="ti ti-pencil"></i></button>
                    ${(m.papel === 'usuario' || m.papel === 'gestor') ? `<button class="icon-btn" data-nivel-usuario="${empresa.id}|${m.usuario_id}" data-nome-usuario="${escapeHtml(m.nome || m.email)}" title="Configurar permissões"><i class="ti ti-shield-lock"></i></button>` : ''}
                    <button class="icon-btn" data-alterar-senha="${empresa.id}|${m.usuario_id}" title="Alterar senha"><i class="ti ti-key"></i></button>
                    ${m.usuario_id !== user.id ? `
                      <button class="icon-btn" data-toggle-ativo="${empresa.id}|${m.usuario_id}" data-ativo="${m.ativo}" title="${m.ativo ? 'Inativar' : 'Reativar'}"><i class="ti ${m.ativo ? 'ti-user-off' : 'ti-user-check'}"></i></button>
                      <button class="icon-btn" data-remover="${empresa.id}|${m.usuario_id}" title="Remover acesso"><i class="ti ti-trash"></i></button>
                    ` : ''}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>` : '<p class="text-muted">Nenhum usuário vinculado.</p>'}
      </div>
    `).join('')}
  `;

  container.querySelectorAll('[data-modulo-check]').forEach((chk) => {
    chk.addEventListener('change', async () => {
      const [empresaId] = chk.dataset.moduloCheck.split('|');
      const grid = container.querySelector(`[data-modulos-empresa="${empresaId}"]`);
      const selecionados = [...grid.querySelectorAll('[data-modulo-check]:checked')]
        .map((c) => c.dataset.moduloCheck.split('|')[1]);
      const { error } = await supabase.from('empresas').update({ modulos_habilitados: selecionados }).eq('id', empresaId);
      if (error) {
        toast('Erro ao atualizar módulos: ' + error.message, 'erro');
        chk.checked = !chk.checked;
        return;
      }
      const empresaLocal = empresas.find((e) => e.id === empresaId);
      if (empresaLocal) empresaLocal.modulos_habilitados = selecionados;
      if (state.empresaAtual?.id === empresaId) state.empresaAtual.modulos_habilitados = selecionados;
      toast('Módulos atualizados.', 'sucesso');
    });
  });

  container.querySelectorAll('[data-form-criar]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const empresaId = form.dataset.formCriar;
      const nome = form.querySelector('[data-novo-nome]').value.trim();
      const email = form.querySelector('[data-novo-email]').value.trim();
      const senha = form.querySelector('[data-novo-senha]').value;
      const papel = form.querySelector('[data-novo-papel]').value;
      const { data, error } = await supabase.functions.invoke('criar-usuario-empresa', {
        body: { empresaId, email, senha, papel, nome },
      });
      if (error) return toast('Erro ao cadastrar colaborador: ' + await mensagemErroFuncao(error), 'erro');
      toast(data.contaNova ? 'Colaborador cadastrado. Ele(a) só consegue entrar depois de confirmar o e-mail recebido.' : 'Já existia conta com esse e-mail; vínculo atualizado.', 'sucesso');
      render(container, state);
    });
  });

  container.querySelectorAll('[data-copiar-permissoes]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const empresaId = btn.dataset.copiarPermissoes;
      const membros = porEmpresa.find((pe) => pe.empresa.id === empresaId)?.membros || [];
      abrirModalCopiarPermissoes(state, { empresaId, membros }, () => render(container, state));
    });
  });

  container.querySelectorAll('[data-editar-usuario]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [empresaId, usuarioId] = btn.dataset.editarUsuario.split('|');
      const membro = porEmpresa.find((pe) => pe.empresa.id === empresaId)?.membros.find((m) => m.usuario_id === usuarioId);
      abrirModalEditarUsuario(state, { escopo: 'global', empresaId, membro }, () => render(container, state));
    });
  });

  container.querySelectorAll('[data-nivel-usuario]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [empresaId, usuarioId] = btn.dataset.nivelUsuario.split('|');
      abrirModalMatrizPermissoes(state, {
        sujeitoTipo: 'usuario', sujeitoId: usuarioId, empresaId,
        titulo: `Permissões — ${btn.dataset.nomeUsuario}`,
      }, () => render(container, state));
    });
  });

  container.querySelectorAll('[data-alterar-senha]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [empresaId, usuarioId] = btn.dataset.alterarSenha.split('|');
      abrirModalAlterarSenha(state, empresaId, usuarioId);
    });
  });

  container.querySelectorAll('[data-toggle-ativo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const [empresaId, usuarioId] = btn.dataset.toggleAtivo.split('|');
      const ativoAtual = btn.dataset.ativo === 'true';
      if (!(await confirmar(`Confirma ${ativoAtual ? 'inativar' : 'reativar'} este colaborador nesta empresa?`))) return;
      const { error } = await supabase.rpc('definir_ativo_usuario_empresa', {
        p_empresa_id: empresaId, p_usuario_id: usuarioId, p_ativo: !ativoAtual,
      });
      if (error) return toast('Erro: ' + error.message, 'erro');
      toast(ativoAtual ? 'Colaborador inativado.' : 'Colaborador reativado.', 'sucesso');
      render(container, state);
    });
  });

  container.querySelectorAll('[data-remover]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Remover o acesso deste usuário a esta empresa?'))) return;
      const [empresaId, usuarioId] = btn.dataset.remover.split('|');
      const { error } = await supabase.from('usuarios_empresas').delete().eq('empresa_id', empresaId).eq('usuario_id', usuarioId);
      if (error) return toast('Erro ao remover: ' + error.message, 'erro');
      toast('Acesso removido.', 'sucesso');
      render(container, state);
    });
  });
}

function abrirModalAlterarSenha(state, empresaId, usuarioId) {
  const { supabase } = state;
  const modal = abrirModal('Alterar senha do colaborador', `
    <form id="form-alterar-senha">
      <div class="form-group">
        <label>Nova senha</label>
        <input type="password" id="alt-senha" required minlength="6">
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar nova senha</button>
    </form>
  `);

  modal.querySelector('#form-alterar-senha').addEventListener('submit', async (e) => {
    e.preventDefault();
    const novaSenha = modal.querySelector('#alt-senha').value;
    const { error } = await supabase.functions.invoke('alterar-senha-colaborador', {
      body: { empresaId, usuarioId, novaSenha },
    });
    if (error) return toast('Erro ao alterar senha: ' + await mensagemErroFuncao(error), 'erro');
    toast('Senha alterada com sucesso.', 'sucesso');
    fecharModal();
  });
}
