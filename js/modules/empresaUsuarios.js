import { toast, escapeHtml, confirmar, abrirModal, fecharModal } from '../ui.js';
import { aplicarTema } from '../tema.js';
import { abrirModalNovaEmpresa } from '../app.js';

const PAPEL_LABEL = { orbeex: 'ORBEEX', admin: 'Administrador', usuario: 'Usuário' };

export async function render(container, state) {
  const { supabase, empresaAtual, papelAtual, user } = state;
  const podeGerenciar = papelAtual === 'orbeex' || papelAtual === 'admin';
  const ehOrbeex = papelAtual === 'orbeex';

  const { data: membrosRaw, error } = await supabase.rpc('listar_usuarios_empresa', { p_empresa_id: empresaAtual.id });
  if (error) {
    container.innerHTML = `<div class="alert alert-warning">Erro ao carregar usuários: ${escapeHtml(error.message)}</div>`;
    return;
  }

  const membros = [...membrosRaw].sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email));

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span><i class="ti ti-building"></i> Dados da Empresa</span>
        ${ehOrbeex ? '<button class="btn btn-primary btn-sm" id="btn-nova-empresa-config"><i class="ti ti-plus"></i> Nova empresa</button>' : ''}
      </div>
      <form id="form-empresa" class="form-row">
        <div class="form-group">
          <label>Nome</label>
          <input type="text" id="emp-nome" value="${escapeHtml(empresaAtual.nome)}" ${podeGerenciar ? 'required' : 'readonly'}>
        </div>
        <div class="form-group">
          <label>CNPJ</label>
          <input type="text" id="emp-cnpj" value="${escapeHtml(empresaAtual.cnpj || '')}" ${podeGerenciar ? '' : 'readonly'}>
        </div>
        ${podeGerenciar ? '<div class="form-group"><button class="btn btn-primary btn-block" type="submit">Salvar</button></div>' : ''}
      </form>
      ${ehOrbeex ? `
        <hr class="sep">
        <button class="btn btn-danger btn-sm" id="btn-excluir-empresa"><i class="ti ti-trash"></i> Excluir empresa</button>
        <p class="text-muted" style="margin-top:8px">Ação restrita ao papel ORBEEX. Remove permanentemente a empresa e todos os seus dados.</p>
      ` : ''}
    </div>

    ${podeGerenciar ? `
    <div class="card">
      <div class="card-header"><span><i class="ti ti-palette"></i> Identidade Visual do Cliente</span></div>
      <p class="text-muted" style="margin-bottom:1rem">Personalize a cor e o logo para que a interface fique com a cara deste cliente.</p>
      <form id="form-branding">
        <div class="form-row">
          <div class="form-group">
            <label>Cor primária (fundo)</label>
            <input type="color" id="brand-cor-primaria" value="${empresaAtual.cor_primaria || '#252538'}">
          </div>
          <div class="form-group">
            <label>Cor de destaque</label>
            <input type="color" id="brand-cor-destaque" value="${empresaAtual.cor_destaque || '#E8B84B'}">
          </div>
          <div class="form-group">
            <label>Cor da fonte (sobre fundo escuro)</label>
            <input type="color" id="brand-cor-texto" value="${empresaAtual.cor_texto || '#ffffff'}">
          </div>
        </div>
        <div class="form-group">
          <label>Logo (PNG, JPG ou SVG)</label>
          ${empresaAtual.logo_url ? `<div style="margin-bottom:8px"><img src="${empresaAtual.logo_url}" alt="Logo atual" style="max-height:48px;background:var(--surface-1);padding:6px;border-radius:6px"></div>` : ''}
          <input type="file" id="brand-logo" accept="image/png,image/jpeg,image/svg+xml">
        </div>
        <div class="form-row">
          <div class="form-group"><button class="btn btn-primary btn-block" type="submit"><i class="ti ti-device-floppy"></i> Salvar identidade visual</button></div>
          ${empresaAtual.logo_url ? '<div class="form-group"><button class="btn btn-secondary btn-block" type="button" id="btn-remover-logo"><i class="ti ti-trash"></i> Remover logo</button></div>' : ''}
        </div>
      </form>
    </div>
    ` : ''}

    <div class="card">
      <div class="card-header">
        <span><i class="ti ti-users"></i> Colaboradores com acesso</span>
      </div>
      ${podeGerenciar ? `
        <form id="form-criar-usuario" class="form-row" style="align-items:end">
          <div class="form-group">
            <label>Nome</label>
            <input type="text" id="novo-nome" required>
          </div>
          <div class="form-group">
            <label>E-mail</label>
            <input type="email" id="novo-email" required>
          </div>
          <div class="form-group">
            <label>Senha</label>
            <input type="password" id="novo-senha" required minlength="6">
          </div>
          <div class="form-group">
            <label>Papel</label>
            <select id="novo-papel">
              <option value="usuario">Usuário</option>
              <option value="admin">Administrador</option>
              ${ehOrbeex ? '<option value="orbeex">ORBEEX</option>' : ''}
            </select>
          </div>
          <div class="form-group">
            <button class="btn btn-primary btn-block" type="submit" id="btn-criar-usuario"><i class="ti ti-user-plus"></i> Cadastrar colaborador</button>
          </div>
        </form>
        <hr class="sep">
      ` : ''}
      <table class="table">
        <thead><tr><th>Nome</th><th>Papel</th><th>Status</th>${podeGerenciar ? '<th></th>' : ''}</tr></thead>
        <tbody>
          ${membros.map((m) => `
            <tr>
              <td>${escapeHtml(m.nome || m.email)}</td>
              <td><span class="badge badge-neutral">${PAPEL_LABEL[m.papel]}</span></td>
              <td><span class="badge ${m.ativo ? 'badge-success' : 'badge-danger'}">${m.ativo ? 'Ativo' : 'Inativo'}</span></td>
              ${podeGerenciar ? `<td class="table-actions">
                <button class="icon-btn" data-editar-usuario="${m.usuario_id}" title="Editar colaborador"><i class="ti ti-pencil"></i></button>
                <button class="icon-btn" data-alterar-senha="${m.usuario_id}" title="Alterar senha"><i class="ti ti-key"></i></button>
                ${m.usuario_id !== user.id ? `
                  <button class="icon-btn" data-toggle-ativo="${m.usuario_id}" data-ativo="${m.ativo}" title="${m.ativo ? 'Inativar' : 'Reativar'}"><i class="ti ${m.ativo ? 'ti-user-off' : 'ti-user-check'}"></i></button>
                  ${m.papel !== 'orbeex' || ehOrbeex ? `
                    <button class="icon-btn" data-remover="${m.usuario_id}" title="Remover acesso"><i class="ti ti-trash"></i></button>
                  ` : `<span class="text-muted" title="Cadastros ORBEEX só podem ser removidos por outro usuário ORBEEX"><i class="ti ti-lock"></i></span>`}
                ` : ''}
              </td>` : ''}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  const btnNovaEmpresa = container.querySelector('#btn-nova-empresa-config');
  if (btnNovaEmpresa) btnNovaEmpresa.addEventListener('click', () => abrirModalNovaEmpresa());

  const formEmpresa = container.querySelector('#form-empresa');
  if (podeGerenciar) {
    formEmpresa.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { error: errUpd } = await supabase.from('empresas').update({
        nome: container.querySelector('#emp-nome').value.trim(),
        cnpj: container.querySelector('#emp-cnpj').value.trim() || null,
      }).eq('id', empresaAtual.id);
      if (errUpd) return toast('Erro ao salvar: ' + errUpd.message, 'erro');
      empresaAtual.nome = container.querySelector('#emp-nome').value.trim();
      toast('Dados da empresa atualizados.', 'sucesso');
      document.getElementById('empresa-nome-titulo').textContent = empresaAtual.nome;
    });
  }

  const btnExcluirEmpresa = container.querySelector('#btn-excluir-empresa');
  if (btnExcluirEmpresa) {
    btnExcluirEmpresa.addEventListener('click', async () => {
      if (!(await confirmar(`Excluir a empresa "${empresaAtual.nome}" e TODOS os seus dados? Esta ação não pode ser desfeita.`))) return;
      const { error: errDel } = await supabase.from('empresas').delete().eq('id', empresaAtual.id);
      if (errDel) return toast('Erro ao excluir empresa: ' + errDel.message, 'erro');
      toast('Empresa excluída.', 'sucesso');
      window.location.reload();
    });
  }

  const formBranding = container.querySelector('#form-branding');
  if (formBranding) {
    formBranding.addEventListener('submit', async (e) => {
      e.preventDefault();
      const corPrimaria = container.querySelector('#brand-cor-primaria').value;
      const corDestaque = container.querySelector('#brand-cor-destaque').value;
      const corTexto = container.querySelector('#brand-cor-texto').value;
      const arquivo = container.querySelector('#brand-logo').files[0];

      let logoUrl = empresaAtual.logo_url;
      if (arquivo) {
        const ext = arquivo.name.split('.').pop();
        const caminho = `${empresaAtual.id}/logo.${ext}`;
        const { error: errUpload } = await supabase.storage
          .from('logos-empresas')
          .upload(caminho, arquivo, { upsert: true, cacheControl: '3600' });
        if (errUpload) return toast('Erro ao enviar logo: ' + errUpload.message, 'erro');
        const { data: pub } = supabase.storage.from('logos-empresas').getPublicUrl(caminho);
        logoUrl = `${pub.publicUrl}?t=${Date.now()}`;
      }

      const { error: errUpd } = await supabase.from('empresas').update({
        cor_primaria: corPrimaria, cor_destaque: corDestaque, cor_texto: corTexto, logo_url: logoUrl,
      }).eq('id', empresaAtual.id);
      if (errUpd) return toast('Erro ao salvar identidade visual: ' + errUpd.message, 'erro');

      empresaAtual.cor_primaria = corPrimaria;
      empresaAtual.cor_destaque = corDestaque;
      empresaAtual.cor_texto = corTexto;
      empresaAtual.logo_url = logoUrl;
      aplicarTema(empresaAtual);
      toast('Identidade visual atualizada.', 'sucesso');
      render(container, state);
    });
  }

  const btnRemoverLogo = container.querySelector('#btn-remover-logo');
  if (btnRemoverLogo) {
    btnRemoverLogo.addEventListener('click', async () => {
      if (!(await confirmar('Remover o logo desta empresa?'))) return;
      const { error: errUpd } = await supabase.from('empresas').update({ logo_url: null }).eq('id', empresaAtual.id);
      if (errUpd) return toast('Erro ao remover logo: ' + errUpd.message, 'erro');
      empresaAtual.logo_url = null;
      aplicarTema(empresaAtual);
      toast('Logo removido.', 'sucesso');
      render(container, state);
    });
  }

  const formCriarUsuario = container.querySelector('#form-criar-usuario');
  if (formCriarUsuario) {
    formCriarUsuario.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = container.querySelector('#novo-nome').value.trim();
      const email = container.querySelector('#novo-email').value.trim();
      const senha = container.querySelector('#novo-senha').value;
      const papel = container.querySelector('#novo-papel').value;
      const btnSubmit = container.querySelector('#btn-criar-usuario');
      btnSubmit.disabled = true;

      const { data, error: errFn } = await supabase.functions.invoke('criar-usuario-empresa', {
        body: { empresaId: empresaAtual.id, email, senha, papel, nome },
      });
      btnSubmit.disabled = false;

      if (errFn) {
        const msg = data?.error || errFn.message;
        return toast('Erro ao cadastrar colaborador: ' + msg, 'erro');
      }
      toast(data.contaNova ? 'Colaborador cadastrado com sucesso.' : 'Já existia conta com esse e-mail; vínculo atualizado.', 'sucesso');
      render(container, state);
    });
  }

  container.querySelectorAll('[data-editar-usuario]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const membro = membros.find((m) => m.usuario_id === btn.dataset.editarUsuario);
      abrirModalEditarUsuario(state, container, membro);
    });
  });

  container.querySelectorAll('[data-alterar-senha]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModalAlterarSenha(state, btn.dataset.alterarSenha));
  });

  container.querySelectorAll('[data-toggle-ativo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ativoAtual = btn.dataset.ativo === 'true';
      const acao = ativoAtual ? 'inativar' : 'reativar';
      if (!(await confirmar(`Confirma ${acao} este colaborador nesta empresa?`))) return;
      const { error: errToggle } = await supabase.rpc('definir_ativo_usuario_empresa', {
        p_empresa_id: empresaAtual.id, p_usuario_id: btn.dataset.toggleAtivo, p_ativo: !ativoAtual,
      });
      if (errToggle) return toast('Erro: ' + errToggle.message, 'erro');
      toast(ativoAtual ? 'Colaborador inativado.' : 'Colaborador reativado.', 'sucesso');
      render(container, state);
    });
  });

  container.querySelectorAll('[data-remover]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Remover o acesso deste usuário a esta empresa?'))) return;
      const { error: errDel } = await supabase.from('usuarios_empresas')
        .delete().eq('usuario_id', btn.dataset.remover).eq('empresa_id', empresaAtual.id);
      if (errDel) return toast('Erro ao remover: ' + errDel.message, 'erro');
      toast('Acesso removido.', 'sucesso');
      render(container, state);
    });
  });
}

function abrirModalEditarUsuario(state, container, membro) {
  const { supabase, empresaAtual, papelAtual, user } = state;
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
          <option value="admin" ${membro.papel === 'admin' ? 'selected' : ''}>Administrador</option>
          ${(ehOrbeex || membro.papel === 'orbeex') ? `<option value="orbeex" ${membro.papel === 'orbeex' ? 'selected' : ''}>ORBEEX</option>` : ''}
        </select>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#form-editar-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = modal.querySelector('#edit-nome').value.trim();
    const papel = modal.querySelector('#edit-papel').value;

    const { error: errNome } = await supabase.functions.invoke('editar-colaborador', {
      body: { empresaId: empresaAtual.id, usuarioId: membro.usuario_id, nome },
    });
    if (errNome) return toast('Erro ao salvar nome: ' + errNome.message, 'erro');

    if (!editandoSiMesmo && papel !== membro.papel) {
      const { error: errPapel } = await supabase.from('usuarios_empresas')
        .update({ papel }).eq('empresa_id', empresaAtual.id).eq('usuario_id', membro.usuario_id);
      if (errPapel) return toast('Nome salvo, mas houve erro ao alterar o papel: ' + errPapel.message, 'erro');
    }

    toast('Usuário atualizado.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}

function abrirModalAlterarSenha(state, usuarioId) {
  const { supabase, empresaAtual } = state;
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
      body: { empresaId: empresaAtual.id, usuarioId, novaSenha },
    });
    if (error) return toast('Erro ao alterar senha: ' + error.message, 'erro');
    toast('Senha alterada com sucesso.', 'sucesso');
    fecharModal();
  });
}
