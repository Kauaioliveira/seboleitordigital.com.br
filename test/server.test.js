'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('./test-env');

describe('rotas publicas', () => {
  test('GET / retorna index (catalogo publico)', async () => {
    const res = await request(app).get('/').expect(200);
    assert.ok(
      String(res.text).includes('<html'),
      'Resposta deveria ser HTML da home'
    );
  });

  test('GET /read.html retorna 200', async () => {
    await request(app).get('/read.html').expect(200);
  });

  test('GET /login.html retorna 200', async () => {
    await request(app).get('/login.html').expect(200);
  });

  test('GET /auth/google inicia fluxo OAuth (redirect)', async () => {
    const res = await request(app).get('/auth/google').expect(302);
    assert.ok(
      String(res.headers.location).includes('google'),
      `Location inesperada: ${res.headers.location}`
    );
  });

  test('GET /style.css (estatico) retorna 200', async () => {
    const res = await request(app).get('/style.css').expect(200);
    assert.ok(
      String(res.headers['content-type'] || '').includes('css'),
      `Content-Type inesperado: ${res.headers['content-type']}`
    );
  });

  test('GET /__test/login cria sessao (apenas NODE_ENV=test)', async () => {
    await request(app).get('/__test/login').expect(200);
  });
});

describe('com sessao autenticada', () => {
  test('GET /login.html redireciona para / quando ja logado', async () => {
    const agent = request.agent(app);
    await agent.get('/__test/login').expect(200);
    const res = await agent.get('/login.html').expect(302);
    assert.equal(res.headers.location, '/');
  });

  test('GET /auth/logout encerra sessao e redireciona para home', async () => {
    const agent = request.agent(app);
    await agent.get('/__test/login').expect(200);
    const res = await agent.get('/auth/logout').expect(302);
    assert.equal(res.headers.location, '/');
    await agent.get('/').expect(200);
  });
});
