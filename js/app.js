import { supabase } from './supabaseClient.js';
import { toast, abrirModal, fecharModal, escapeHtml, resolverNivel } from './ui.js';
import { aplicarTema, extrairCoresDoLogo, corTextoIdeal } from './tema.js';
import * as dashboard from './modules/dashboard.js';
import * as contexto from './modules/contexto.js';
import * as objetivos from './modules/objetivos.js';
import * as planosAcao from './modules/planosAcao.js';
import * as indicadores from './modules/indicadores.js';
import * as atasReuniao from './modules/atasReuniao.js';
import * as riscos from './modules/riscosOportunidades.js';
import * as controladoria from './modules/controladoria.js';
import * as documentos from './modules/documentos.js';
import * as empresaUsuarios from './modules/empresaUsuarios.js';
import * as permissoes from './modules/permissoes.js';
import * as apuracoes from './modules/apuracoes.js';
import * as auditorias from './modules/auditorias.js';
import { MODULOS_SISTEMA } from './modulosConfig.js';

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
const TABS_PLANEJAMENTO = { dashboard, contexto, objetivos, riscos, indicadores, atas: atasReuniao };
let tabAtiva = 'dashboard';

// Módulos que têm uma única tela (sem abas internas), renderizados direto em #area-modulo-simples
const MODULOS_SIMPLES = { 'acoes': planosAcao, 'controladoria': controladoria, documentos, 'apuracoes': apuracoes, 'auditorias': auditorias };

// Módulos do sistema — ver js/modulosConfig.js (fonte central, espelha o catálogo no banco).
export { MODULOS_SISTEMA };
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
const viewConfirmeEmail = document.getElementById('view-confirme-email');
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
    if (modoCadastro) {
      const { data, error } = await supabase.auth.signUp({ email, password: senha });
      if (error) throw error;
      // Com "Confirm email" ativo nas configurações de Auth do Supabase, o cadastro não abre
      // sessão até o e-mail ser confirmado (data.session vem nulo) — leva direto para a tela de
      // confirmação em vez de deixar a pessoa "presa" na tela de login sem entender o motivo.
      if (!data.session) {
        mostrarTelaConfirmeEmail(email);
      } else {
        toast('Conta criada com sucesso.', 'sucesso');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) {
        // Conta existe e a senha está certa, mas o e-mail ainda não foi confirmado (inclui
        // colaboradores cadastrados por admin/ORBEEX, que agora também exigem confirmação) —
        // leva direto pra tela de confirmação em vez de um erro genérico.
        if (/email.*not.*confirmed/i.test(error.message)) {
          mostrarTelaConfirmeEmail(email);
          return;
        }
        throw error;
      }
    }
  } catch (err) {
    loginErro.textContent = err.message || 'Erro ao autenticar.';
    loginErro.style.display = 'flex';
  } finally {
    btnLoginSubmit.disabled = false;
    btnLoginSubmit.textContent = textoOriginal;
  }
});

// ---------- CONFIRMAÇÃO DE E-MAIL (primeiro acesso) ----------
function mostrarTelaConfirmeEmail(email) {
  viewLoading.style.display = 'none';
  viewLogin.style.display = 'none';
  viewApp.style.display = 'none';
  viewRedefinirSenha.style.display = 'none';
  document.getElementById('confirme-email-endereco').textContent = email;
  document.getElementById('confirme-email-erro').style.display = 'none';
  viewConfirmeEmail.style.display = 'flex';
}

document.getElementById('btn-reenviar-confirmacao').addEventListener('click', async () => {
  const email = document.getElementById('confirme-email-endereco').textContent;
  const erroBox = document.getElementById('confirme-email-erro');
  erroBox.style.display = 'none';
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) {
    erroBox.textContent = error.message;
    erroBox.style.display = 'flex';
    return;
  }
  toast('E-mail de confirmação reenviado.', 'sucesso');
});

