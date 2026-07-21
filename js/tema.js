function hexParaRgb(hex) {
  const v = hex.replace('#', '');
  return [parseInt(v.substring(0, 2), 16), parseInt(v.substring(2, 4), 16), parseInt(v.substring(4, 6), 16)];
}

function rgbParaHex(r, g, b) {
  return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

// amount > 0 clareia em direção ao branco, amount < 0 escurece em direção ao preto (percentual 0-100)
function ajustarCor(hex, amount) {
  const [r, g, b] = hexParaRgb(hex);
  const alvo = amount > 0 ? 255 : 0;
  const f = Math.abs(amount) / 100;
  return rgbParaHex(r + (alvo - r) * f, g + (alvo - g) * f, b + (alvo - b) * f);
}

const PADRAO = { cor_primaria: '#252538', cor_destaque: '#E8B84B', cor_texto: '#ffffff', logo_url: null };

// Escolhe branco ou preto como cor de fonte ideal para o fundo dado, pela luminância relativa
// (fórmula WCAG simplificada). Usado para sugerir automaticamente a cor da fonte quando a cor
// primária muda (ex: ao extrair cores do logo) — o usuário ainda pode ajustar manualmente depois.
export function corTextoIdeal(hexFundo) {
  const [r, g, b] = hexParaRgb(hexFundo).map((c) => c / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminancia = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminancia > 0.5 ? '#1a1a2e' : '#ffffff';
}

// Lê a imagem de um logo e extrai as duas cores mais dominantes (ignorando fundo branco/preto puro)
export function extrairCoresDoLogo(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const tam = 64;
      const canvas = document.createElement('canvas');
      canvas.width = tam;
      canvas.height = tam;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, tam, tam);

      let dados;
      try {
        dados = ctx.getImageData(0, 0, tam, tam).data;
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      URL.revokeObjectURL(url);

      const contagem = new Map();
      for (let i = 0; i < dados.length; i += 4) {
        const [r, g, b, a] = [dados[i], dados[i + 1], dados[i + 2], dados[i + 3]];
        if (a < 128) continue;
        if (r > 235 && g > 235 && b > 235) continue; // fundo branco
        if (r < 15 && g < 15 && b < 15) continue; // preto puro
        const chave = `${Math.round(r / 24) * 24},${Math.round(g / 24) * 24},${Math.round(b / 24) * 24}`;
        contagem.set(chave, (contagem.get(chave) || 0) + 1);
      }

      const ordenado = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
      if (ordenado.length === 0) {
        resolve(null);
        return;
      }
      const paraHex = (chave) => {
        const [r, g, b] = chave.split(',').map(Number);
        return rgbParaHex(r, g, b);
      };
      resolve({
        corPrimaria: paraHex(ordenado[0][0]),
        corDestaque: ordenado[1] ? paraHex(ordenado[1][0]) : paraHex(ordenado[0][0]),
      });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export function aplicarTema(empresa) {
  const navy = empresa?.cor_primaria || PADRAO.cor_primaria;
  const gold = empresa?.cor_destaque || PADRAO.cor_destaque;
  const textoNavy = empresa?.cor_texto || PADRAO.cor_texto;
  const root = document.documentElement.style;

  root.setProperty('--navy', navy);
  root.setProperty('--navy-dark', ajustarCor(navy, -12));
  root.setProperty('--navy-mid', ajustarCor(navy, 10));
  root.setProperty('--gold', gold);
  root.setProperty('--gold-dark', ajustarCor(gold, -15));
  root.setProperty('--gold-light', ajustarCor(gold, 20));
  root.setProperty('--gold-bg', ajustarCor(gold, 88));
  root.setProperty('--bg-warning', ajustarCor(gold, 88));
  root.setProperty('--navy-text', textoNavy);
  // Títulos sobre fundo claro: se a cor primária da empresa for clara demais (ex: cinza claro),
  // usar preto para manter a leitura — senão, mantém a cor da marca.
  root.setProperty('--navy-titulo', corTextoIdeal(navy) === '#ffffff' ? navy : '#1a1a1a');

  const headerIcon = document.getElementById('header-icon');
  const headerLogoImg = document.getElementById('header-logo-img');
  const headerIconFallback = document.getElementById('header-icon-fallback');
  if (headerIcon && headerLogoImg && headerIconFallback) {
    if (empresa?.logo_url) {
      headerLogoImg.src = empresa.logo_url;
      headerLogoImg.style.display = 'block';
      headerIconFallback.style.display = 'none';
      headerIcon.classList.add('tem-logo');
    } else {
      headerLogoImg.style.display = 'none';
      headerIconFallback.style.display = '';
      headerIcon.classList.remove('tem-logo');
    }
  }
}
