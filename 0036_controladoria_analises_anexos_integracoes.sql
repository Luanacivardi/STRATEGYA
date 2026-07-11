import { supabase } from './supabaseClient.js';
import { toast, abrirModal, fecharModal, escapeHtml } from './ui.js';
import { aplicarTema, extrairCoresDoLogo, corTextoIdeal } from './tema.js';
import * as dashboard from './modules/dashboard.js';
import * as contexto from './modules/contexto.js';
import * as objetivos from './modules/objetivos.js';
import * as planosAcao from './modules/planosAcao.js';
import * as indicadores from './modules/indicadores.js';
import * as atasReuniao from './modules/atasReuniao.js';
import * as riscos from './modules/riscosOportunidades.js';
import * as controladoria from './modules/controladoria.js';
import * as empresaUsuarios from './modules/empresaUsuarios.js';
import * as permissoes from './modules/permissoes.js';

export const state = {
  supabase,
  user: null,
  empresas: [],
  empresaAtual: null,
  papelAtual: null,
};

// Abas internas do módulo Planejamento Estratégico
// (Partes Interessadas virou grupo dentro de Contexto; Mapa Estratégico foi unificado com Objetivos;
// Ações virou módulo próprio — ver MODULOS_SIMPLES)
const TABS_PLANEJAMENTO = { dashboard, contexto, objetivos, indicadores, atas: atasReuniao };
let tabAtiva = 'dashboard';

// Módulos que têm uma única tela (sem abas internas), renderizados direto em #area-modulo-simples
const MODULOS_SIMPLES = { 'riscos-oportunidades': riscos, 'acoes': planosAcao, 'controladoria': controladoria };

// Módulos do sistema — "planejamento-estrategico" e "riscos-oportunidades" já implementados;
// os demais aparecem no menu como "em breve" para deixar a estrutura do SGI visível.
export const MODULOS_SISTEMA = [
  { id: 'planejamento-estrategico', nome: 'Planejamento Estratégico', icone: 'ti-target-arrow', disponivel: true,
    descricao: 'Contexto (SWOT, partes interessadas, missão/visão/valores, macrofluxo), mapa BSC, objetivos, indicadores e atas de reunião.' },
  { id: 'acoes', nome: 'Ações', icone: 'ti-list-check', disponivel: true,
    descricao: 'Planos de ação e tarefas vinculados a objetivos, indicadores, riscos, não conformidades e atas de reunião.' },
  { id: 'riscos-oportunidades', nome: 'Riscos e Oportunidades', icone: 'ti-alert-triangle', disponivel: true,
    descricao: 'Identificação e tratamento de riscos e oportunidades, com matriz de probabilidade x impacto.' },
  { id: 'controladoria', nome: 'Controladoria', icone: 'ti-report-money', disponivel: true,
    descricao: 'Cadastro de contas gerenciais, com categoria, área responsável, responsável pela análise e metas mensal/anual.' },
  { id: 'documentos', nome: 'Documentos', icone: 'ti-file-text', disponivel: false,
    descricao: 'Controle de documentos e registros da qualidade.',
    teaser: 'Nunca mais perca a versão certa de um documento.' },
  { id: 'nao-conformidades', nome: 'Não Conformidades', icone: 'ti-alert-octagon', disponivel: false,
    descricao: 'Registro e tratamento de não conformidades e ações corretivas.',
    teaser: 'Transforme problemas recorrentes em ações que resolvem de vez.' },
  { id: 'auditorias', nome: 'Auditorias', icone: 'ti-clipboard-check', disponivel: false,
    descricao: 'Planejamento e execução de auditorias internas.',
    teaser: 'Audite com método — e sem planilha perdida.' },
  { id: 'treinamentos', nome: 'Treinamentos', icone: 'ti-school', disponivel: false,
    descricao: 'Gestão de treinamentos e competências da equipe.',
    teaser: 'Saiba exatamente quem já foi treinado — e quem ainda precisa.' },
];
let moduloAtivo = 'planejamento-estrategico';
let viewAtual = 'home'; // 'home' | 'modulo' | 'config'

