require('dotenv').config();

const fs = require('fs');
const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const LIVROS_DIR = path.join(__dirname, 'livros');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_SECRET = process.env.SESSION_SECRET;
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL ||
  `http://localhost:${PORT}/auth/google/callback`;

if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET nao foi definido no ambiente.');
}

app.set('trust proxy', 1);

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24
  }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new GoogleStrategy(
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
));

app.use(express.static(PUBLIC_DIR, { index: false }));

function soLogado(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login.html');
}

app.get('/login.html', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }

  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

app.get('/', soLogado, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get(
  '/auth/google/callback',
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
      res.redirect('/login.html');
    });
  });
});

app.get('/api/download/:id', soLogado, (req, res) => {
  const id = req.params.id;

  if (!/^[a-z0-9-]+$/i.test(id)) {
    return res.status(400).json({ error: 'id invalido.' });
  }

  const arquivo = path.join(LIVROS_DIR, `${id}.pdf`);

  fs.access(arquivo, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ error: 'Arquivo nao encontrado.' });
    }

    res.download(arquivo, `${id}.pdf`, (downloadErr) => {
      if (downloadErr && !res.headersSent) {
        res.status(500).json({ error: 'Nao foi possivel baixar o arquivo.' });
      }
    });
  });
});

app.listen(PORT, () => {
  console.log(`Servidor em http://localhost:${PORT}`);
});
