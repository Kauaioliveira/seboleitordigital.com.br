'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('./test-env');

describe('GET /api/download/:id', () => {
  test('sem sessao redireciona para login', async () => {
    const res = await request(app).get('/api/download/codigolimpo').expect(302);
    assert.ok(String(res.headers.location).includes('login'));
  });

  test('id invalido retorna 400 JSON', async () => {
    const agent = request.agent(app);
    await agent.get('/__test/login').expect(200);
    const res = await agent.get('/api/download/nao!valido').expect(400);
    assert.equal(res.body.error, 'id invalido.');
  });

  test('id valido mas arquivo inexistente retorna 404', async () => {
    const agent = request.agent(app);
    await agent.get('/__test/login').expect(200);
    const res = await agent.get('/api/download/livro-que-nao-existe').expect(404);
    assert.equal(res.body.error, 'Arquivo nao encontrado.');
  });

  test('id valido e PDF existente retorna 200', async () => {
    const agent = request.agent(app);
    await agent.get('/__test/login').expect(200);
    const res = await agent.get('/api/download/codigolimpo').expect(200);
    const cd = String(res.headers['content-disposition'] || '');
    assert.ok(
      cd.includes('codigolimpo.pdf'),
      `Content-Disposition inesperado: ${cd}`
    );
  });
});
