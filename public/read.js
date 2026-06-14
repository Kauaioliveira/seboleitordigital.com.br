const readTitle = document.getElementById('readTitle');
const readStatus = document.getElementById('readStatus');
const readFrame = document.getElementById('readFrame');
const readFrameWrap = document.getElementById('readFrameWrap');
const readExternal = document.getElementById('readExternal');
const readFallback = document.getElementById('readFallback');

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

function linksDownloadHtml(formats) {
  const keys = Object.keys(formats || {}).sort();
  if (!keys.length) return '<p>Formatos não disponíveis para este título.</p>';
  return `<ul class="link-list">${keys
    .map((mime) => {
      const url = formats[mime];
      return `<li><a href="${esc(url)}" rel="noopener noreferrer" target="_blank">${esc(mime)}</a></li>`;
    })
    .join('')}</ul>`;
}

(async function init() {
  document.body.classList.add('read-page--leitor');
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id || !/^\d+$/.test(id)) {
    readTitle.textContent = 'Livro';
    mostrarStatus('Use ?id= com o identificador numérico do Gutendex (ex.: ?id=84).', true);
    return;
  }

  mostrarStatus('Carregando metadados…', false);
  let book;
  try {
    const r = await fetch(`/api/livros/${id}`, { credentials: 'same-origin' });
    if (!r.ok) {
      mostrarStatus('Não foi possível carregar este livro.', true);
      readTitle.textContent = 'Erro';
      return;
    }
    book = await r.json();
  } catch {
    mostrarStatus('Erro de rede.', true);
    readTitle.textContent = 'Erro';
    return;
  }

  readTitle.textContent = book.title || 'Livro';
  mostrarStatus('', false);

  const formats = book.formats || {};
  const htmlUrl = formats['text/html'];
  const plainUrl =
    formats['text/plain; charset=utf-8'] || formats['text/plain'];

  const alvo = htmlUrl || plainUrl;
  if (alvo) {
    const proxyUrl = `/api/read-proxy?url=${encodeURIComponent(alvo)}`;
    readFrame.src = proxyUrl;
    readFrameWrap.classList.remove('hidden');
    readExternal.href = alvo;
    readExternal.classList.remove('hidden');
    readExternal.textContent = 'Abrir na origem (Gutenberg)';
  } else {
    readFallback.classList.remove('hidden');
    readFallback.innerHTML = `
      <p>Não há HTML ou texto simples listado para leitura embutida. Baixe outro formato:</p>
      ${linksDownloadHtml(formats)}
    `;
  }
})();