document.getElementById('btn-confirme-email-sair').addEventListener('click', async () => {
  await supabase.auth.signOut();
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

  // Reforço no app: mesmo que a sessão já exista, um usuário sem e-mail confirmado não entra no
  // sistema (cobre o caso de "Confirm email" ter sido ativado depois de contas já criadas, ou
  // qualquer sessão antiga sem confirmação pendente).
  if (state.user && !state.user.email_confirmed_at) {
    viewApp.style.display = 'none';
    mostrarTelaConfirmeEmail(state.user.email);
    return;
  }

  if (state.user) {
    viewLogin.style.display = 'none';
    viewConfirmeEmail.style.display = 'none';
    viewApp.style.display = 'block';
    const nomeExibicao = state.user.user_metadata?.nome || state.user.email;
    document.getElementById('topbar-user').textContent = nomeExibicao;
    document.getElementById('topbar-avatar').textContent = iniciais(nomeExibicao);
    carregarEmpresas();
  } else {
    viewApp.style.display = 'none';
    viewConfirmeEmail.style.display = 'none';
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

// Permissões granulares por módulo/submódulo (redesign de permissões): em vez de calcular um nível
// sob demanda a cada troca de aba, carrega de uma vez só todas as linhas de permissoes_edicao do
// usuário + do seu departamento nesta empresa, e resolverNivel() replica em memória a mesma cascata
// de fallback da função SQL nivel_edicao_usuario(empresa,modulo,submodulo) (ver migração 0065):
// usuário específico (módulo+submódulo > módulo inteiro > coringa '*') > departamento (mesma
// cascata) > default por papel (gestor: 'proprio', exceto PE = 'leitura'; usuario: 'leitura',
// exceto PE = 'sem_acesso'). orbeex/admin sempre 'total', sem consultar linha nenhuma.
async function carregarPermissoesEdicao(empresaId) {
  if (state.papelAtual === 'orbeex') {
    state.permissoesEdicao = [];
    return;
  }
  // Administrador também precisa carregar suas linhas: em Apurações (migração 0078) o nível
  // configurado vale mesmo para admin dentro do comitê — só ORBEEX ignora a tabela por completo.
  const departamentoId = state.empresaAtual?.departamentoId;
  let query = supabase.from('permissoes_edicao')
    .select('usuario_id, departamento_id, modulo, submodulo, nivel')
    .eq('empresa_id', empresaId);
  query = departamentoId
    ? query.or(`usuario_id.eq.${state.user.id},departamento_id.eq.${departamentoId}`)
    : query.eq('usuario_id', state.user.id);
  const { data, error } = await query;
  if (error) {
    toast('Erro ao carregar permissões: ' + error.message, 'erro');
    state.permissoesEdicao = [];
  } else {
    state.permissoesEdicao = data || [];
  }
}

// Gestão de Apurações é o único módulo com uma segunda trava de acesso além de "habilitado para
// a empresa": mesmo habilitado, só aparece no menu para quem é 'orbeex' ou membro ativo do comitê
// de apuração desta empresa — evita expor o módulo (e o risco de conflito de interesse) a
// qualquer admin/usuário da empresa que não faça parte do comitê.
async function carregarAcessoApuracoes(empresaId) {
  if (state.papelAtual === 'orbeex') {
    state.acessoApuracoes = true;
    return;
  }
  const { data } = await supabase
    .from('apuracoes_comite_membros')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('usuario_id', state.user.id)
    .eq('ativo', true)
    .maybeSingle();
  state.acessoApuracoes = !!data;
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
  await carregarPermissoesEdicao(emp.id);
  await carregarAcessoApuracoes(emp.id);
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
// Módulos ainda não implementados (disponivel: false) levam a um placeholder "em construção"
// mesmo que "habilitados" — mas o papel ORBEEX sempre tem acesso a tudo, em qualquer empresa,
// independente do que foi habilitado: é a equipe que administra a plataforma e precisa enxergar
// e acessar todos os módulos e todas as permissões sempre.
// Além do flag por empresa, um módulo configurável (ver js/modulosConfig.js) só aparece pra quem
// tem pelo menos um nível de acesso diferente de 'sem_acesso' — no módulo inteiro ou em algum dos
// seus submódulos. É o que faz o Planejamento Estratégico ficar oculto do papel Usuário por padrão
// (que não tem nenhum submódulo liberado), mas reaparecer assim que um submódulo específico for
// liberado manualmente na matriz de permissões, mesmo que o restante continue sem acesso.
function moduloTemAcessoDoUsuario(moduloId) {
  const mod = MODULOS_SISTEMA.find((m) => m.id === moduloId);
  if (!mod || mod.configuravel === false) return true;
  if (resolverNivel(state, moduloId) !== 'sem_acesso') return true;
  return (mod.submodulos || []).some((s) => resolverNivel(state, moduloId, s.id) !== 'sem_acesso');
}

function moduloHabilitadoParaEmpresa(moduloId) {
  if (state.papelAtual === 'orbeex') return true;
  const habilitado = (state.empresaAtual?.modulos_habilitados || []).includes(moduloId);
  // Apurações não tem mais tratamento especial aqui: resolverNivel('apuracoes') já embute o gate
  // de comitê (migração 0078) e retorna 'sem_acesso' para quem não é membro ativo, então
  // moduloTemAcessoDoUsuario cobre o caso igual aos demais módulos configuráveis.
  return habilitado && moduloTemAcessoDoUsuario(moduloId);
}

// ---------- MÓDULOS (sidebar) ----------
const moduleRail = document.getElementById('module-rail');

function renderModuleRail() {
  moduleRail.innerHTML = '<div class="module-rail-title">Módulos</div>' + MODULOS_SISTEMA.map((m) => {
    const disp = moduloHabilitadoParaEmpresa(m.id);
    return `
    <button class="module-item ${m.id === moduloAtivo && viewAtual === 'modulo' ? 'active' : ''} ${disp ? '' : 'disabled'}"
      data-modulo="${m.id}" ${disp ? '' : 'disabled'}>
      <span class="module-item-icon"><i class="ti ${m.icone}"></i></span>
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
// O logo/marca STRATEGYA na topbar e o logo do cliente no cabeçalho do conteúdo levam os dois
// sempre de volta para a Home, de onde quer que o usuário esteja no sistema.
function irParaHome() {
  if (!state.empresaAtual) return;
  viewAtual = 'home';
  renderModuleRail();
  renderConteudoAtivo();
}
document.getElementById('topbar-home-link').addEventListener('click', (e) => {
  e.preventDefault();
  irParaHome();
});
document.getElementById('header-icon').addEventListener('click', irParaHome);

// Faixa de boas-vindas: logo grande da empresa, nome de quem entrou e a data de hoje.
function renderHomeHero() {
  const home = document.getElementById('home-hero');
  const emp = state.empresaAtual;
  if (!home || !emp) return;

  const nomeExibicao = state.user?.user_metadata?.nome || state.user?.email || '';
  const primeiroNome = nomeExibicao.split(/[\s@]+/)[0] || 'usuário';
  const dataHoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  home.innerHTML = `
    <div class="home-hero">
      <div class="home-hero-logo">
        ${emp.logo_url ? `<img src="${escapeHtml(emp.logo_url)}" alt="Logo">` : '<i class="ti ti-target-arrow"></i>'}
      </div>
      <div class="home-hero-texto">
        <div class="home-hero-titulo">Olá, ${escapeHtml(primeiroNome)}</div>
        <div class="home-hero-sub">Bem-vindo(a) ao painel de gestão estratégica de <strong>${escapeHtml(emp.nome)}</strong></div>
      </div>
      <div class="home-hero-data">
        <div class="home-hero-data-label">Hoje</div>
        <div class="home-hero-data-valor">${escapeHtml(dataHoje)}</div>
      </div>
    </div>
  `;
}

// Missão/Visão/Valores/Política do SGI/SGQ — mesmos campos editados em Contexto > Empresa
// (js/modules/contexto.js), aqui só em modo leitura, com atalho para quem tiver que editar.
// Layout pedido: Visão, Missão e Política empilhadas na coluna esquerda; Valores na coluna direita,
// ocupando a altura das três juntas (ver .home-institucional no CSS).
async function renderHomeInstitucional() {
  const container = document.getElementById('home-institucional');
  if (!container || !state.empresaAtual) return;

  const { data: empresa } = await state.supabase
    .from('empresas')
    .select('missao, visao, valores, politica_sgq')
    .eq('id', state.empresaAtual.id)
    .single();

  const tudoVazio = !empresa || ['missao', 'visao', 'valores', 'politica_sgq'].every((c) => !(empresa[c] || '').trim());

  if (tudoVazio) {
    container.innerHTML = `
      <div class="home-inst-vazio">
        <span><i class="ti ti-info-circle"></i> Missão, visão, valores e política ainda não foram preenchidos.</span>
        <button class="btn btn-secondary btn-sm" id="btn-home-ir-contexto" type="button"><i class="ti ti-map-2"></i> Preencher em Contexto</button>
      </div>
    `;
    document.getElementById('btn-home-ir-contexto')?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('strategya:mudar-aba', { detail: { aba: 'contexto', grupo: 'empresa' } }));
    });
    return;
  }

  const textoOuVazio = (valor) => (valor || '').trim()
    ? escapeHtml(valor)
    : '<span class="home-inst-vazia">Ainda não preenchido.</span>';

  container.innerHTML = `
    <div class="home-institucional">
      <div class="home-inst-card home-inst-visao">
        <div class="home-inst-card-titulo"><i class="ti ti-telescope"></i> Visão</div>
        <div class="home-inst-card-texto">${textoOuVazio(empresa.visao)}</div>
      </div>
      <div class="home-inst-card home-inst-missao">
        <div class="home-inst-card-titulo"><i class="ti ti-flag-3"></i> Missão</div>
        <div class="home-inst-card-texto">${textoOuVazio(empresa.missao)}</div>
      </div>
      <div class="home-inst-card home-inst-politica">
        <div class="home-inst-card-titulo"><i class="ti ti-shield-check"></i> Política do SGI/SGQ</div>
        <div class="home-inst-card-texto">${textoOuVazio(empresa.politica_sgq)}</div>
      </div>
      <div class="home-inst-card home-inst-valores">
        <div class="home-inst-card-titulo"><i class="ti ti-heart-handshake"></i> Valores</div>
        <div class="home-inst-card-texto">${textoOuVazio(empresa.valores)}</div>
      </div>
    </div>
  `;
}

// Rail vertical com só os ícones dos módulos: cor normal se disponível pra empresa, cinza se não.
// Disponível clica e vai direto pro módulo; indisponível clica e abre um lembrete com o resumo
// do módulo (abrirModalModulo), já que a pessoa ainda não tem acesso pra navegar até ele.
function renderHomeModulosRail() {
  const rail = document.getElementById('home-modulos-rail');
  if (!rail) return;

  rail.innerHTML = MODULOS_SISTEMA.map((m) => {
    const disp = moduloHabilitadoParaEmpresa(m.id);
    return `<button type="button" class="home-modulo-logo ${disp ? '' : 'indisponivel'}" data-modulo-rail="${m.id}" title="${escapeHtml(m.nome)}">
      <i class="ti ${m.icone}"></i>
    </button>`;
  }).join('');

  rail.querySelectorAll('[data-modulo-rail]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const moduloId = btn.dataset.moduloRail;
      if (moduloHabilitadoParaEmpresa(moduloId)) {
        moduloAtivo = moduloId;
        viewAtual = 'modulo';
        renderModuleRail();
        renderConteudoAtivo();
      } else {
        abrirModalModulo(moduloId);
      }
    });
  });
}

function abrirModalModulo(moduloId) {
  const m = MODULOS_SISTEMA.find((x) => x.id === moduloId);
  if (!m) return;

  abrirModal(m.nome, `
    <div style="text-align:center">
      <div class="home-modal-icon"><i class="ti ${m.icone}"></i></div>
      ${m.teaser ? `<p class="home-modal-teaser">${escapeHtml(m.teaser)}</p>` : ''}
      <p class="home-modal-desc">${escapeHtml(m.descricao)}</p>
      <span class="badge badge-neutral">Em breve</span>
    </div>
  `);
}

async function renderHome() {
  renderHomeModulosRail();
  renderHomeHero();
  await renderHomeInstitucional();
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
// Cada aba é liberada por um ou mais submódulos (ver js/modulosConfig.js) — a aba só some se
// TODOS os submódulos dela estiverem 'sem_acesso' para o usuário atual. Dashboard segue o mesmo
// controle de Objetivos (é um resumo dele); Contexto agrega as 4 sub-áreas internas.
const SUBMODULOS_POR_ABA = {
  dashboard: ['objetivos'],
  contexto: ['contexto-cenario', 'contexto-partes', 'contexto-macrofluxo', 'contexto-sipoc'],
  objetivos: ['objetivos'],
  riscos: ['riscos'],
  indicadores: ['indicadores'],
  atas: ['atas'],
};

function atualizarVisibilidadeAbasPE() {
  let primeiraVisivel = null;
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const aba = btn.dataset.tab;
    const submodulos = SUBMODULOS_POR_ABA[aba] || [];
    const visivel = submodulos.some((s) => resolverNivel(state, 'planejamento-estrategico', s) !== 'sem_acesso');
    btn.style.display = visivel ? '' : 'none';
    if (visivel && !primeiraVisivel) primeiraVisivel = aba;
  });
  if (primeiraVisivel && (SUBMODULOS_POR_ABA[tabAtiva] || []).every((s) => resolverNivel(state, 'planejamento-estrategico', s) === 'sem_acesso')) {
    tabAtiva = primeiraVisivel;
  }
}

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
    await renderHome();
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
    atualizarVisibilidadeAbasPE();
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
  tabAtiva = 'riscos';
  moduloAtivo = 'planejamento-estrategico';
  viewAtual = 'modulo';
  renderModuleRail();
  await renderConteudoAtivo();
  riscos.abrirEdicaoPorId(state, document.getElementById('tab-riscos'), e.detail.id);
});

// Disparado por Riscos e Oportunidades ao "Tratar" um risco — abre o plano de ação vinculado
// direto na aba Ações (Gestão de Ações).
document.addEventListener('strategya:abrir-plano-acao', async (e) => {
  moduloAtivo = 'acoes';
  viewAtual = 'modulo';
  planosAcao.irParaGrupo('planos');
  renderModuleRail();
  await renderConteudoAtivo();
  planosAcao.abrirPlanoPorId(state, areaModuloSimples, e.detail.id);
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

// Chamado pelo módulo de Apurações depois de qualquer mudança no comitê, para o menu lateral
// refletir na hora um acesso concedido/revogado sem precisar trocar de empresa.
export async function recarregarAcessoApuracoes() {
  if (!state.empresaAtual) return;
  await carregarAcessoApuracoes(state.empresaAtual.id);
  renderModuleRail();
}

export { selecionarEmpresa, renderConteudoAtivo, abrirModalNovaEmpresa };
