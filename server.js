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
              baseUri: ["'self'"],
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

const READER_INJECT_SNIPPET = `<meta name="color-scheme" content="light only">
<style id="sebo-leitor-fix">
:root, html { color-scheme: light only !important; }
html { background: #faf8f5 !important; }
body { background: #faf8f5 !important; color: #1a1918 !important; }
a:link { color: #0b57d0 !important; }
a:visited { color: #6b2d92 !important; }
</style>`;

function injectReaderHtmlFixes(htmlBuffer) {
  const s = htmlBuffer.toString('utf8');
  if (/<head(\s[^>]*)?>/i.test(s)) {
    return s.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${READER_INJECT_SNIPPET}`);
  }
  if (/<html(\s[^>]*)?>/i.test(s)) {
    return s.replace(/<html(\s[^>]*)?>/i, (m) => `${m}<head>${READER_INJECT_SNIPPET}</head>`);
  }
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8">${READER_INJECT_SNIPPET}</head><body>${s}</body></html>`;
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
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  app.get(
    '/auth/google/callback',
    authLimiter,
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
      return res.json({ authenticated: false });
    }
    res.json({
      authenticated: true,
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
      target = new URL(decodeURIComponent(raw));
    } catch {
      return res.status(400).json({ error: 'url invalida.' });
    }

    if (target.protocol !== 'https:') {
      return res.status(400).json({ error: 'apenas https.' });
    }

    if (target.username || target.password) {
      return res.status(400).json({ error: 'url com credenciais nao permitida.' });
    }

    if (!isAllowedReadHost(target.hostname)) {
      return res.status(403).json({ error: 'host nao permitido.' });
    }

    try {
      const upstream = await fetch(target, {
        headers: {
          'User-Agent':
            'SeboLeitorDigital/1.0 (portfolio; +https://github.com/Kauaioliveira/seboleitordigital.com.br)'
        }
      });
      if (!upstream.ok) {
        return res.status(502).json({ error: 'origem indisponivel.' });
      }
      const ct = upstream.headers.get('content-type') || 'text/plain; charset=utf-8';
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');

      const buffer = Buffer.from(await upstream.arrayBuffer());
      const lowerCt = ct.toLowerCase();

      if (lowerCt.includes('text/html')) {
        const fixed = injectReaderHtmlFixes(buffer);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(Buffer.from(fixed, 'utf8'));
        return;
      }

      if (lowerCt.includes('text/plain')) {
        const wrapped = wrapPlainTextAsReadableHtml(buffer.toString('utf8'));
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(Buffer.from(wrapped, 'utf8'));
        return;
      }

      res.setHeader('Content-Type', ct);
      res.send(buffer);
    } catch {
      res.status(502).json({ error: 'falha ao buscar conteudo.' });
    }
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
