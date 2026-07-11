import { toast, escapeHtml, confirmar, abrirModal, fecharModal } from '../ui.js';
import { aplicarTema, extrairCoresDoLogo, corTextoIdeal } from '../tema.js';
import { abrirModalNovaEmpresa, MODULOS_SISTEMA } from '../app.js';
import * as historico from './historico.js';
import { abrirSnapshot } from './snapshotViewer.js';

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

  let departamentos = [];
  let modulosRestritos = [];
  let ciclos = [];
  if (podeGerenciar) {
    const [resDeptos, resRestricoes, resCiclos] = await Promise.all([
      supabase.from('departamentos').select('*').eq('empresa_id', empresaAtual.id).order('nome'),
      supabase.from('modulos_restritos').select('*').eq('empresa_id', empresaAtual.id),
      supabase.from('ciclos_pe').select('*').eq('empresa_id', empresaAtual.id).order('ano', { ascending: false }),
    ]);
    departamentos = resDeptos.data || [];
    modulosRestritos = resRestricoes.data || [];
    ciclos = resCiclos.data || [];
  }
  const nomeDeptoPorId = new Map(departamentos.map((d) => [d.id, d.nome]));
  const modulosDisponiveisEmpresa = MODULOS_SISTEMA.filter((m) => (empresaAtual.modulos_habilitados || []).includes(m.id));

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
      <p class="text-muted" style="margin-bottom:1.25rem">Envie o logo do cliente — as cores abaixo são sugeridas automaticamente a partir dele. Você pode ajustar qualquer cor manualmente antes de salvar.</p>
      <form id="form-branding" class="brand-editor">
        <div class="brand-editor-form">
          <div class="brand-logo-upload">
            <label class="brand-logo-preview" id="brand-logo-preview" for="brand-logo" title="Clique para enviar o logo">
              ${empresaAtual.logo_url ? `<img src="${empresaAtual.logo_url}" alt="Logo atual" id="brand-logo-preview-img">` : '<i class="ti ti-photo-up"></i>'}
            </label>
            <div>
              <input type="file" id="brand-logo" accept="image/png,image/jpeg,image/svg+xml">
              <p class="text-muted" style="margin-top:6px;font-size:12px">PNG, JPG ou SVG. Clique na caixa ou no botão para trocar.</p>
            </div>
          </div>

          <div class="brand-swatches">
            <label class="brand-swatch">
              <span class="brand-swatch-dot" id="brand-dot-primaria" style="background:${empresaAtual.cor_primaria || '#252538'}"><input type="color" id="brand-cor-primaria" value="${empresaAtual.cor_primaria || '#252538'}"></span>
              <span class="brand-swatch-label">Cor primária<br><small id="brand-hex-primaria">${(empresaAtual.cor_primaria || '#252538').toUpperCase()}</small></span>
            </label>
            <label class="brand-swatch">
              <span class="brand-swatch-dot" id="brand-dot-destaque" style="background:${empresaAtual.cor_destaque || '#E8B84B'}"><input type="color" id="brand-cor-destaque" value="${empresaAtual.cor_destaque || '#E8B84B'}"></span>
              <span class="brand-swatch-label">Cor de destaque<br><small id="brand-hex-destaque">${(empresaAtual.cor_destaque || '#E8B84B').toUpperCase()}</small></span>
            </label>
            <label class="brand-swatch">
              <span class="brand-swatch-dot brand-swatch-dot-fonte" id="brand-dot-texto" style="background:${empresaAtual.cor_texto || '#ffffff'}"><input type="color" id="brand-cor-texto" value="${empresaAtual.cor_texto || '#ffffff'}"></span>
              <span class="brand-swatch-label">Cor da fonte<br><small id="brand-hex-texto">${(empresaAtual.cor_texto || '#ffffff').toUpperCase()}</small></span>
            </label>
          </div>

          <div class="form-row" style="margin-top:0.5rem">
            <div class="form-group"><button class="btn btn-primary btn-block" type="submit"><i class="ti ti-device-floppy"></i> Salvar identidade visual</button></div>
            ${empresaAtual.logo_url ? '<div class="form-group"><button class="btn btn-secondary btn-block" type="button" id="btn-remover-logo"><i class="ti ti-trash"></i> Remover logo</button></div>' : ''}
          </div>
        </div>

        <div class="brand-editor-preview">
          <p class="brand-preview-titulo">Pré-visualização</p>
          <div class="brand-preview-box">
            <div class="brand-preview-topbar" id="brand-preview-topbar">
              <span class="brand-preview-logo" id="brand-preview-logo">${empresaAtual.logo_url ? `<img src="${empresaAtual.logo_url}" alt="">` : ''}</span>
              <span class="brand-preview-brand" id="brand-preview-brand">${escapeHtml(empresaAtual.nome)}</span>
            </div>
            <div class="brand-preview-card">
              <div class="brand-preview-card-header" id="brand-preview-card-header">Objetivos Estratégicos</div>
              <div class="brand-preview-card-body">Assim ficará o visual do sistema para esta empresa.</div>
            </div>
          </div>
        </div>
      </form>
    </div>
    ` : ''}

    ${podeGerenciar ? `
    <div class="card">
      <div class="card-header"><span><i class="ti ti-sitemap"></i> Departamentos</span></div>
      <p class="text-muted" style="margin-bottom:1rem">Organize os colaboradores por setor. Departamentos também podem ser usados para liberar acesso a módulos específicos (botão "Módulos").</p>
      <form id="form-novo-departamento" class="form-row" style="align-items:end;margin-bottom:1rem">
        <div class="form-group" style="flex:1"><label>Novo departamento</label><input type="text" id="novo-departamento-nome" placeholder="Ex: Comercial, Produção, Qualidade..." required></div>
        <div class="form-group"><button class="btn btn-secondary" type="submit"><i class="ti ti-plus"></i> Adicionar</button></div>
      </form>
      ${departamentos.length ? `
        <table class="table">
          <thead><tr><th>Departamento</th><th>Colaboradores</th><th>Módulos liberados</th><th></th></tr></thead>
          <tbody>
            ${departamentos.map((d) => {
              const qtd = membros.filter((m) => m.departamento_id === d.id).length;
              const restricoesDepto = modulosRestritos.filter((r) => r.departamento_id === d.id);
              return `
              <tr>
                <td><strong>${escapeHtml(d.nome)}</strong></td>
                <td>${qtd}</td>
                <td>${restricoesDepto.length ? `<span class="badge badge-neutral">${restricoesDepto.length} de ${modulosDisponiveisEmpresa.length}</span>` : '<span class="text-muted">Todos (sem restrição)</span>'}</td>
                <td class="table-actions">
                  <button class="icon-btn" data-modulos-depto="${d.id}" title="Configurar módulos"><i class="ti ti-apps"></i></button>
                  <button class="icon-btn" data-excluir-depto="${d.id}" title="Excluir departamento"><i class="ti ti-trash"></i></button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : '<div class="empty-state"><i class="ti ti-sitemap"></i>Nenhum departamento cadastrado.</div>'}
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
            <label>Departamento</label>
            <select id="novo-departamento">
              <option value="">—</option>
              ${departamentos.map((d) => `<option value="${d.id}">${escapeHtml(d.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <button class="btn btn-primary btn-block" type="submit" id="btn-criar-usuario"><i class="ti ti-user-plus"></i> Cadastrar colaborador</button>
          </div>
        </form>
        <hr class="sep">
      ` : ''}
      <table class="table">
        <thead><tr><th>Nome</th><th>Papel</th><th>Departamento</th><th>Status</th>${podeGerenciar ? '<th></th>' : ''}</tr></thead>
        <tbody>
          ${membros.map((m) => `
            <tr>
              <td>${escapeHtml(m.nome || m.email)}</td>
              <td><span class="badge badge-neutral">${PAPEL_LABEL[m.papel]}</span></td>
              <td>${escapeHtml(nomeDeptoPorId.get(m.departamento_id) || '—')}</td>
              <td><span class="badge ${m.ativo ? 'badge-success' : 'badge-danger'}">${m.ativo ? 'Ativo' : 'Inativo'}</span></td>
              ${podeGerenciar ? `<td class="table-actions">
                <button class="icon-btn" data-editar-usuario="${m.usuario_id}" title="Editar colaborador"><i class="ti ti-pencil"></i></button>
                <button class="icon-btn" data-modulos-usuario="${m.usuario_id}" data-nome-usuario="${escapeHtml(m.nome || m.email)}" title="Configurar módulos deste colaborador"><i class="ti ti-apps"></i></button>
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

    ${podeGerenciar ? `
    <div class="card">
      <div class="card-header"><span><i class="ti ti-calendar-event"></i> Ciclos do Planejamento Estratégico</span></div>
      <p class="text-muted" style="margin-bottom:1rem">Fechar o ano tira uma fotografia congelada (somente leitura) de objetivos, indicadores, planos de ação, contexto e riscos — sem apagar ou travar os dados vivos, que continuam sendo usados normalmente no ciclo seguinte.</p>
      <button class="btn btn-primary btn-sm" id="btn-fechar-ano"><i class="ti ti-lock"></i> Fechar ano ${new Date().getFullYear()}</button>
      ${ciclos.length ? `
        <table class="table" style="margin-top:1rem">
          <thead><tr><th>Ano</th><th>Fechado em</th><th></th></tr></thead>
          <tbody>
            ${ciclos.map((c) => `<tr><td><strong>${c.ano}</strong></td><td>${new Date(c.fechado_em).toLocaleString('pt-BR')}</td><td class="table-actions"><button class="icon-btn" data-ver-ciclo="${c.id}" title="Ver conteúdo deste ano fechado"><i class="ti ti-eye"></i></button></td></tr>`).join('')}
          </tbody>
        </table>` : '<p class="text-muted" style="margin-top:1rem">Nenhum ano fechado ainda.</p>'}
    </div>
    ` : ''}

    ${podeGerenciar ? '<div id="area-historico"></div>' : ''}
  `;

  const areaHistorico = container.querySelector('#area-historico');
  if (areaHistorico) historico.render(areaHistorico, state);

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
    // Atualiza os textos de hex, os pontinhos de cor e a pré-visualização em tempo real conforme
    // o usuário mexe nos seletores de cor ou troca o logo — sem precisar salvar para ver o resultado.
    function atualizarPreviaBranding() {
      const corPrimaria = container.querySelector('#brand-cor-primaria').value;
      const corDestaque = container.querySelector('#brand-cor-destaque').value;
      const corTexto = container.querySelector('#brand-cor-texto').value;

      container.querySelector('#brand-dot-primaria').style.background = corPrimaria;
      container.querySelector('#brand-dot-destaque').style.background = corDestaque;
      container.querySelector('#brand-dot-texto').style.background = corTexto;
      container.querySelector('#brand-hex-primaria').textContent = corPrimaria.toUpperCase();
      container.querySelector('#brand-hex-destaque').textContent = corDestaque.toUpperCase();
      container.querySelector('#brand-hex-texto').textContent = corTexto.toUpperCase();

      const topbar = container.querySelector('#brand-preview-topbar');
      topbar.style.background = corPrimaria;
      container.querySelector('#brand-preview-brand').style.color = corTexto;
      const header = container.querySelector('#brand-preview-card-header');
      header.style.color = corPrimaria;
      header.style.borderBottomColor = corDestaque;
    }

    formBranding.querySelectorAll('#brand-cor-primaria, #brand-cor-destaque, #brand-cor-texto').forEach((input) => {
      input.addEventListener('input', atualizarPreviaBranding);
    });
    atualizarPreviaBranding();

    // Ao trocar o logo, sugere automaticamente a cor primária e de destaque a partir da imagem
    // (mesma extração usada na criação de empresa) e calcula uma cor de fonte com bom contraste —
    // tudo ainda editável manualmente pelos seletores de cor logo abaixo.
    const inputLogo = container.querySelector('#brand-logo');
    inputLogo.addEventListener('change', async () => {
      const arquivo = inputLogo.files[0];
      if (!arquivo) return;

      const preview = container.querySelector('#brand-logo-preview');
      preview.innerHTML = `<img src="${URL.createObjectURL(arquivo)}" alt="Novo logo">`;
      const previewLogoMini = container.querySelector('#brand-preview-logo');
      previewLogoMini.innerHTML = `<img src="${URL.createObjectURL(arquivo)}" alt="">`;

      const cores = await extrairCoresDoLogo(arquivo);
      if (cores) {
        container.querySelector('#brand-cor-primaria').value = cores.corPrimaria;
        container.querySelector('#brand-cor-destaque').value = cores.corDestaque;
        container.querySelector('#brand-cor-texto').value = corTextoIdeal(cores.corPrimaria);
        atualizarPreviaBranding();
        toast('Cores sugeridas a partir do logo — ajuste se quiser antes de salvar.', 'sucesso');
      }
    });

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

  const formNovoDepartamento = container.querySelector('#form-novo-departamento');
  if (formNovoDepartamento) {
    formNovoDepartamento.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = container.querySelector('#novo-departamento-nome').value.trim();
      const { error: errDepto } = await supabase.from('departamentos').insert({ empresa_id: empresaAtual.id, nome });
      if (errDepto) return toast('Erro ao criar departamento: ' + errDepto.message, 'erro');
      toast('Departamento criado.', 'sucesso');
      render(container, state);
    });
  }

  container.querySelectorAll('[data-excluir-depto]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Excluir este departamento? Colaboradores vinculados ficam sem departamento.'))) return;
      const { error: errDel } = await supabase.from('departamentos').delete().eq('id', btn.dataset.excluirDepto);
      if (errDel) return toast('Erro ao excluir: ' + errDel.message, 'erro');
      toast('Departamento excluído.', 'sucesso');
      render(container, state);
    });
  });

  container.querySelectorAll('[data-modulos-depto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const depto = departamentos.find((d) => d.id === btn.dataset.modulosDepto);
      const jaConfigurado = new Set(modulosRestritos.filter((r) => r.departamento_id === depto.id).map((r) => r.modulo_id));
      abrirModalModulosPermitidos(state, container, {
        titulo: `Módulos — Departamento "${depto.nome}"`,
        modulosDisponiveis: modulosDisponiveisEmpresa,
        jaConfigurado,
        aoSalvar: async (idsPermitidos) => {
          await supabase.from('modulos_restritos').delete().eq('departamento_id', depto.id);
          if (idsPermitidos) {
            await supabase.from('modulos_restritos').insert(idsPermitidos.map((modulo_id) => ({ empresa_id: empresaAtual.id, departamento_id: depto.id, modulo_id })));
          }
        },
      });
    });
  });

  container.querySelectorAll('[data-modulos-usuario]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const usuarioId = btn.dataset.modulosUsuario;
      const jaConfigurado = new Set(modulosRestritos.filter((r) => r.usuario_id === usuarioId).map((r) => r.modulo_id));
      abrirModalModulosPermitidos(state, container, {
        titulo: `Módulos — ${btn.dataset.nomeUsuario}`,
        modulosDisponiveis: modulosDisponiveisEmpresa,
        jaConfigurado,
        aoSalvar: async (idsPermitidos) => {
          await supabase.from('modulos_restritos').delete().eq('usuario_id', usuarioId).eq('empresa_id', empresaAtual.id);
          if (idsPermitidos) {
            await supabase.from('modulos_restritos').insert(idsPermitidos.map((modulo_id) => ({ empresa_id: empresaAtual.id, usuario_id: usuarioId, modulo_id })));
          }
        },
      });
    });
  });

  const btnFecharAno = container.querySelector('#btn-fechar-ano');
  if (btnFecharAno) {
    btnFecharAno.addEventListener('click', async () => {
      const ano = new Date().getFullYear();
      if (!(await confirmar(`Fechar o ano ${ano}? Isso salva uma fotografia congelada do Planejamento Estratégico atual. Os dados vivos continuam editáveis normalmente.`))) return;
      const { error: errFechar } = await supabase.rpc('fechar_ciclo_pe', { p_empresa_id: empresaAtual.id, p_ano: ano });
      if (errFechar) return toast('Erro ao fechar o ano: ' + errFechar.message, 'erro');
      toast(`Ano ${ano} fechado com sucesso.`, 'sucesso');
      render(container, state);
    });
  }

  container.querySelectorAll('[data-ver-ciclo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ciclo = ciclos.find((c) => c.id === btn.dataset.verCiclo);
      if (ciclo) abrirSnapshot(state, ciclo);
    });
  });

  const formCriarUsuario = container.querySelector('#form-criar-usuario');
  if (formCriarUsuario) {
    formCriarUsuario.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = container.querySelector('#novo-nome').value.trim();
      const email = container.querySelector('#novo-email').value.trim();
      const senha = container.querySelector('#novo-senha').value;
      const papel = container.querySelector('#novo-papel').value;
      const departamentoId = container.querySelector('#novo-departamento').value || null;
      const btnSubmit = container.querySelector('#btn-criar-usuario');
      btnSubmit.disabled = true;

      const { data, error: errFn } = await supabase.functions.invoke('criar-usuario-empresa', {
        body: { empresaId: empresaAtual.id, email, senha, papel, nome, departamentoId },
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
      abrirModalEditarUsuario(state, container, membro, departamentos);
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

function abrirModalEditarUsuario(state, container, membro, departamentos = []) {
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
      <div class="form-group">
        <label>Departamento</label>
        <select id="edit-departamento">
          <option value="">—</option>
          ${departamentos.map((d) => `<option value="${d.id}" ${membro.departamento_id === d.id ? 'selected' : ''}>${escapeHtml(d.nome)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Salvar</button>
    </form>
  `);

  modal.querySelector('#form-editar-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = modal.querySelector('#edit-nome').value.trim();
    const papel = modal.querySelector('#edit-papel').value;
    const departamentoId = modal.querySelector('#edit-departamento').value || null;

    const { error: errNome } = await supabase.functions.invoke('editar-colaborador', {
      body: { empresaId: empresaAtual.id, usuarioId: membro.usuario_id, nome },
    });
    if (errNome) return toast('Erro ao salvar nome: ' + errNome.message, 'erro');

    if (!editandoSiMesmo && papel !== membro.papel) {
      const { error: errPapel } = await supabase.from('usuarios_empresas')
        .update({ papel }).eq('empresa_id', empresaAtual.id).eq('usuario_id', membro.usuario_id);
      if (errPapel) return toast('Nome salvo, mas houve erro ao alterar o papel: ' + errPapel.message, 'erro');
    }

    if (departamentoId !== membro.departamento_id) {
      const { error: errDepto } = await supabase.from('usuarios_empresas')
        .update({ departamento_id: departamentoId }).eq('empresa_id', empresaAtual.id).eq('usuario_id', membro.usuario_id);
      if (errDepto) return toast('Salvo, mas houve erro ao definir o departamento: ' + errDepto.message, 'erro');
    }

    toast('Usuário atualizado.', 'sucesso');
    fecharModal();
    render(container, state);
  });
}

// Modal reutilizável para configurar a lista de módulos permitidos de um departamento ou usuário
// específico (ver tabela modulos_restritos). `jaConfigurado` é o Set de módulos já liberados;
// se vazio, o toggle "restringir" começa desligado (comportamento padrão: sem restrição).
function abrirModalModulosPermitidos(state, container, { titulo, modulosDisponiveis, jaConfigurado, aoSalvar }) {
  const restricaoAtiva = jaConfigurado.size > 0;

  const modal = abrirModal(titulo, `
    <form id="form-modulos-permitidos">
      <label class="checkbox-linha" style="margin-bottom:1rem;display:flex;align-items:center;gap:8px">
        <input type="checkbox" id="mp-restringir" ${restricaoAtiva ? 'checked' : ''}>
        <span>Restringir acesso a módulos específicos</span>
      </label>
      <div id="mp-lista" style="display:${restricaoAtiva ? '' : 'none'};display:flex;flex-direction:column;gap:8px">
        ${modulosDisponiveis.length ? modulosDisponiveis.map((m) => `
          <label style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" class="mp-modulo" value="${m.id}" ${jaConfigurado.has(m.id) ? 'checked' : ''}>
            <i class="ti ${m.icone}"></i> ${escapeHtml(m.nome)}
          </label>
        `).join('') : '<p class="text-muted">Nenhum módulo habilitado para esta empresa ainda.</p>'}
      </div>
      <p class="text-muted" style="margin-top:1rem;font-size:12px">Sem restrição, o acesso segue os módulos habilitados para toda a empresa (Permissões).</p>
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:1rem">Salvar</button>
    </form>
  `);

  modal.querySelector('#mp-restringir').addEventListener('change', (e) => {
    modal.querySelector('#mp-lista').style.display = e.target.checked ? 'flex' : 'none';
  });

  modal.querySelector('#form-modulos-permitidos').addEventListener('submit', async (e) => {
    e.preventDefault();
    const restringir = modal.querySelector('#mp-restringir').checked;
    if (!restringir) {
      await aoSalvar(null);
      toast('Restrição removida — acesso volta ao padrão da empresa.', 'sucesso');
      fecharModal();
      render(container, state);
      return;
    }
    const selecionados = [...modal.querySelectorAll('.mp-modulo:checked')].map((c) => c.value);
    if (!selecionados.length) return toast('Selecione pelo menos um módulo, ou desmarque "Restringir".', 'erro');
    await aoSalvar(selecionados);
    toast('Módulos permitidos atualizados.', 'sucesso');
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