// Iniciais para o avatar da topbar: 2 letras do nome ("Luana Civardi" -> "LC"), ou a primeira do e-mail se não houver nome.
function iniciais(nomeOuEmail) {
  const partes = nomeOuEmail.split('@')[0].trim().split(/[\s.]+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return (partes[0] || '?').slice(0, 2).toUpperCase();
}

// ---------- AUTH ----------
const viewLoading = document.getElementById('view-loading');
const viewLogin = document.getElementById('view-login');
const viewApp = document.getElementById('view-app');
const viewRedefinirSenha = document.getElementById('view-redefinir-senha');
const formLogin = document.getElementById('form-login');
const loginErro = document.getElementById('login-erro');
const btnToggleCadastro = document.getElementById('btn-toggle-cadastro');
const btnLoginSubmit = document.getElementById('btn-login-submit');
let modoCadastro = false;

// Alterna a visibilidade dos campos de senha (login e redefinição)
document.querySelectorAll('[data-toggle-senha]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.toggleSenha);
    const mostrando = input.type === 'text';
    input.type = mostrando ? 'password' : 'text';
    btn.innerHTML = mostrando ? '<i class="ti ti-eye"></i>' : '<i class="ti ti-eye-off"></i>';
    btn.setAttribute('aria-label', mostrando ? 'Mostrar senha' : 'Ocultar senha');
  });
});

document.getElementById('btn-esqueci-senha').addEventListener('click', () => {
  const modal = abrirModal('Recuperar senha', `
    <form id="form-esqueci-senha">
      <div class="form-group">
        <label>E-mail cadastrado</label>
        <input type="email" id="esqueci-email" required>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Enviar link de recuperação</button>
    </form>
  `);
  modal.querySelector('#form-esqueci-senha').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = modal.querySelector('#esqueci-email').value.trim();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    if (error) return toast('Erro ao enviar e-mail de recuperação: ' + error.message, 'erro');
    toast('Se esse e-mail estiver cadastrado, você vai receber um link para redefinir a senha.', 'sucesso');
    fecharModal();
  });
});

document.getElementById('form-redefinir-senha').addEventListener('submit', async (e) => {
  e.preventDefault();
  const erroBox = document.getElementById('redefinir-erro');
  erroBox.style.display = 'none';
  const novaSenha = document.getElementById('redefinir-senha').value;
  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) {
    erroBox.textContent = error.message;
    erroBox.style.display = 'flex';
    return;
  }
  toast('Senha redefinida com sucesso. Faça login novamente.', 'sucesso');
  await supabase.auth.signOut();
  viewRedefinirSenha.style.display = 'none';
  viewLogin.style.display = 'flex';
});

btnToggleCadastro.addEventListener('click', () => {
  modoCadastro = !modoCadastro;
  btnLoginSubmit.textContent = modoCadastro ? 'Criar conta' : 'Entrar';
  btnToggleCadastro.textContent = modoCadastro ? 'Já tenho conta' : 'Criar conta';
  loginErro.style.display = 'none';
});

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginErro.style.display = 'none';
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const textoOriginal = btnLoginSubmit.textContent;
  btnLoginSubmit.disabled = true;
  btnLoginSubmit.textContent = modoCadastro ? 'Criando conta...' : 'Entrando...';
  try {
    const { error } = modoCadastro
      ? await supabase.auth.signUp({ email, password: senha })
      : await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
    if (modoCadastro) {
      toast('Conta criada! Verifique seu e-mail se a confirmação estiver ativa.', 'sucesso');
    }
  } catch (err) {
    loginErro.textContent = err.message || 'Erro ao autenticar.';
    loginErro.style.display = 'flex';
  } finally {
    btnLoginSubmit.disabled = false;
    btnLoginSubmit.textContent = textoOriginal;
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabase.auth.signOut();
});

supabase.auth.onAuthStateChange((event, session) => {
  viewLoading.style.display = 'none';

  if (event === 'PASSWORD_RECOVERY') {
    viewLogin.style.display = 'none';
    viewApp.style.display = 'none';
    viewRedefinirSenha.style.display = 'flex';
    return;
  }

  state.user = session?.user || null;
  if (state.user) {
    viewLogin.style.display = 'none';
    viewApp.style.display = 'block';
    const nomeExibicao = state.user.user_metadata?.nome || state.user.email;
    document.getElementById('topbar-user').textContent = nomeExibicao;
    document.getElementById('topbar-avatar').textContent = iniciais(nomeExibicao);
    carregarEmpresas();
  } else {
    viewApp.style.display = 'none';
    viewLogin.style.display = 'flex';
    aplicarTema(null);
  }
});

