'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const nock = require('nock');
const request = require('supertest');

const app = require('./test-env');

beforeEach(() => {
  nock.cleanAll();
});

afterEach(() => {
  nock.cleanAll();
});

describe('GET /api/livros', () => {
  test('page invalido retorna 400', async () => {
    await request(app).get('/api/livros?page=0').expect(400);
  });

  test('proxies Gutendex e retorna JSON', async () => {
    nock('https://gutendex.com')
      .get('/books/')
      .query(true)
      .reply(200, {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 999,
            title: 'Obra teste',
            authors: [{ name: 'Autor' }],
            languages: ['pt'],
            subjects: ['Ficcao'],
            formats: {}
          }
        ]
      });

    const res = await request(app)
      .get('/api/livros')
      .query({ search: 'machado' })
      .expect(200);

    assert.equal(res.body.count, 1);
    assert.equal(res.body.results[0].id, 999);
  });
});

describe('GET /api/livros/:id', () => {
  test('id nao numerico retorna 400', async () => {
    await request(app).get('/api/livros/abc').expect(400);
  });

  test('detalhe Gutendex', async () => {
    nock('https://gutendex.com')
      .get('/books/84/')
      .reply(200, {
        id: 84,
        title: 'Frankenstein',
        formats: { 'text/html': 'https://www.gutenberg.org/foo.html' },
        authors: [{ name: 'Shelley' }]
      });

    const res = await request(app).get('/api/livros/84').expect(200);
    assert.equal(res.body.id, 84);
  });
});

describe('GET /api/read-proxy', () => {
  test('rejeita host nao permitido', async () => {
    const u = encodeURIComponent('https://evil.com/x');
    await request(app).get(`/api/read-proxy?url=${u}`).expect(403);
  });

  test('rejeita URL com credenciais embutidas', async () => {
    const u = encodeURIComponent('https://user:pass@www.gutenberg.org/x.html');
    await request(app).get(`/api/read-proxy?url=${u}`).expect(400);
  });

  test('HTML do Gutenberg recebe tema claro injetado', async () => {
    nock('https://www.gutenberg.org')
      .get('/dummy.html')
      .reply(
        200,
        '<!DOCTYPE html><html><head><title>T</title></head><body><p>Hi</p></body></html>',
        { 'Content-Type': 'text/html; charset=utf-8' }
      );

    const u = encodeURIComponent('https://www.gutenberg.org/dummy.html');
    const res = await request(app).get(`/api/read-proxy?url=${u}`).expect(200);
    assert.ok(String(res.text).includes('sebo-leitor-fix'));
    assert.ok(String(res.text).includes('color-scheme: light only'));
  });
});

