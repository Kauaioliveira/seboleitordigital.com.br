# Sebo Leitor Digital

Sebo digital de estudo/portfólio: catálogo em **português** via [Gutendex](https://gutendex.com/) (metadados do **Project Gutenberg**, domínio público), leitor embutido com proxy seguro para HTML/texto do Gutenberg, e um **PDF local** protegido por login Google para demonstrar OAuth e rotas privadas.

## Tecnologias

- **Backend:** Node.js, Express 5
- **Dados:** Gutendex (HTTP + cache curto em produção)
- **Segurança HTTP:** Helmet (CSP ativa só com `NODE_ENV=production`)
- **Limites de taxa:** `express-rate-limit` em `/auth/google`, `/api/livros`, `/api/read-proxy`
- **Autenticação:** Passport.js + Google OAuth 2.0 (opcional para catálogo; necessário para favoritos na sessão e download do PDF de exemplo)
- **Sessão:** `express-session` (memória por defeito; **Redis** opcional com `REDIS_URL`)
- **Logs:** `pino` + `pino-http` (JSON; nível `LOG_LEVEL` ou `info` em produção)
- **Monitorização:** Sentry opcional (`SENTRY_DSN`)
- **Front-end:** HTML, CSS, JavaScript (vanilla)

## Modelo de acesso

| Recurso | Autenticação |
|--------|----------------|
| Home, busca Gutendex, `/read.html`, proxy de leitura (`/api/read-proxy`) | Público |
| Favoritos (`/api/favorites`) | Google (sessão) |
| Download do PDF em `livros/` (`/api/download/:id`) | Google |

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `SESSION_SECRET` | Sim | Segredo da sessão |
| `GOOGLE_CLIENT_ID` | Para login Google | OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Para login Google | OAuth Client Secret |
| `PORT` | Não | Porta (padrão 3000) |
| `GOOGLE_CALLBACK_URL` | Não | URL de callback (padrão `http://localhost:PORT/auth/google/callback`) |
| `NODE_ENV` | Não | `production` ativa CSP Helmet + cookie `secure`; `test` ativa `GET /__test/login` |
| `REDIS_URL` | Não | Se definido (e não for `test`), sessões em Redis (`connect-redis`) |
| `SENTRY_DSN` | Não | Erros e traces no Sentry (desativado em `test`) |
| `SENTRY_ENVIRONMENT` | Não | Etiqueta de ambiente no Sentry |
| `SENTRY_TRACES_SAMPLE_RATE` | Não | Amostragem de performance (0–1, padrão `0.05`) |
| `LOG_LEVEL` | Não | Nível pino: `trace` … `silent` |

## Como rodar

```bash
git clone https://github.com/Kauaioliveira/seboleitordigital.com.br.git
cd seboleitordigital.com.br
npm install
cp .env.example .env
# Edite .env: defina SESSION_SECRET (obrigatório) e as chaves Google se for usar login.
npm start
```

Abra `http://localhost:3000` — o catálogo carrega da API local `/api/livros`, que consulta o Gutendex com `languages=pt`.

## Testes

```bash
npm test
```

Usa `node:test`, `supertest` e `nock` para simular o Gutendex sem rede. Com `NODE_ENV=test`, existe `GET /__test/login` para simular usuário logado (sem Helmet, Sentry, Redis nem rate limit agressivo).

## Notas legais e de produto

- O Gutendex não substitui uma “sinopse editorial”; use **subjects** e metadados como resumo curto.
- PDFs comerciais **não** devem ser distribuídos sem licença; o acervo Gutendex é domínio público nos termos do Project Gutenberg.
- O proxy `/api/read-proxy` só aceita hosts **gutenberg.org** (mitigação de SSRF), **HTTPS**, URLs sem credenciais embutidas e tamanho limitado.

## Segurança e Git

- **`.env` está no `.gitignore`** e **não** deve ser commitado. Confirme com `git ls-files .env` (deve dar erro “did not match”).
- **`.env.example`** só com placeholders — nunca coloque segredos reais aí.
- **Sessão:** cookie `httpOnly`, `sameSite: lax`, `secure` com `NODE_ENV=production` (use HTTPS atrás de proxy em produção; `trust proxy` está ativo).
- **`/__test/login`:** existe apenas com `NODE_ENV=test`.
- **`livros/`:** no Git mantém-se apenas o PDF de exemplo **`codigolimpo.pdf`**. Outros `*.pdf` em `livros/` ficam ignorados pelo `.gitignore` (não versionar obras sem direitos). Ver [`livros/README.md`](livros/README.md).

## O que aprendi / destaque para recrutadores

- Integração com API externa (proxy + cache), leitor embutido e fallback de formatos.
- OAuth e rotas híbridas (público + `401` JSON em APIs vs redirect em HTML).
- Endurecimento: Helmet, rate limiting, sessão Redis opcional, logs estruturados, Sentry opcional.
- Testes de contrato com mocks HTTP (`nock`).
