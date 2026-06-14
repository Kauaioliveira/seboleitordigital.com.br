const TEMA_DARK = 'dark';
const catalogoStatus = document.getElementById('catalogoStatus');
const favoritosStatus = document.getElementById('favoritosStatus');
const listaLivros = document.getElementById('listaLivros');
const listaFavoritos = document.getElementById('listaFavoritos');
const formBusca = document.getElementById('formBusca');
const campoBusca = document.getElementById('campoBusca');
const pager = document.getElementById('pager');
const btnAnterior = document.getElementById('btnAnterior');
const btnProximo = document.getElementById('btnProximo');
const pagerInfo = document.getElementById('pagerInfo');
const botaoDark = document.getElementById('dark');
const linkEntrar = document.getElementById('linkEntrar');
const linkSair = document.getElementById('linkSair');
const userChip = document.getElementById('userChip');
const pdfLocalAviso = document.getElementById('pdfLocalAviso');

let buscaAtual = '';
let paginaAtual = 1;
let ultimoPayload = null;
let authState = { authenticated: false, user: null };
let favoritoIds = new Set();

function atualizarTextoBotao() {
  const modoEscuroAtivo = document.body.classList.contains(TEMA_DARK);
  botaoDark.textContent = modoEscuroAtivo ? 'Light mode' : 'Dark mode';
  botaoDark.setAttribute('aria-pressed', modoEscuroAtivo ? 'true' : 'false');
}

function mostrarStatus(el, texto, isErro) {
  if (!el) return;
  el.textContent = texto;
  el.classList.toggle('hidden', !texto);
  el.classList.toggle('status-msg--error', Boolean(isErro && texto));
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

async function carregarAuth() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    authState = await r.json();
  } catch {
    authState = { authenticated: false };
  }

  if (authState.authenticated && authState.user) {
    linkEntrar.classList.add('hidden');
    userChip.textContent = authState.user.name || authState.user.email || 'Logado';
    userChip.classList.remove('hidden');
    linkSair.classList.remove('hidden');
    pdfLocalAviso.classList.add('hidden');
  } else {
    linkEntrar.classList.remove('hidden');
    userChip.classList.add('hidden');
    linkSair.classList.add('hidden');
    pdfLocalAviso.classList.remove('hidden');
  }

  await carregarFavoritosLista();
}

async function carregarFavoritosLista() {
  favoritoIds = new Set();
  listaFavoritos.innerHTML = '';
  if (!authState.authenticated) {
    listaFavoritos.innerHTML =
      '<p class="empty-state">Entre com Google para guardar favoritos neste dispositivo.</p>';
    mostrarStatus(favoritosStatus, '', false);
    return;
  }

  try {
    const r = await fetch('/api/favorites', { credentials: 'same-origin' });
    if (!r.ok) {
      mostrarStatus(favoritosStatus, 'Não foi possível carregar favoritos.', true);
      return;
    }
    const data = await r.json();
    const favs = data.favorites || [];
    favs.forEach((f) => favoritoIds.add(Number(f.id)));
    if (favs.length === 0) {
      listaFavoritos.innerHTML = '<p class="empty-state">Nenhum favorito ainda.</p>';
    } else {
      listaFavoritos.innerHTML = favs.map((f) => cardFavoritoHtml(f)).join('');
      listaFavoritos.querySelectorAll('[data-remove-fav]').forEach((btn) => {
        btn.addEventListener('click', () => removerFavorito(Number(btn.getAttribute('data-remove-fav'))));
      });
    }
    mostrarStatus(favoritosStatus, '', false);
  } catch {
    mostrarStatus(favoritosStatus, 'Erro de rede ao carregar favoritos.', true);
  }
}

function cardFavoritoHtml(f) {
  const cover = f.cover
    ? `<img src="${esc(f.cover)}" alt="Capa: ${esc(f.title)}" width="120" height="180" loading="lazy">`
    : '<div class="card__placeholder" aria-hidden="true">Sem capa</div>';
  const autores = (f.authors || []).join(', ') || '—';
  return `
    <article class="card">
      <div class="card__media">${cover}</div>
      <div class="card__body">
        <h3 class="card__title">${esc(f.title)}</h3>
        <p class="card__meta">${esc(autores)}</p>
        <div class="card__actions">
          <a class="btn btn--primary" href="/read.html?id=${esc(f.id)}">Ler</a>
          <button type="button" class="btn btn--ghost" data-remove-fav="${esc(f.id)}">Remover</button>
        </div>
      </div>
    </article>
  `;
}

