# Sebo Leitor Digital

Sebo digital com catalogo de livros e quadrinhos, login com Google e download de PDFs apenas para usuarios logados. Projeto de estudo e portfolio (HTML, CSS, JavaScript, Node.js).

## Tecnologias

- **Backend:** Node.js, Express
- **Autenticacao:** Passport.js (Google OAuth 2.0)
- **Front-end:** HTML, CSS, JavaScript (vanilla)
- **Sessao:** express-session

## Funcionalidades

- Login com Google (OAuth)
- Catalogo com descricoes (clique na capa para ver detalhes)
- Download de PDFs somente para usuarios logados
- Dark mode
- Layout responsivo (flexbox)

## O que aprendi neste projeto

- Fluxo OAuth com Google (redirect, callback, sessao).
- Protecao de rotas no Express (download so para usuarios autenticados).
- Uso de variaveis de ambiente para nao expor segredos no repositorio.

## Como rodar

```bash
git clone https://github.com/Kauaioliveira/seboleitordigital.com.br.git
cd seboleitordigital.com.br
npm install
npm start
```
