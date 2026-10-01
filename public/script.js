const POR_PAGINA_GUTENDEX = 32;

const catalogoStatus = document.getElementById('catalogoStatus');
const catalogoResumo = document.getElementById('catalogoResumo');
const catalogoSecao = document.getElementById('catalogo');
const favoritosStatus = document.getElementById('favoritosStatus');
const favoritosHint = document.getElementById('favoritosHint');
const listaLivros = document.getElementById('listaLivros');
const listaFavoritos = document.getElementById('listaFavoritos');
const formBusca = document.getElementById('formBusca');
const campoBusca = document.getElementById('campoBusca');
const limparBusca = document.getElementById('limparBusca');
const pager = document.getElementById('pager');
const btnAnterior = document.getElementById('btnAnterior');
const btnProximo = document.getElementById('btnProximo');
const pagerInfo = document.getElementById('pagerInfo');
const linkEntrar = document.getElementById('linkEntrar');
const linkSair = document.getElementById('linkSair');
const userChip = document.getElementById('userChip');
const pdfLocalAviso = document.getElementById('pdfLocalAviso');
const secaoContinuar = document.getElementById('continuar');
const listaContinuar = document.getElementById('listaContinuar');
const limparHistorico = document.getElementById('limparHistorico');
const toast = document.getElementById('toast');

let buscaAtual = '';
let paginaAtual = 1;
let ultimoPayload = null;
let authState = { authenticated: false, user: null };
let favoritoIds = new Set();
let requisicaoCatalogo = 0;
let toastTimer = null;

function mostrarStatus(el, texto, isErro) {
  if (!el) return;
  el.textContent = texto;
  el.classList.toggle('hidden', !texto);
  el.classList.toggle('status-msg--error', Boolean(isErro && texto));
}

function avisar(html, duracaoMs = 4500) {
  toast.innerHTML = html;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), duracaoMs);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

// O Gutenberg guarda autores como "Assis, Machado de"; na tela fica "Machado de Assis".
function nomeAutor(nome) {
  const partes = String(nome || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (partes.length === 2) return `${partes[1]} ${partes[0]}`;
  return partes.join(', ');
}

function assuntoCurto(assunto) {
  return String(assunto).split(' -- ')[0];
}

function capaHtml(url, titulo) {
  return url
    ? `<img src="${esc(url)}" alt="" width="120" height="180" loading="lazy">`
    : `<div class="card__placeholder" aria-hidden="true">${esc((titulo || '?').slice(0, 1))}</div>`;
}

function botaoFavoritoHtml(id) {
  const fav = favoritoIds.has(id);
  const rotulo = fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
  return `<button type="button" class="btn btn--ghost btn--icon btn--fav${fav ? ' is-fav' : ''}" data-fav="${id}" aria-pressed="${fav}" aria-label="${rotulo}" title="${rotulo}">${fav ? '★' : '☆'}</button>`;
}

function rotuloLer(id) {
  const p = window.HistoricoLeitura.progresso(id);
  return p > 0.01 ? `Continuar (${Math.round(p * 100)}%)` : 'Ler agora';
}

function cardCatalogoHtml(book) {
  const cover = book.formats?.['image/jpeg'] || book.formats?.['image/png'] || '';
  const titulo = book.title || 'Sem título';
  const autores = (book.authors || []).map((a) => nomeAutor(a.name)).join(', ') || 'Autor desconhecido';
  const assuntos = [...new Set((book.subjects || []).map(assuntoCurto))].slice(0, 3).join(' · ');
  const id = Number(book.id);
  const href = `/read.html?id=${id}`;

  return `
    <article class="card">
      <a class="card__media" href="${href}" tabindex="-1" aria-hidden="true">${capaHtml(cover, titulo)}</a>
      <div class="card__body">
        <h3 class="card__title"><a href="${href}">${esc(titulo)}</a></h3>
        <p class="card__meta">${esc(autores)}</p>
        ${assuntos ? `<p class="card__snippet">${esc(assuntos)}</p>` : ''}
        <div class="card__actions">
          <a class="btn btn--primary btn--sm" href="${href}">${rotuloLer(id)}</a>
          ${botaoFavoritoHtml(id)}
        </div>
      </div>
    </article>
  `;
}

function cardFavoritoHtml(f) {
  const autores = (f.authors || []).map(nomeAutor).join(', ') || 'Autor desconhecido';
  const id = Number(f.id);
  const href = `/read.html?id=${id}`;
  return `
    <article class="card">
      <a class="card__media" href="${href}" tabindex="-1" aria-hidden="true">${capaHtml(f.cover, f.title)}</a>
      <div class="card__body">
        <h3 class="card__title"><a href="${href}">${esc(f.title)}</a></h3>
        <p class="card__meta">${esc(autores)}</p>
        <div class="card__actions">
          <a class="btn btn--primary btn--sm" href="${href}">${rotuloLer(id)}</a>
          <button type="button" class="btn btn--ghost btn--sm" data-remove-fav="${id}">Remover</button>
        </div>
      </div>
    </article>
  `;
}

function skeletonHtml(qtd) {
  return Array.from({ length: qtd }, () => `
    <div class="card card--skeleton" aria-hidden="true">
      <div class="card__media"></div>
      <div class="card__body"><span class="sk sk--titulo"></span><span class="sk"></span><span class="sk sk--curto"></span></div>
    </div>
  `).join('');
}

function renderContinuar() {
  const itens = window.HistoricoLeitura.listar();
  secaoContinuar.classList.toggle('hidden', itens.length === 0);
  listaContinuar.innerHTML = itens
    .map((item) => {
      const pct = Math.round((item.progresso || 0) * 100);
      return `
        <a class="shelf__item" href="/read.html?id=${Number(item.id)}">
          <span class="shelf__cover">${capaHtml(item.cover, item.title)}</span>
          <span class="shelf__title">${esc(item.title)}</span>
          <span class="progress" aria-label="${pct}% lido"><span style="width:${pct}%"></span></span>
        </a>
      `;
    })
    .join('');
}

async function carregarAuth() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    authState = await r.json();
  } catch {
    authState = { authenticated: false };
  }

  const logado = Boolean(authState.authenticated && authState.user);
  linkEntrar.classList.toggle('hidden', logado);
  userChip.classList.toggle('hidden', !logado);
  linkSair.classList.toggle('hidden', !logado);
  pdfLocalAviso.classList.toggle('hidden', logado);
  if (logado) {
    userChip.textContent = authState.user.name || authState.user.email || 'Conectado';
  }

  await carregarFavoritosLista();
}

