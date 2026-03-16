# Sebo Leitor Digital

Sebo digital com catálogo de livros e quadrinhos, login com Google e download de PDFs apenas para usuários logados. Projeto de estudo e portfólio (HTML, CSS, JavaScript, Node.js).

## Screenshot

_(Adicione aqui uma imagem do site, ex.: tela do catálogo ou da página de login.)_

## Tecnologias

- **Backend:** Node.js, Express
- **Autenticação:** Passport.js (Google OAuth 2.0)
- **Front-end:** HTML, CSS, JavaScript (vanilla)
- **Sessão:** express-session

## Funcionalidades

- Login com Google (OAuth)
- Catálogo com descrições (clique na capa para ver detalhes)
- Download de PDFs somente para usuários logados
- Dark mode
- Layout responsivo (flexbox)

## Como rodar

```bash
git clone https://github.com/Kauaioliveira/seboleitordigital.com.br.git
cd seboleitordigital.com.br
npm install

## O que aprendi neste projeto
Fluxo OAuth com Google (redirect, callback, sessão).
Proteção de rotas no Express (download só para usuários autenticados).
Uso de variáveis de ambiente para não expor segredos no repositório