// ---------- EMPRESAS ----------
const empresaSelect = document.getElementById('empresa-select');
const semEmpresaBox = document.getElementById('sem-empresa');
const appLayout = document.getElementById('app-layout');
const empresaNomeTitulo = document.getElementById('empresa-nome-titulo');
const moduloNomeSubtitulo = document.getElementById('modulo-nome-subtitulo');
const areaHome = document.getElementById('area-home');
const areaModulo = document.getElementById('area-modulo');
const areaModuloSimples = document.getElementById('area-modulo-simples');
const areaConfig = document.getElementById('area-config');
const areaPermissoes = document.getElementById('area-permissoes');
const modPlaceholder = document.getElementById('modulo-placeholder');
const btnPermissoes = document.getElementById('btn-permissoes');

async function carregarEmpresas() {
  const { data, error } = await supabase
    .from('usuarios_empresas')
    .select('papel, departamento_id, empresas(id, nome, cnpj, cor_primaria, cor_destaque, cor_texto, logo_url, modulos_habilitados)')
    .eq('usuario_id', state.user.id);

  if (error) {
    toast('Erro ao carregar empresas: ' + error.message, 'erro');
    return;
  }

  state.empresas = (data || [])
    .filter((v) => v.empresas)
    .map((v) => ({ ...v.empresas, papel: v.papel, departamentoId: v.departamento_id }));

  state.ehOrbeex = state.empresas.some((e) => e.papel === 'orbeex');
  btnPermissoes.style.display = state.ehOrbeex ? '' : 'none';

  empresaSelect.innerHTML = state.empresas
    .map((emp) => `<option value="${emp.id}">${emp.nome}</option>`)
    .join('');

  if (state.empresas.length === 0) {
    semEmpresaBox.style.display = 'flex';
    appLayout.style.display = 'none';
    empresaNomeTitulo.textContent = '—';
    aplicarTema(null);
    return;
  }

  semEmpresaBox.style.display = 'none';
  appLayout.style.display = 'flex';

  const idPersistido = localStorage.getItem('pe_empresa_atual');
  const encontrada = state.empresas.find((e) => e.id === idPersistido);
  selecionarEmpresa((encontrada || state.empresas[0]).id);
}

// Nível de permissão de edição do usuário nesta empresa (Fase 16 revisada): orbeex/admin sempre
// 'total'; para papel 'usuario', busca em permissoes_edicao — prioridade para configuração pessoal,
// depois a do departamento, e por padrão 'leitura' quando nada foi configurado. Usado por cada
// módulo para decidir o que pode ser criado/editado/excluído (ver nivel_edicao_usuario no banco,
// que reforça a mesma regra via RLS).
async function carregarNivelEdicao(empresaId, departamentoId) {
  if (state.papelAtual !== 'usuario') {
    state.nivelEdicao = 'total';
    return;
  }
  const { data: doUsuario } = await supabase.from('permissoes_edicao').select('nivel').eq('empresa_id', empresaId).eq('usuario_id', state.user.id).maybeSingle();
  if (doUsuario) {
    state.nivelEdicao = doUsuario.nivel;
    return;
  }
  if (departamentoId) {
    const { data: doDepto } = await supabase.from('permissoes_edicao').select('nivel').eq('departamento_id', departamentoId).maybeSingle();
    if (doDepto) {
      state.nivelEdicao = doDepto.nivel;
      return;
    }
  }
  state.nivelEdicao = 'leitura';
}

async function selecionarEmpresa(empresaId) {
  const emp = state.empresas.find((e) => e.id === empresaId);
  if (!emp) return;
  state.empresaAtual = emp;
  state.papelAtual = emp.papel;
  empresaSelect.value = emp.id;
  empresaNomeTitulo.textContent = emp.nome;
  localStorage.setItem('pe_empresa_atual', emp.id);
  aplicarTema(emp);
  atualizarCabecalhoImpressao(emp);
  await carregarNivelEdicao(emp.id, emp.departamentoId);
  renderModuleRail();
  renderConteudoAtivo();
}