function renderFavoritos(favs) {
  favoritoIds = new Set(favs.map((f) => Number(f.id)));
  listaFavoritos.innerHTML = favs.length
    ? favs.map(cardFavoritoHtml).join('')
    : '<p class="empty-state">Nenhum favorito ainda. Marque ☆ em um livro do catálogo.</p>';
  atualizarEstrelas();
}

function atualizarEstrelas() {
  listaLivros.querySelectorAll('[data-fav]').forEach((btn) => {
    btn.outerHTML = botaoFavoritoHtml(Number(btn.getAttribute('data-fav')));
  });
}

async function carregarFavoritosLista() {
  if (!authState.authenticated) {
    favoritoIds = new Set();
    favoritosHint.textContent = 'Entre com Google para guardar seus livros favoritos.';
    listaFavoritos.innerHTML =
      '<p class="empty-state"><a href="/login.html">Entrar com Google</a> para começar a salvar favoritos.</p>';
    mostrarStatus(favoritosStatus, '', false);
    return;
  }

  try {
    const r = await fetch('/api/favorites', { credentials: 'same-origin' });
    if (!r.ok) {
      mostrarStatus(favoritosStatus, 'Não foi possível carregar seus favoritos.', true);
      return;
    }
    const data = await r.json();
    renderFavoritos(data.favorites || []);
    mostrarStatus(favoritosStatus, '', false);
  } catch {
    mostrarStatus(favoritosStatus, 'Sem conexão para carregar favoritos.', true);
  }
}

