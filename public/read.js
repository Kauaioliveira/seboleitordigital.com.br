const readTitle = document.getElementById('readTitle');
const readAuthor = document.getElementById('readAuthor');
const readStatus = document.getElementById('readStatus');
const readFrame = document.getElementById('readFrame');
const readFrameWrap = document.getElementById('readFrameWrap');
const readExternal = document.getElementById('readExternal');
const readFallback = document.getElementById('readFallback');
const readTools = document.getElementById('readTools');
const readProgress = document.getElementById('readProgress');
const fonteMenor = document.getElementById('fonteMenor');
const fonteMaior = document.getElementById('fonteMaior');

const CHAVE_PREFS = 'sebo:leitor';
const TAMANHOS = [80, 90, 100, 112, 125, 140, 160];
const TEMAS_LEITOR = {
  claro: { fundo: '#faf8f5', texto: '#1a1918', link: '#8f3d14' },
  sepia: { fundo: '#f4ecd8', texto: '#3b2f22', link: '#8f3d14' },
  escuro: { fundo: '#171512', texto: '#e8e2d8', link: '#e8915c' }
};

let livroId = null;
let prefs = lerPrefs();

function lerPrefs() {
  const padrao = {
    tamanho: 100,
    tema: document.documentElement.classList.contains('dark') ? 'escuro' : 'claro'
  };
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_PREFS) || '{}');
    return {
      tamanho: TAMANHOS.includes(salvo.tamanho) ? salvo.tamanho : padrao.tamanho,
      tema: TEMAS_LEITOR[salvo.tema] ? salvo.tema : padrao.tema
    };
  } catch {
    return padrao;
  }
}

function salvarPrefs() {
  try {
    localStorage.setItem(CHAVE_PREFS, JSON.stringify(prefs));
  } catch {
    /* sem armazenamento: ajustes valem só nesta visita */
  }
}

function mostrarStatus(texto, isErro) {
  readStatus.textContent = texto;
  readStatus.classList.toggle('hidden', !texto);
  readStatus.classList.toggle('status-msg--error', Boolean(isErro && texto));
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function nomeAutor(nome) {
  const partes = String(nome || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (partes.length === 2) return `${partes[1]} ${partes[0]}`;
  return partes.join(', ');
}

const NOMES_FORMATO = {
  'application/epub+zip': 'EPUB (leitores de e-book)',
  'application/x-mobipocket-ebook': 'Kindle (MOBI)',
  'application/pdf': 'PDF',
  'text/html': 'Página HTML',
  'text/plain': 'Texto simples',
  'application/rdf+xml': 'Metadados (RDF)'
};

function linksDownloadHtml(formats) {
  const itens = Object.entries(formats || {}).filter(([mime]) => !mime.startsWith('image/'));
  if (!itens.length) return '<p>Nenhum formato disponível para este título.</p>';
  return `<ul class="link-list">${itens
    .map(([mime, url]) => {
      const nome = NOMES_FORMATO[mime.split(';')[0]] || mime;
      return `<li><a href="${esc(url)}" rel="noopener noreferrer" target="_blank">${esc(nome)}</a></li>`;
    })
    .join('')}</ul>`;
}

function docLivro() {
  try {
    return readFrame.contentDocument;
  } catch {
    return null;
  }
}

function aplicarPrefs() {
  const tema = TEMAS_LEITOR[prefs.tema];
  document.querySelectorAll('[data-tema-leitor]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.getAttribute('data-tema-leitor') === prefs.tema ? 'true' : 'false');
  });
  fonteMenor.disabled = prefs.tamanho === TAMANHOS[0];
  fonteMaior.disabled = prefs.tamanho === TAMANHOS[TAMANHOS.length - 1];
  readFrame.style.background = tema.fundo;

  const doc = docLivro();
  if (!doc || !doc.head) return;
  let estilo = doc.getElementById('sebo-leitor-prefs');
  if (!estilo) {
    estilo = doc.createElement('style');
    estilo.id = 'sebo-leitor-prefs';
    doc.head.appendChild(estilo);
  }
  const escuro = prefs.tema === 'escuro';
  estilo.textContent = `
    :root, html { color-scheme: ${escuro ? 'dark' : 'light'} !important; background: ${tema.fundo} !important; }
    html body {
      background: ${tema.fundo} !important;
      color: ${tema.texto} !important;
      font-size: ${prefs.tamanho}% !important;
      line-height: 1.7 !important;
      max-width: 42em !important;
      margin: 0 auto !important;
      padding: 1.5rem 1.25rem 5rem !important;
      font-family: Georgia, 'Iowan Old Style', 'Times New Roman', serif !important;
    }
    html body pre { font: inherit !important; white-space: pre-wrap !important; padding: 0 !important; }
    html body a:link, html body a:visited { color: ${tema.link} !important; }
    html body img { max-width: 100% !important; height: auto !important; }
    ${escuro ? 'html body *:not(a) { color: inherit !important; background-color: transparent !important; border-color: #3a3530 !important; }' : ''}
  `;
}

function fracaoLida(doc) {
  const el = doc.scrollingElement || doc.documentElement;
  const max = el.scrollHeight - el.clientHeight;
  return max > 0 ? el.scrollTop / max : 0;
}

function atualizarProgresso(fracao) {
  readProgress.style.width = `${Math.round(fracao * 100)}%`;
}

function prepararDocumento() {
  const doc = docLivro();
  if (!doc) return;
  aplicarPrefs();

  // Links internos (#capitulo) rolam dentro do leitor; os demais abrem em nova aba.
  doc.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#')) {
      e.preventDefault();
      const alvoId = decodeURIComponent(href.slice(1));
      const alvo = doc.getElementById(alvoId) || doc.getElementsByName(alvoId)[0];
      if (alvo) alvo.scrollIntoView({ block: 'start' });
      return;
    }
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });

  const el = doc.scrollingElement || doc.documentElement;
  const salvo = window.HistoricoLeitura.progresso(livroId);
  if (salvo > 0.001) {
    el.scrollTop = salvo * (el.scrollHeight - el.clientHeight);
  }
  atualizarProgresso(fracaoLida(doc));

  let agendado = false;
  readFrame.contentWindow.addEventListener('scroll', () => {
    if (agendado) return;
    agendado = true;
    setTimeout(() => {
      agendado = false;
      const f = fracaoLida(doc);
      atualizarProgresso(f);
      window.HistoricoLeitura.salvarProgresso(livroId, f);
    }, 400);
  });
}

