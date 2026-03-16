require('dotenv').config();

const express = require('express');
const path = require ('path');
const session = require ('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const PORT = 3000;
const LIVROS_DIR = path.join(__dirname,  'livros');

//SESSÃO
app.use(session({
    secret: process.env.SESSION_SECRET || 'sua-chave-secreta-aqui',
    resave: false,
    saveUninitialized: false
}));

//PASSPORT
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user,done) => done(null, user));
passport.deserializeUser((user,done)=> done(null, user));

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/google/callback'
  },
    (accessToken,refreshToken,profile, done) => {
        done(null, {
          id: profile.id,
           email: profile.emails?.[0]?.value,
            name: profile.displayName
          });
        }
      ));

//Site estaticco (html, css, js, imagens)
app.use(express.static(path.join(__dirname, 'public')));

//função: só sontinua se estiver logado
function soLogado(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/login.html');
}

//rotas Google
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login.html' }),
    (req,res) => { res.redirect('/');}
);

app.get('/auth/logout', (req, res) => {
    req.logout((err) =>{
        if(err) return res.redirect('/');
        res.redirect('/login.html');
    });
});

//Download: só para logados
app.get('/api/download/:id', soLogado, (req, res) => {
    const id = req.params.id;
    if (id.includes('..') || id.includes('/')) {
      return res.status(400).json({ error: 'id inválido.' });
    }
    const fs = require('fs');
    const arquivo = path.join(LIVROS_DIR, `${id}.pdf`);
    if (!fs.existsSync(arquivo)) {
      return res.status(404).json({ error: 'Arquivo não encontrado.' });
    }
    res.download(arquivo, `${id}.pdf`);
  });

  // 7) Página inicial: quem não está logado vai para login
app.get('/', (req, res, next) => {
    if (!req.isAuthenticated()) return res.redirect('/login.html');
    next();
  });
  app.listen(PORT, () => {
    console.log('Servidor em http://localhost:' + PORT);
  });