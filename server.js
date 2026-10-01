require('dotenv').config();

const fs = require('fs');
const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pino = require('pino');
const pinoHttp = require('pino-http');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const LIVROS_DIR = path.join(__dirname, 'livros');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_SECRET = process.env.SESSION_SECRET;
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL ||
  `http://localhost:${PORT}/auth/google/callback`;

const GUTENDEX_ORIGIN = 'https://gutendex.com';
const GUTENDEX_CACHE_MS = 60_000;
const gutendexCache = new Map();
const testMode = process.env.NODE_ENV === 'test';
// Sem as chaves do Google o site sobe normalmente; so o login fica desligado.
const googleConfigurado = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);
const prodMode = process.env.NODE_ENV === 'production';

if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET nao foi definido no ambiente.');
}

const logger = pino({
  level: process.env.LOG_LEVEL || (prodMode ? 'info' : 'debug')
});

app.set('trust proxy', 1);

if (!testMode) {
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/favicon.ico' }
    })
  );
}

if (!testMode && process.env.SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      tracesSampleRate: Math.min(
        1,
        Math.max(0, Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.05)
      ),
      integrations: [Sentry.expressIntegration()]
    });
  } catch (e) {
    logger.warn({ err: String(e) }, 'Sentry init falhou');
  }
}

if (!testMode) {
  app.use(
    helmet({
      contentSecurityPolicy: prodMode
        ? {
            useDefaults: true,
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
              fontSrc: ["'self'", 'https://fonts.gstatic.com'],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'"],
              frameSrc: ["'self'"],
              frameAncestors: ["'self'"],
              // O leitor injeta <base> do Gutenberg no texto (iframe srcdoc herda esta CSP).
              baseUri: ["'self'", 'https://www.gutenberg.org', 'https://gutenberg.org'],
              formAction: ["'self'", 'https://accounts.google.com'],
              upgradeInsecureRequests: []
            }
          }
        : false,
      crossOriginEmbedderPolicy: false
    })
  );
}

app.use(express.json({ limit: '32kb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: testMode ? 800 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde e tente de novo.' }
});

const apiGutendexLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: testMode ? 4000 : 90,
  standardHeaders: true,
  legacyHeaders: false
});

const readProxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: testMode ? 3000 : 45,
  standardHeaders: true,
  legacyHeaders: false
});

function soLogado(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login.html');
}

function soLogadoApi(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'auth_required' });
}

function ensureFavorites(req) {
  if (!Array.isArray(req.session.favorites)) {
    req.session.favorites = [];
  }
  return req.session.favorites;
}

function isAllowedReadHost(hostname) {
  return (
    hostname === 'www.gutenberg.org' ||
    hostname === 'gutenberg.org' ||
    hostname.endsWith('.gutenberg.org')
  );
}

const READ_PROXY_MAX_BYTES = 12 * 1024 * 1024;
const READ_PROXY_MAX_REDIRECTS = 4;
// O conteudo do Gutenberg roda na nossa origem (iframe): nada de scripts.
const READ_PROXY_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline' https:",
  'img-src https: data:',
  'font-src https: data:',
  'base-uri https:',
  "form-action 'none'",
  "frame-ancestors 'self'"
].join('; ');

function validarUrlLeitura(target) {
  if (target.protocol !== 'https:') {
    return { status: 400, error: 'apenas https.' };
  }
  if (target.username || target.password) {
    return { status: 400, error: 'url com credenciais nao permitida.' };
  }
  if (!isAllowedReadHost(target.hostname)) {
    return { status: 403, error: 'host nao permitido.' };
  }
  return null;
}

// Segue redirects manualmente para validar o host de cada salto (evita SSRF via redirect).
async function buscarSeguindoRedirects(inicial) {
  let atual = inicial;
  for (let salto = 0; salto <= READ_PROXY_MAX_REDIRECTS; salto += 1) {
    const upstream = await fetch(atual, {
      redirect: 'manual',
      headers: {
        'User-Agent':
          'SeboLeitorDigital/1.0 (portfolio; +https://github.com/Kauaioliveira/seboleitordigital.com.br)'
      }
    });
    if (upstream.status < 300 || upstream.status >= 400) {
      return { upstream, finalUrl: atual };
    }
    const location = upstream.headers.get('location');
    if (!location) {
      return { upstream, finalUrl: atual };
    }
    const proximo = new URL(location, atual);
    // O Gutenberg as vezes redireciona para http://; dentro do proprio Gutenberg, sobe para https.
    if (proximo.protocol === 'http:' && isAllowedReadHost(proximo.hostname)) {
      proximo.protocol = 'https:';
    }
    const invalido = validarUrlLeitura(proximo);
    if (invalido) {
      const err = new Error('redirect para host nao permitido.');
      err.status = 403;
      throw err;
    }
    atual = proximo;
  }
  const err = new Error('redirects demais.');
  err.status = 502;
  throw err;
}