function cardCatalogoHtml(book) {
  const cover =
    book.formats?.['image/jpeg'] || book.formats?.['image/png'] || '';
  const titulo = book.title || 'Sem título';
  const img = cover
    ? `<img src="${esc(cover)}" alt="Capa: ${esc(titulo)}" width="120" height="180" loading="lazy">`
    : '<div class="card__placeholder" aria-hidden="true">Sem capa</div>';
  const autores = (book.authors || []).map((a) => a.name).join(', ') || '—';
  const assuntos = (book.subjects || []).slice(0, 4).join(' · ') || 'Domínio público';
  const id = Number(book.id);
  const fav = favoritoIds.has(id);
  const favBtn = authState.authenticated
    ? `<button type="button" class="btn btn--ghost btn--icon" data-fav="${id}" aria-label="${fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">${fav ? '★' : '☆'}</button>`
    : '';

  return `
    <article class="card">
      <div class="card__media">${img}</div>
      <div class="card__body">
        <h3 class="card__title">${esc(titulo)}</h3>
        <p class="card__meta">${esc(autores)}</p>
        <p class="card__snippet">${esc(assuntos)}</p>
        <div class="card__actions">
          <a class="btn btn--primary" href="/read.html?id=${esc(id)}">Ler no site</a>
          ${favBtn}
        </div>
      </div>
    </article>
  `;
}

async function alternarFavorito(id) {
  if (!authState.authenticated) {
    window.location.href = '/login.html';
    return;
  }
  if (favoritoIds.has(id)) {
    await removerFavorito(id);
    return;
  }
  try {
    const r = await fetch('/api/favorites', {
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
      await removerFavorito(id);
      return;
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      alert(err.error || 'Não foi possível salvar.');
      return;
    }
    const data = await r.json();
    (data.favorites || []).forEach((f) => favoritoIds.add(Number(f.id)));
    await carregarCatalogo(false);
    await carregarFavoritosLista();
  } catch {
    alert('Erro de rede ao salvar favorito.');
  }
}

async function removerFavorito(id) {
  try {
    const r = await fetch(`/api/favorites/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    if (!r.ok) return;
    favoritoIds.delete(Number(id));
    await carregarCatalogo(false);
    await carregarFavoritosLista();
  } catch {
    mostrarStatus(favoritosStatus, 'Erro ao remover favorito.', true);
  }
}

async function carregarCatalogo(mostrarLoading) {
  if (mostrarLoading) {
    mostrarStatus(catalogoStatus, 'Carregando…', false);
  }
  listaLivros.innerHTML = '';

  const params = new URLSearchParams();
  if (buscaAtual) params.set('search', buscaAtual);
  if (paginaAtual > 1) params.set('page', String(paginaAtual));

  try {
    const r = await fetch(`/api/livros?${params.toString()}`, { credentials: 'same-origin' });
    if (!r.ok) {
      mostrarStatus(catalogoStatus, 'Não foi possível carregar o catálogo.', true);
      pager.classList.add('hidden');
      return;
    }
    ultimoPayload = await r.json();
    const results = ultimoPayload.results || [];

    if (results.length === 0) {
      listaLivros.innerHTML = '<p class="empty-state">Nenhum resultado. Tente outra busca.</p>';
    } else {
      listaLivros.innerHTML = results.map(cardCatalogoHtml).join('');
      listaLivros.querySelectorAll('[data-fav]').forEach((btn) => {
        btn.addEventListener('click', () => alternarFavorito(Number(btn.getAttribute('data-fav'))));
      });
    }

    const total = ultimoPayload.count ?? results.length;
    pagerInfo.textContent = `Página ${paginaAtual} · ${total} obras (idioma pt)`;
    pager.classList.remove('hidden');
    btnAnterior.disabled = !ultimoPayload.previous;
    btnProximo.disabled = !ultimoPayload.next;

    mostrarStatus(catalogoStatus, '', false);
  } catch {
    mostrarStatus(catalogoStatus, 'Erro de rede.', true);
    pager.classList.add('hidden');
  }
}

formBusca.addEventListener('submit', (e) => {
  e.preventDefault();
  buscaAtual = (campoBusca.value || '').trim();
  paginaAtual = 1;
  carregarCatalogo(true);
});

btnAnterior.addEventListener('click', () => {
  if (paginaAtual <= 1) return;
  paginaAtual -= 1;
  carregarCatalogo(true);
});

btnProximo.addEventListener('click', () => {
  if (!ultimoPayload?.next) return;
  paginaAtual += 1;
  carregarCatalogo(true);
});

if (localStorage.getItem('tema') === TEMA_DARK) {
  document.body.classList.add(TEMA_DARK);
}

atualizarTextoBotao();

botaoDark.addEventListener('click', () => {
  const modoEscuroAtivo = document.body.classList.toggle(TEMA_DARK);
  if (modoEscuroAtivo) {
    localStorage.setItem('tema', TEMA_DARK);
  } else {
    localStorage.removeItem('tema');
  }
  atualizarTextoBotao();
});

carregarAuth().then(() => carregarCatalogo(true));