function mudarTamanho(delta) {
  const i = TAMANHOS.indexOf(prefs.tamanho);
  const novo = TAMANHOS[Math.max(0, Math.min(TAMANHOS.length - 1, i + delta))];
  if (novo === prefs.tamanho) return;
  const doc = docLivro();
  const fracao = doc ? fracaoLida(doc) : 0;
  prefs.tamanho = novo;
  salvarPrefs();
  aplicarPrefs();
  // Mantém o leitor no mesmo ponto do texto depois de mudar o tamanho da letra.
  if (doc) {
    const el = doc.scrollingElement || doc.documentElement;
    el.scrollTop = fracao * (el.scrollHeight - el.clientHeight);
  }
}

fonteMenor.addEventListener('click', () => mudarTamanho(-1));
fonteMaior.addEventListener('click', () => mudarTamanho(1));
document.querySelectorAll('[data-tema-leitor]').forEach((btn) => {
  btn.addEventListener('click', () => {
    prefs.tema = btn.getAttribute('data-tema-leitor');
    salvarPrefs();
    aplicarPrefs();
  });
});

// Se o usuário veio do catálogo, "voltar" preserva a busca e a página em que estava.
document.getElementById('voltarCatalogo').addEventListener('click', (e) => {
  try {
    if (document.referrer && new URL(document.referrer).origin === location.origin
      && new URL(document.referrer).pathname === '/') {
      e.preventDefault();
      history.back();
    }
  } catch {
    /* referrer inválido: segue o link normal */
  }
});

function mostrarAlternativas(formats, motivo) {
  readFrameWrap.classList.add('hidden');
  readFallback.classList.remove('hidden');
  readFallback.innerHTML = `
    <p>${esc(motivo)} Você pode baixar o livro em outro formato:</p>
    ${linksDownloadHtml(formats)}
  `;
}

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id || !/^\d+$/.test(id)) {
    readTitle.textContent = 'Livro não encontrado';
    mostrarStatus('Este link não aponta para nenhum livro. Volte ao catálogo e escolha uma obra.', true);
    return;
  }
  livroId = Number(id);

  let book;
  try {
    const r = await fetch(`/api/livros/${id}`, { credentials: 'same-origin' });
    if (!r.ok) {
      readTitle.textContent = r.status === 404 ? 'Livro não encontrado' : 'Não foi possível abrir';
      mostrarStatus(
        r.status === 404
          ? 'Não encontramos esse livro no acervo.'
          : 'O acervo do Gutenberg não respondeu. Tente de novo em instantes.',
        true
      );
      return;
    }
    book = await r.json();
  } catch {
    readTitle.textContent = 'Sem conexão';
    mostrarStatus('Verifique sua internet e recarregue a página.', true);
    return;
  }

  const autores = (book.authors || []).map((a) => nomeAutor(a.name));
  const titulo = book.title || 'Livro';
  readTitle.textContent = titulo;
  readAuthor.textContent = autores.join(', ');
  document.title = `${titulo} · Sebo Leitor Digital`;

  const formats = book.formats || {};
  window.HistoricoLeitura.registrar({
    id: book.id,
    title: titulo,
    authors: autores,
    cover: formats['image/jpeg'] || formats['image/png'] || null
  });

  const htmlUrl = formats['text/html'] || formats['text/html; charset=utf-8'];
  const plainUrl = formats['text/plain; charset=utf-8'] || formats['text/plain'] || formats['text/plain; charset=us-ascii'];
  const alvo = htmlUrl || plainUrl;

  if (!alvo) {
    mostrarAlternativas(formats, 'Este título não tem versão para ler aqui no site.');
    return;
  }

  readExternal.href = alvo;
  readExternal.classList.remove('hidden');
  readTools.classList.remove('hidden');
  aplicarPrefs();
  mostrarStatus('Carregando o texto… livros longos podem levar alguns segundos.', false);

  try {
    const r = await fetch(`/api/read-proxy?url=${encodeURIComponent(alvo)}`, { credentials: 'same-origin' });
    if (!r.ok) {
      mostrarStatus('', false);
      mostrarAlternativas(
        formats,
        r.status === 413
          ? 'Este livro é grande demais para abrir no leitor do site.'
          : 'Não conseguimos abrir o texto agora.'
      );
      return;
    }
    const html = await r.text();
    readFrame.addEventListener('load', () => {
      mostrarStatus('', false);
      prepararDocumento();
    }, { once: true });
    readFrameWrap.classList.remove('hidden');
    readFrame.srcdoc = html;
  } catch {
    mostrarStatus('', false);
    mostrarAlternativas(formats, 'A conexão caiu enquanto o texto carregava.');
  }
})();