// Timbre usado em todas as impressões (Contexto, Atas, Tarefas...): logo e dados da empresa
// selecionada, com a marca STRATEGYA by ORBEEX sempre presente no canto.
function atualizarCabecalhoImpressao(emp) {
  const el = document.getElementById('print-letterhead');
  if (!el) return;
  if (!emp) { el.innerHTML = ''; return; }
  el.innerHTML = `
    ${emp.logo_url ? `<img src="${emp.logo_url}" alt="Logo ${escapeHtml(emp.nome)}">` : ''}
    <div>
      <div class="plt-empresa-nome">${escapeHtml(emp.nome)}</div>
      ${emp.cnpj ? `<div class="plt-sub">CNPJ: ${escapeHtml(emp.cnpj)}</div>` : ''}
      <div class="plt-sub">Emitido em ${new Date().toLocaleDateString('pt-BR')}</div>
    </div>
    <div class="plt-brand">STRATEGYA<span>by ORBEEX</span></div>
  `;
}

empresaSelect.addEventListener('change', (e) => selecionarEmpresa(e.target.value));

// "Nova empresa" fica disponível só dentro de Configurações, e só para quem tem papel ORBEEX (ver empresaUsuarios.js).
function abrirModalNovaEmpresa() {
  const modal = abrirModal('Nova empresa', `
    <form id="form-nova-empresa">
      <div class="form-group">
        <label>Nome da empresa</label>
        <input type="text" id="ne-nome" required>
      </div>
      <div class="form-group">
        <label>CNPJ (opcional)</label>
        <input type="text" id="ne-cnpj">
      </div>
      <hr class="sep">
      <p class="text-muted" style="margin-bottom:10px">Personalização (opcional). Envie o logo e as cores abaixo são sugeridas automaticamente a partir dele.</p>
      <div class="form-group">
        <label>Logo</label>
        <input type="file" id="ne-logo" accept="image/png,image/jpeg,image/svg+xml">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Cor primária</label>
          <input type="color" id="ne-cor-primaria" value="#252538">
        </div>
        <div class="form-group">
          <label>Cor de destaque</label>
          <input type="color" id="ne-cor-destaque" value="#E8B84B">
        </div>
        <div class="form-group">
          <label>Cor da fonte</label>
          <input type="color" id="ne-cor-texto" value="#ffffff">
        </div>
      </div>
      <button class="btn btn-primary btn-block" type="submit" id="btn-criar-empresa">Criar empresa</button>
    </form>
  `);

  modal.querySelector('#ne-logo').addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    const cores = await extrairCoresDoLogo(arquivo);
    if (cores) {
      modal.querySelector('#ne-cor-primaria').value = cores.corPrimaria;
      modal.querySelector('#ne-cor-destaque').value = cores.corDestaque;
      modal.querySelector('#ne-cor-texto').value = corTextoIdeal(cores.corPrimaria);
    }
  });

  modal.querySelector('#form-nova-empresa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = modal.querySelector('#ne-nome').value.trim();
    const cnpj = modal.querySelector('#ne-cnpj').value.trim() || null;
    const corPrimaria = modal.querySelector('#ne-cor-primaria').value;
    const corDestaque = modal.querySelector('#ne-cor-destaque').value;
    const corTexto = modal.querySelector('#ne-cor-texto').value;
    const arquivo = modal.querySelector('#ne-logo').files[0];
    const btnSubmit = modal.querySelector('#btn-criar-empresa');
    btnSubmit.disabled = true;

    const { data: novaEmpresa, error: errCriar } = await supabase.rpc('criar_empresa', { p_nome: nome, p_cnpj: cnpj });
    if (errCriar) {
      toast('Erro ao criar empresa: ' + errCriar.message, 'erro');
      btnSubmit.disabled = false;
      return;
    }

    let logoUrl = null;
    if (arquivo) {
      const ext = arquivo.name.split('.').pop();
      const caminho = `${novaEmpresa.id}/logo.${ext}`;
      const { error: errUpload } = await supabase.storage.from('logos-empresas').upload(caminho, arquivo, { upsert: true, cacheControl: '3600' });
      if (errUpload) {
        toast('Empresa criada, mas houve erro ao enviar o logo: ' + errUpload.message, 'erro');
      } else {
        const { data: pub } = supabase.storage.from('logos-empresas').getPublicUrl(caminho);
        logoUrl = `${pub.publicUrl}?t=${Date.now()}`;
      }
    }

    const { error: errUpd } = await supabase.from('empresas')
      .update({ cor_primaria: corPrimaria, cor_destaque: corDestaque, cor_texto: corTexto, logo_url: logoUrl })
      .eq('id', novaEmpresa.id);
    if (errUpd) toast('Erro ao salvar personalização: ' + errUpd.message, 'erro');

    toast('Empresa criada com sucesso.', 'sucesso');
    fecharModal();
    await carregarEmpresas();
  });
}