describe('GET /api/read-proxy (endurecimento)', () => {
  test('HTML recebe <base> da origem e CSP sem scripts', async () => {
    nock('https://www.gutenberg.org')
      .get('/cache/epub/1/pg1-images.html')
      .reply(200, '<html><head></head><body><img src="images/a.jpg"></body></html>', {
        'Content-Type': 'text/html'
      });

    const u = encodeURIComponent('https://www.gutenberg.org/cache/epub/1/pg1-images.html');
    const res = await request(app).get(`/api/read-proxy?url=${u}`).expect(200);
    assert.ok(
      String(res.text).includes('<base href="https://www.gutenberg.org/cache/epub/1/pg1-images.html">')
    );
    assert.ok(String(res.headers['content-security-policy']).includes("script-src 'none'"));
  });

  test('segue redirect dentro do gutenberg e usa a URL final como base', async () => {
    nock('https://www.gutenberg.org')
      .get('/ebooks/1.html.images')
      .reply(302, '', { Location: '/cache/epub/1/pg1-images.html' })
      .get('/cache/epub/1/pg1-images.html')
      .reply(200, '<html><head></head><body>ok</body></html>', { 'Content-Type': 'text/html' });

    const u = encodeURIComponent('https://www.gutenberg.org/ebooks/1.html.images');
    const res = await request(app).get(`/api/read-proxy?url=${u}`).expect(200);
    assert.ok(String(res.text).includes('/cache/epub/1/pg1-images.html"'));
  });

  test('redirect para http do proprio gutenberg vira https', async () => {
    nock('https://www.gutenberg.org')
      .get('/ebooks/2.html.images')
      .reply(302, '', { Location: 'http://www.gutenberg.org/cache/epub/2/pg2-images.html' })
      .get('/cache/epub/2/pg2-images.html')
      .reply(200, '<html><head></head><body>ok</body></html>', { 'Content-Type': 'text/html' });

    const u = encodeURIComponent('https://www.gutenberg.org/ebooks/2.html.images');
    const res = await request(app).get(`/api/read-proxy?url=${u}`).expect(200);
    assert.ok(
      String(res.text).includes('<base href="https://www.gutenberg.org/cache/epub/2/pg2-images.html">')
    );
  });

  test('redirect para http fora do gutenberg continua bloqueado', async () => {
    nock('https://www.gutenberg.org')
      .get('/redir-http.html')
      .reply(302, '', { Location: 'http://evil.example/x' });

    const u = encodeURIComponent('https://www.gutenberg.org/redir-http.html');
    await request(app).get(`/api/read-proxy?url=${u}`).expect(403);
  });

  test('bloqueia redirect para host fora do gutenberg', async () => {
    nock('https://www.gutenberg.org')
      .get('/redir.html')
      .reply(302, '', { Location: 'https://evil.example/x' });

    const u = encodeURIComponent('https://www.gutenberg.org/redir.html');
    await request(app).get(`/api/read-proxy?url=${u}`).expect(403);
  });

  test('recusa formatos que nao sao texto', async () => {
    nock('https://www.gutenberg.org')
      .get('/x.svg')
      .reply(200, '<svg></svg>', { 'Content-Type': 'image/svg+xml' });

    const u = encodeURIComponent('https://www.gutenberg.org/x.svg');
    await request(app).get(`/api/read-proxy?url=${u}`).expect(415);
  });

  test('recusa conteudo acima do limite', async () => {
    nock('https://www.gutenberg.org')
      .get('/grande.txt')
      .reply(200, 'x', {
        'Content-Type': 'text/plain',
        'Content-Length': String(50 * 1024 * 1024)
      });

    const u = encodeURIComponent('https://www.gutenberg.org/grande.txt');
    await request(app).get(`/api/read-proxy?url=${u}`).expect(413);
  });

  test('texto simples vira HTML escapado', async () => {
    nock('https://www.gutenberg.org')
      .get('/livro.txt')
      .reply(200, 'Capitulo <1>', { 'Content-Type': 'text/plain; charset=utf-8' });

    const u = encodeURIComponent('https://www.gutenberg.org/livro.txt');
    const res = await request(app).get(`/api/read-proxy?url=${u}`).expect(200);
    assert.ok(String(res.text).includes('Capitulo &lt;1&gt;'));
  });
});

describe('rotas inexistentes', () => {
  test('API responde 404 em JSON', async () => {
    const res = await request(app).get('/api/nao-existe').expect(404);
    assert.equal(res.body.error, 'rota nao encontrada.');
  });

  test('pagina inexistente responde 404 em HTML', async () => {
    const res = await request(app).get('/pagina-que-nao-existe').expect(404);
    assert.ok(String(res.headers['content-type']).includes('html'));
  });
});

describe('GET /api/auth/me', () => {
  test('nao autenticado retorna authenticated false', async () => {
    const res = await request(app).get('/api/auth/me').expect(200);
    assert.equal(res.body.authenticated, false);
  });

  test('autenticado retorna usuario', async () => {
    const agent = request.agent(app);
    await agent.get('/__test/login').expect(200);
    const res = await agent.get('/api/auth/me').expect(200);
    assert.equal(res.body.authenticated, true);
    assert.ok(res.body.user?.name);
  });
});

describe('GET /api/favorites', () => {
  test('sem login retorna 401', async () => {
    const res = await request(app).get('/api/favorites').expect(401);
    assert.equal(res.body.error, 'auth_required');
  });
});
