//server.js

const express = require('express');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = 3000;  

//Pasta dos arquivos (não exposta diretamente)
const   LIVROS_DIR = path.join(__dirname, 'livros');

//sessão simples ()
app.use(session({ 
    secret:'sua-chave-secreta-aqui',
    resave: false,
    saveUninitialized: false
}));

//servir site estatico
app.use(express.static(path.join(__dirname,'public')));

//Rota de download protegida: só quem está "logado" baixa
app.get('/api/download/:id', (req, res) => {
    if (!req.session.user){
        return res.status(401).json({error: 'faça login para baixar'});
    }

    const id = req.params.id;
    //Evitar ../ no id (segurança)
    if(id.includes('..')|| id.includes('/')) {
        return res.status(400).json({error: 'id inválido.'});
    }

    const  arquivo = path.join(LIVROS_DIR, `${id}.pdf`);
    const fs = require('fs');
    if (!fs.existsSync(arquivo)) {
        return res.status(404).json({error: 'Arquivo não encontrado.'});
    }

    const nomeAmigavel = `${id}.pdf`;
    res.download(arquivo, nomeAmigavel);
});

//Exemplo de "login"
app.post('/api/login', express.json(), (req, res) =>{
    const {email,senha} = req.body || {};
    //Validação
    req.session.user = {  email: email || 'user@teste.com'};
    res.json({ ok :true});
});
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
  });
  
  app.listen(PORT, () => {
    console.log(`Servidor em http://localhost:${PORT}`);
  });