// Cada empresa tem sua própria lista de módulos habilitados (definida em Permissões, só por ORBEEX).
// Módulos ainda não implementados (disponivel: false), mesmo que habilitados para a empresa,
// levam a um placeholder "em construção".
function moduloHabilitadoParaEmpresa(moduloId) {
  return (state.empresaAtual?.modulos_habilitados || []).includes(moduloId);
}

// ---------- MÓDULOS (sidebar) ----------
const moduleRail = document.getElementById('module-rail');

function renderModuleRail() {
  moduleRail.innerHTML = '<div class="module-rail-title">Módulos</div>' + MODULOS_SISTEMA.map((m) => {
    const disp = moduloHabilitadoParaEmpresa(m.id);
    return `
    <button class="module-item ${m.id === moduloAtivo && viewAtual === 'modulo' ? 'active' : ''} ${disp ? '' : 'disabled'}"
      data-modulo="${m.id}" ${disp ? '' : 'disabled'}>
      <i class="ti ${m.icone}"></i>
      <span>${m.nome}</span>
    </button>
  `;
  }).join('');

  moduleRail.querySelectorAll('[data-modulo]:not(:disabled)').forEach((btn) => {
    btn.addEventListener('click', () => {
      moduloAtivo = btn.dataset.modulo;
      viewAtual = 'modulo';
      renderModuleRail();
      renderConteudoAtivo();
    });
  });
}

// ---------- HOME ----------
document.getElementById('topbar-home-link').addEventListener('click', (e) => {
  e.preventDefault();
  if (!state.empresaAtual) return;
  viewAtual = 'home';
  renderModuleRail();
  renderConteudoAtivo();
});

function renderHome() {
  const disponiveis = MODULOS_SISTEMA.filter((m) => moduloHabilitadoParaEmpresa(m.id));
  const emBreve = MODULOS_SISTEMA.filter((m) => !moduloHabilitadoParaEmpresa(m.id));

  const cardHtml = (m) => {
    const disp = moduloHabilitadoParaEmpresa(m.id);
    return `
    <div class="home-card ${disp ? '' : 'em-breve'}" ${disp ? `data-modulo-home="${m.id}"` : ''}>
      <div class="home-card-icon"><i class="ti ${m.icone}"></i></div>
      <div class="home-card-nome">${m.nome}</div>
      <div class="home-card-desc">${disp ? m.descricao : (m.teaser || m.descricao)}</div>
    </div>
  `;
  };

  document.getElementById('home-grid-disponiveis').innerHTML = disponiveis.map(cardHtml).join('');
  document.getElementById('home-grid-embreve').innerHTML = emBreve.map(cardHtml).join('');

  document.querySelectorAll('[data-modulo-home]').forEach((card) => {
    card.addEventListener('click', () => {
      moduloAtivo = card.dataset.moduloHome;
      viewAtual = 'modulo';
      renderModuleRail();
      renderConteudoAtivo();
    });
  });
}

// ---------- CONFIGURAÇÕES (Empresa & Usuários) ----------
document.getElementById('btn-config').addEventListener('click', () => {
  if (!state.empresaAtual) return;
  viewAtual = 'config';
  renderModuleRail();
  renderConteudoAtivo();
});

// ---------- PERMISSÕES (somente ORBEEX) ----------
btnPermissoes.addEventListener('click', () => {
  if (!state.ehOrbeex) return;
  viewAtual = 'permissoes';
  renderModuleRail();
  renderConteudoAtivo();
});

