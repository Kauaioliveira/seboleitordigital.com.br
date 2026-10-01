'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Processo separado: o server.js le as variaveis de ambiente ao ser carregado.
test('sem chaves do Google o servidor sobe e desliga so o login', () => {
  const script = `
    const request = require('supertest');
    const app = require(${JSON.stringify(path.join(__dirname, '..', 'server.js'))});
    (async () => {
      const me = await request(app).get('/api/auth/me');
      const auth = await request(app).get('/auth/google');
      const home = await request(app).get('/');
      console.log(JSON.stringify({ me: me.body, auth: [auth.status, auth.headers.location], home: home.status }));
    })();
  `;
  const env = { ...process.env, NODE_ENV: 'test', SESSION_SECRET: 'x' };
  delete env.GOOGLE_CLIENT_ID;
  delete env.GOOGLE_CLIENT_SECRET;
  const r = spawnSync(process.execPath, ['-e', script], {
    env,
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.equal(out.me.loginDisponivel, false);
  assert.deepEqual(out.auth, [302, '/login.html']);
  assert.equal(out.home, 200);
});