async function alternarFavorito(id) {
  if (!authState.authenticated) {
    avisar('Para salvar favoritos, <a href="/login.html">entre com Google</a>.');
    return;
  }
  const remover = favoritoIds.has(id);
  try {
    const r = remover
      ? await fetch(`/api/favorites/${id}`, { method: 'DELETE', credentials: 'same-origin' })
      : await fetch('/api/favorites', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
    if (r.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    if (r.status === 409) {
      await carregarFavoritosLista();
      return;
    }
    if (!r.ok) {
      avisar('Não foi possível atualizar os favoritos. Tente de novo.');
      return;
    }
    const data = await r.json();
    renderFavoritos(data.favorites || []);
    avisar(remover ? 'Removido dos favoritos.' : 'Salvo nos favoritos ★', 2500);
  } catch {
    avisar('Sem conexão. O favorito não foi salvo.');
  }
}

function lerEstadoDaUrl() {
  const params = new URLSearchParams(window.location.search);
  buscaAtual = (params.get('q') || '').trim().slice(0, 256);
  const p = Number(params.get('page'));
  paginaAtual = Number.isInteger(p) && p > 0 ? p : 1;
  campoBusca.value = buscaAtual;
}

function gravarEstadoNaUrl() {
  const params = new URLSearchParams();
  if (buscaAtual) params.set('q', buscaAtual);
  if (paginaAtual > 1) params.set('page', String(paginaAtual));
  const qs = params.toString();
  history.pushState(null, '', qs ? `/?${qs}` : '/');
}

function navegar(busca, pagina) {
  buscaAtual = busca;
  paginaAtual = pagina;
  campoBusca.value = busca;
  gravarEstadoNaUrl();
  carregarCatalogo();
  catalogoSecao.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function carregarCatalogo() {
  const minhaRequisicao = ++requisicaoCatalogo;
  mostrarStatus(catalogoStatus, '', false);
  listaLivros.setAttribute('aria-busy', 'true');
  listaLivros.innerHTML = skeletonHtml(8);
  limparBusca.classList.toggle('hidden', !buscaAtual);
  catalogoResumo.textContent = buscaAtual
    ? `Buscando “${buscaAtual}”…`
    : 'Obras mais lidas em português.';

  const params = new URLSearchParams();
  if (buscaAtual) params.set('search', buscaAtual);
  if (paginaAtual > 1) params.set('page', String(paginaAtual));

  try {
    const r = await fetch(`/api/livros?${params.toString()}`, { credentials: 'same-origin' });
    if (minhaRequisicao !== requisicaoCatalogo) return;
    if (!r.ok) throw new Error(String(r.status));
    ultimoPayload = await r.json();
    if (minhaRequisicao !== requisicaoCatalogo) return;
    const results = ultimoPayload.results || [];
    const total = ultimoPayload.count ?? results.length;

    if (results.length === 0) {
      listaLivros.innerHTML = buscaAtual
        ? `<p class="empty-state">Nada encontrado para “${esc(buscaAtual)}”. Tente só o sobrenome do autor ou uma palavra do título.</p>`
        : '<p class="empty-state">O catálogo está vazio no momento.</p>';
    } else {
      listaLivros.innerHTML = results.map(cardCatalogoHtml).join('');
    }

    const obras = total === 1 ? '1 obra' : `${total.toLocaleString('pt-BR')} obras`;
    catalogoResumo.textContent = buscaAtual
      ? `${obras} para “${buscaAtual}”.`
      : `${obras} em português, das mais lidas para as menos lidas.`;

    const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA_GUTENDEX));
    pagerInfo.textContent = `Página ${paginaAtual} de ${totalPaginas}`;
    pager.classList.toggle('hidden', totalPaginas <= 1);
    btnAnterior.disabled = !ultimoPayload.previous;
    btnProximo.disabled = !ultimoPayload.next;
  } catch {
    if (minhaRequisicao !== requisicaoCatalogo) return;
    pager.classList.add('hidden');
    listaLivros.innerHTML =
      '<div class="empty-state">Não foi possível carregar o catálogo agora. <button type="button" class="btn btn--ghost btn--sm" id="tentarDeNovo">Tentar de novo</button></div>';
  } finally {
    if (minhaRequisicao === requisicaoCatalogo) {
      listaLivros.setAttribute('aria-busy', 'false');
    }
  }
}

formBusca.addEventListener('submit', (e) => {
  e.preventDefault();
  navegar((campoBusca.value || '').trim(), 1);
});

document.querySelectorAll('[data-sugestao]').forEach((chip) => {
  chip.addEventListener('click', () => navegar(chip.getAttribute('data-sugestao'), 1));
});

limparBusca.addEventListener('click', () => navegar('', 1));

btnAnterior.addEventListener('click', () => {
  if (paginaAtual > 1) navegar(buscaAtual, paginaAtual - 1);
});

btnProximo.addEventListener('click', () => {
  if (ultimoPayload?.next) navegar(buscaAtual, paginaAtual + 1);
});

// Um só listener para as listas: os cards são recriados a cada render.
document.addEventListener('click', (e) => {
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    alternarFavorito(Number(fav.getAttribute('data-fav')));
    return;
  }
  const remover = e.target.closest('[data-remove-fav]');
  if (remover) {
    alternarFavorito(Number(remover.getAttribute('data-remove-fav')));
    return;
  }
  if (e.target.closest('#tentarDeNovo')) {
    carregarCatalogo();
  }
});

limparHistorico.addEventListener('click', () => {
  window.HistoricoLeitura.limpar();
  renderContinuar();
});

window.addEventListener('popstate', () => {
  lerEstadoDaUrl();
  carregarCatalogo();
});

// Ao voltar do leitor pelo botão "voltar", a página pode vir do cache (bfcache).
window.addEventListener('pageshow', (e) => {
  if (e.persisted) renderContinuar();
});

lerEstadoDaUrl();
renderContinuar();
carregarCatalogo();
carregarAuth();