// ---------- ABAS DO MÓDULO PLANEJAMENTO ESTRATÉGICO ----------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    tabAtiva = btn.dataset.tab;
    if (tabAtiva === 'indicadores') indicadores.filtrarPorObjetivo(null);
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.toggle('active', c.id === `tab-${tabAtiva}`));
    renderConteudoAtivo();
  });
});

async function renderConteudoAtivo() {
  if (!state.empresaAtual) return;

  // Segurança: se uma impressão de seção (ex: ata individual) ficou "presa" por algum motivo
  // (o navegador não disparou "afterprint"), qualquer navegação normal já limpa o estado,
  // evitando que a próxima impressão (ex: Tarefas) saia em branco.
  document.body.classList.remove('imprimindo-secao');

  areaHome.style.display = 'none';
  areaModulo.style.display = 'none';
  areaModuloSimples.style.display = 'none';
  modPlaceholder.style.display = 'none';
  areaConfig.style.display = 'none';
  areaPermissoes.style.display = 'none';
  moduleRail.style.display = (viewAtual === 'home' || viewAtual === 'permissoes') ? 'none' : '';

  if (viewAtual === 'home') {
    areaHome.style.display = 'block';
    moduloNomeSubtitulo.textContent = 'Início';
    renderHome();
    return;
  }

  if (viewAtual === 'config') {
    areaConfig.style.display = 'block';
    moduloNomeSubtitulo.textContent = 'Empresa e Usuários';
    empresaUsuarios.render(areaConfig, state);
    return;
  }

  if (viewAtual === 'permissoes') {
    if (!state.ehOrbeex) { viewAtual = 'home'; return renderConteudoAtivo(); }
    areaPermissoes.style.display = 'block';
    moduloNomeSubtitulo.textContent = 'Permissões';
    permissoes.render(areaPermissoes, state);
    return;
  }

  const modInfo = MODULOS_SISTEMA.find((m) => m.id === moduloAtivo);
  moduloNomeSubtitulo.textContent = modInfo ? modInfo.nome : '';

  if (moduloAtivo === 'planejamento-estrategico') {
    areaModulo.style.display = 'block';
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabAtiva));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.toggle('active', c.id === `tab-${tabAtiva}`));
    const mod = TABS_PLANEJAMENTO[tabAtiva];
    const container = document.getElementById(`tab-${tabAtiva}`);
    if (mod && container) mod.render(container, state);
    return;
  }

  if (MODULOS_SIMPLES[moduloAtivo]) {
    areaModuloSimples.style.display = 'block';
    await MODULOS_SIMPLES[moduloAtivo].render(areaModuloSimples, state);
    return;
  }

  modPlaceholder.style.display = 'block';
  document.getElementById('modulo-placeholder-nome').textContent = modInfo ? modInfo.nome : 'Este módulo';
}

// Navegação vinda de outros módulos (ex: clicar num item da SWOT abre a análise em Riscos e Oportunidades)
document.addEventListener('strategya:abrir-risco', async (e) => {
  moduloAtivo = 'riscos-oportunidades';
  viewAtual = 'modulo';
  renderModuleRail();
  await renderConteudoAtivo();
  riscos.abrirEdicaoPorId(state, areaModuloSimples, e.detail.id);
});

// Troca de aba dentro do Planejamento Estratégico (ex: "ver indicadores" a partir de um Objetivo)
document.addEventListener('strategya:mudar-aba', (e) => {
  // "Ações" virou módulo próprio (não é mais aba do Planejamento Estratégico)
  if (e.detail.aba === 'planos') {
    planosAcao.irParaGrupo(e.detail.grupo || 'planos');
    moduloAtivo = 'acoes';
    viewAtual = 'modulo';
    renderModuleRail();
    renderConteudoAtivo();
    return;
  }

  tabAtiva = e.detail.aba;
  moduloAtivo = 'planejamento-estrategico';
  viewAtual = 'modulo';
  if (tabAtiva === 'contexto' && e.detail.grupo) contexto.irParaGrupo(e.detail.grupo);
  if (tabAtiva === 'indicadores') {
    indicadores.filtrarPorObjetivo(e.detail.objetivoId || null);
    if (e.detail.indicadorId) indicadores.abrirIndicadorPorId(e.detail.indicadorId);
  }
  renderModuleRail();
  renderConteudoAtivo();
});

export { selecionarEmpresa, renderConteudoAtivo, abrirModalNovaEmpresa };
