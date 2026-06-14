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