async function lerCorpoComLimite(upstream, limite) {
  const declarado = Number(upstream.headers.get('content-length'));
  const muitoGrande = () => {
    const err = new Error('conteudo grande demais para o leitor.');
    err.status = 413;
    return err;
  };
  if (Number.isFinite(declarado) && declarado > limite) {
    throw muitoGrande();
  }
  if (!upstream.body) return Buffer.alloc(0);
  const partes = [];
  let total = 0;
  for await (const parte of upstream.body) {
    total += parte.length;
    if (total > limite) throw muitoGrande();
    partes.push(Buffer.from(parte));
  }
  return Buffer.concat(partes);
}

function escapeHtmlAttr(text) {
  return escapeHtmlPlain(text).replace(/"/g, '&quot;');
}

const READER_INJECT_SNIPPET = `<meta name="color-scheme" content="light only">
<style id="sebo-leitor-fix">
:root, html { color-scheme: light only !important; }
html { background: #faf8f5 !important; }
body { background: #faf8f5 !important; color: #1a1918 !important; }
a:link { color: #0b57d0 !important; }
a:visited { color: #6b2d92 !important; }
</style>`;

function injectReaderHtmlFixes(htmlBuffer, baseHref) {
  const s = htmlBuffer.toString('utf8');
  // <base> faz imagens e CSS relativos do Gutenberg carregarem da origem certa.
  const base = baseHref ? `<base href="${escapeHtmlAttr(baseHref)}">` : '';
  const snippet = `${base}${READER_INJECT_SNIPPET}`;
  if (/<head(\s[^>]*)?>/i.test(s)) {
    return s.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${snippet}`);
  }
  if (/<html(\s[^>]*)?>/i.test(s)) {
    return s.replace(/<html(\s[^>]*)?>/i, (m) => `${m}<head>${snippet}</head>`);
  }
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8">${snippet}</head><body>${s}</body></html>`;
}

function escapeHtmlPlain(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function wrapPlainTextAsReadableHtml(plain) {
  const esc = escapeHtmlPlain(plain);
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><meta name="color-scheme" content="light only">
<style>html,body{color-scheme:light only;background:#faf8f5!important;color:#1a1918!important;margin:0;font:1rem/1.65 system-ui,Segoe UI,sans-serif}pre{white-space:pre-wrap;padding:1rem 1.25rem;margin:0}</style>
</head><body><pre>${esc}</pre></body></html>`;
}

function gutendexCacheGet(key) {
  const hit = gutendexCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    gutendexCache.delete(key);
    return null;
  }
  return hit.body;
}

function gutendexCacheSet(key, body) {
  gutendexCache.set(key, { body, exp: Date.now() + GUTENDEX_CACHE_MS });
}

async function fetchGutendexUrl(relPath) {
  const url = `${GUTENDEX_ORIGIN}${relPath}`;
  if (!testMode) {
    const cached = gutendexCacheGet(url);
    if (cached) return cached;
  }

  const res = await fetch(url, {
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) {
    const err = new Error(`Gutendex ${res.status}`);
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }
  const body = await res.json();
  if (!testMode) {
    gutendexCacheSet(url, body);
  }
  return body;
}

async function maybeCreateRedisSessionStore() {
  if (testMode || !process.env.REDIS_URL) {
    return undefined;
  }
  try {
    const { createClient } = require('redis');
    const RedisStore = require('connect-redis').default;
    const client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (err) => logger.error({ err }, 'redis_client_error'));
    await client.connect();
    logger.info('Sessao: Redis (connect-redis)');
    return new RedisStore({ client, prefix: 'sess:' });
  } catch (err) {
    logger.warn({ err: String(err) }, 'Redis indisponivel; sessao em memoria');
    return undefined;
  }
}

function registerSessionPassportRoutes(sessionStore) {
  const sessionOpts = {
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: prodMode,
      maxAge: 1000 * 60 * 60 * 24
    }
  };
  if (sessionStore) {
    sessionOpts.store = sessionStore;
  }
  app.use(session(sessionOpts));

  app.use(passport.initialize());
  app.use(passport.session());

  if (testMode) {
    app.get('/__test/login', (req, res, next) => {
      req.login(
        { id: 'test-user', email: 'teste@example.com', name: 'Usuario Teste' },
        (err) => {
          if (err) return next(err);
          res.status(200).type('text/plain').send('ok');
        }
      );
    });
  }

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user));

  if (googleConfigurado) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: GOOGLE_CALLBACK_URL
        },
        (accessToken, refreshToken, profile, done) => {
          done(null, {
            id: profile.id,
            email: profile.emails?.[0]?.value,
            name: profile.displayName
          });
        }
      )
    );
  } else {
    logger.warn('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ausentes: login com Google desligado');
  }

  function exigeGoogle(req, res, next) {
    if (googleConfigurado) return next();
    res.redirect('/login.html');
  }

  app.get('/login.html', (req, res) => {
    if (req.isAuthenticated()) {
      return res.redirect('/');
    }

    res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  app.get(
    '/auth/google',
    authLimiter,
    exigeGoogle,
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  app.get(
    '/auth/google/callback',
    authLimiter,
    exigeGoogle,
    passport.authenticate('google', { failureRedirect: '/login.html' }),
    (req, res) => {
      res.redirect('/');
    }
  );

  app.get('/auth/logout', (req, res) => {
    req.logout((err) => {
      if (err) return res.redirect('/');

      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.redirect('/');
      });
    });
  });

  app.get('/api/auth/me', (req, res) => {
    if (!req.isAuthenticated()) {
      return res.json({ authenticated: false, loginDisponivel: googleConfigurado });
    }
    res.json({
      authenticated: true,
      loginDisponivel: googleConfigurado,
      user: {
        name: req.user.name,
        email: req.user.email
      }
    });
  });

  app.get('/api/livros', apiGutendexLimiter, async (req, res) => {
    const searchRaw = typeof req.query.search === 'string' ? req.query.search : '';
    const search = searchRaw.trim().slice(0, 256);
    const pageRaw = req.query.page;
    let page = 1;
    if (pageRaw !== undefined && pageRaw !== '') {
      const n = Number(pageRaw);
      if (!Number.isInteger(n) || n < 1) {
        return res.status(400).json({ error: 'page invalido.' });
      }
      page = n;
    }

    const params = new URLSearchParams();
    params.set('languages', 'pt');
    if (search) params.set('search', search);
    if (page > 1) params.set('page', String(page));

    const rel = `/books/?${params.toString()}`;

    try {
      const body = await fetchGutendexUrl(rel);
      res.json(body);
    } catch (e) {
      const status = e.status || 502;
      res.status(status).json({ error: 'Nao foi possivel consultar o Gutendex.' });
    }
  });

  app.get('/api/livros/:id', apiGutendexLimiter, async (req, res) => {
    const id = req.params.id;
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'id invalido.' });
    }

    try {
      const body = await fetchGutendexUrl(`/books/${id}/`);
      res.json(body);
    } catch (e) {
      const status = e.status || 502;
      res.status(status).json({ error: 'Livro nao encontrado ou Gutendex indisponivel.' });
    }
  });

  app.get('/api/read-proxy', readProxyLimiter, async (req, res) => {
    const raw = req.query.url;
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'url obrigatoria.' });
    }
    if (raw.length > 4000) {
      return res.status(400).json({ error: 'url muito longa.' });
    }

    let target;
    try {
      target = new URL(raw);
    } catch {
      return res.status(400).json({ error: 'url invalida.' });
    }

    const invalido = validarUrlLeitura(target);
    if (invalido) {
      return res.status(invalido.status).json({ error: invalido.error });
    }

    let upstream;
    try {
      ({ upstream, finalUrl: target } = await buscarSeguindoRedirects(target));
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      return res.status(502).json({ error: 'falha ao buscar conteudo.' });
    }

    if (!upstream.ok) {
      return res.status(502).json({ error: 'origem indisponivel.' });
    }

    const lowerCt = (upstream.headers.get('content-type') || '').toLowerCase();
    const isHtml = lowerCt.includes('text/html');
    const isPlain = lowerCt.includes('text/plain');
    if (!isHtml && !isPlain) {
      return res.status(415).json({ error: 'formato nao suportado no leitor.' });
    }

    let buffer;
    try {
      buffer = await lerCorpoComLimite(upstream, READ_PROXY_MAX_BYTES);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      return res.status(502).json({ error: 'falha ao buscar conteudo.' });
    }

    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', READ_PROXY_CSP);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    const html = isHtml
      ? injectReaderHtmlFixes(buffer, target.href)
      : wrapPlainTextAsReadableHtml(buffer.toString('utf8'));
    res.send(Buffer.from(html, 'utf8'));
  });

  app.get('/api/favorites', soLogadoApi, (req, res) => {
    res.json({ favorites: ensureFavorites(req) });
  });

  app.post('/api/favorites', soLogadoApi, async (req, res) => {
    const id = req.body?.id;
    if (typeof id !== 'number' && typeof id !== 'string') {
      return res.status(400).json({ error: 'id obrigatorio.' });
    }
    const sid = String(id);
    if (!/^\d+$/.test(sid)) {
      return res.status(400).json({ error: 'id invalido.' });
    }

    const list = ensureFavorites(req);
    if (list.some((x) => String(x.id) === sid)) {
      return res.status(409).json({ error: 'ja esta nos favoritos.' });
    }

    try {
      const book = await fetchGutendexUrl(`/books/${sid}/`);
      const authors = (book.authors || []).map((a) => a.name).filter(Boolean);
      const cover =
        book.formats?.['image/jpeg'] ||
        book.formats?.['image/png'] ||
        null;
      const subjects = (book.subjects || []).slice(0, 5);
      list.push({
        id: book.id,
        title: book.title,
        authors,
        subjects,
        cover
      });
      res.status(201).json({ favorites: list });
    } catch (e) {
      const status = e.status || 502;
      res.status(status).json({ error: 'Nao foi possivel obter o livro no Gutendex.' });
    }
  });

  app.delete('/api/favorites/:id', soLogadoApi, (req, res) => {
    const sid = req.params.id;
    if (!/^\d+$/.test(sid)) {
      return res.status(400).json({ error: 'id invalido.' });
    }
    const list = ensureFavorites(req);
    const next = list.filter((x) => String(x.id) !== sid);
    req.session.favorites = next;
    res.json({ favorites: next });
  });

  app.get('/api/download/:id', soLogado, (req, res) => {
    const fileId = req.params.id;

    if (!/^[a-z0-9-]+$/i.test(fileId)) {
      return res.status(400).json({ error: 'id invalido.' });
    }

    const arquivo = path.join(LIVROS_DIR, `${fileId}.pdf`);

    fs.access(arquivo, fs.constants.F_OK, (err) => {
      if (err) {
        return res.status(404).json({ error: 'Arquivo nao encontrado.' });
      }

      res.download(arquivo, `${fileId}.pdf`, (downloadErr) => {
        if (downloadErr && !res.headersSent) {
          res.status(500).json({ error: 'Nao foi possivel baixar o arquivo.' });
        }
      });
    });
  });

  app.use(express.static(PUBLIC_DIR, { index: false }));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'rota nao encontrada.' });
  });

  app.use((req, res) => {
    res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
  });

  if (!testMode && process.env.SENTRY_DSN) {
    try {
      const Sentry = require('@sentry/node');
      Sentry.setupExpressErrorHandler(app);
    } catch (e) {
      logger.warn({ err: String(e) }, 'Sentry error handler falhou');
    }
  }
}

if (require.main === module) {
  (async () => {
    try {
      const store = await maybeCreateRedisSessionStore();
      registerSessionPassportRoutes(store);
      app.listen(PORT, () => {
        logger.info({ port: PORT }, 'servidor_escutando');
      });
    } catch (err) {
      logger.fatal({ err }, 'falha ao iniciar');
      process.exit(1);
    }
  })();
} else {
  registerSessionPassportRoutes(undefined);
}

module.exports = app;
