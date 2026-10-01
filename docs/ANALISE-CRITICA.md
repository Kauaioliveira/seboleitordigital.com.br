# Análise crítica do Sebo Leitor Digital

Revisão feita em 30/09/2026 sobre o estado do `main` (commit `8fb1f5f`). Lista o que estava
fraco, o que foi corrigido neste PR e o que fica para depois.

## O que já era bom

- Backend enxuto e bem cuidado para um projeto de portfólio: Helmet, rate limit por rota,
  sessão com cookie `httpOnly`, Redis e Sentry opcionais, logs estruturados.
- O proxy de leitura já limitava o host ao `gutenberg.org` e recusava URL com credenciais.
- 22 testes de contrato com `nock`, sem depender de rede.
- O histórico do Git foi limpo de PDFs sem direito de distribuição.

## Problemas encontrados

### Segurança

1. **O texto do livro rodava scripts na nossa origem.** O iframe usava
   `sandbox="allow-same-origin allow-scripts"`, combinação que anula o sandbox. Qualquer
   `<script>` no HTML do Gutenberg teria acesso à página, à sessão e às APIs do site.
2. **O filtro de host podia ser contornado por redirect.** O `fetch` seguia redirects
   automaticamente, então só o primeiro salto era validado.
3. **Sem limite de tamanho**, apesar de o README prometer um. Um arquivo enorme era lido
   inteiro na memória.
4. **O proxy repassava qualquer tipo de conteúdo** (ex.: SVG) servido pela nossa origem.
5. A URL era decodificada duas vezes (`decodeURIComponent` depois do Express já decodificar),
   o que quebraria endereços com `%` escapado.

### Usabilidade

6. **Imagens dos livros não carregavam** no leitor: caminhos relativos do Gutenberg eram
   resolvidos contra `/api/read-proxy`.
7. **Links do sumário (`#capitulo`) quebravam** dentro do leitor.
8. A busca e a página não iam para a URL: voltar do leitor perdia tudo, e não dava para
   compartilhar um resultado.
9. A paginação mostrava "Página 2 · 150 obras" sem o total de páginas e não rolava para o
   topo da lista.
10. Favoritar recarregava o catálogo inteiro (nova chamada ao Gutendex, a grade piscava).
11. A estrela de favorito sumia para quem não estava logado, então ninguém descobria o recurso.
12. Erros apareciam em `alert()`.
13. O leitor não tinha ajuste de letra nem de cor e não lembrava onde a pessoa parou.
14. O tema escuro não respeitava a preferência do sistema, piscava claro ao carregar e não
    valia no leitor nem no login.
15. Nenhuma página 404; rotas erradas devolviam o texto padrão do Express.

### Aparência e texto

16. O topo falava com recrutadores ("Portfolio · Node + Express", "Gutendex", "sessão"), não
    com quem quer ler.
17. Autores apareciam no formato do catálogo ("Assis, Machado de").
18. O card do PDF atribuía o arquivo a "Robert C. Martin". O PDF é gerado para o projeto, e
    citar um livro comercial num repositório público convida a dúvida sobre direitos.
19. Sem favicon; botões em inglês ("Dark mode"); capas com tamanhos desiguais.

### Repositório

20. `package.json` dizia licença ISC, mas o `LICENSE` é MIT; a descrição estava desatualizada.
21. Nenhum CI rodando os testes.

## O que este PR muda

| # | Mudança |
|---|---------|
| 1, 4 | Iframe sem `allow-scripts`; o proxy devolve CSP `script-src 'none'` e só aceita HTML e texto (415 para o resto). |
| 2 | Redirects seguidos manualmente (até 4), validando o host a cada salto. |
| 3 | Limite de 12 MB, checado no `Content-Length` e durante a leitura (413). |
| 5 | Sem a decodificação dupla. |
| 6 | `<base href>` com a URL final do Gutenberg injetado no HTML. |
| 7 | Links internos rolam dentro do leitor; externos abrem em nova aba. |
| 8, 9 | Busca e página em `?q=&page=`, com voltar/avançar do navegador; "Página X de Y"; rolagem até a lista. |
| 10, 11, 12 | Favoritos atualizam no lugar; estrela visível para todos, com aviso para entrar; avisos em toast. |
| 13 | Leitor com A−/A+, página clara/sépia/escura, barra de progresso e posição salva. Seção "Continuar lendo" na home. |
| 14 | Tema aplicado no `<head>` em todas as páginas, seguindo o sistema até a pessoa escolher. |
| 15 | Página 404 e JSON 404 em `/api`. |
| 16–19 | Novo topo com busca em destaque e sugestões de autores, nomes na ordem natural, capas uniformes, esqueleto de carregamento, favicon, textos em pt-BR. |
| 20, 21 | Licença MIT no `package.json` e workflow de testes no GitHub Actions. |

Contraste das cores principais verificado (AA): texto do botão 5,1:1 no claro e 7,5:1 no escuro.

## Fica para depois

- **Onde o site está publicado.** O arquivo `CNAME` sugere GitHub Pages, mas o site precisa de
  Node (Express) para funcionar; no Pages só os arquivos estáticos subiriam e as rotas `/api`
  falhariam. Vale confirmar o domínio e publicar em um host com Node (Render, Railway, Fly.io).
- **Favoritos somem** quando a sessão expira (24 h) ou o servidor reinicia sem Redis. Um banco
  pequeno (SQLite ou o próprio Redis) resolveria.
- **Catálogo pequeno:** o Gutendex tem poucas obras com `languages=pt`. Dá para oferecer um
  filtro de idioma (pt, en, es) ou coleções curadas por escola literária.
- **Busca sem acento:** o Gutendex compara o texto como veio; buscar "Queiros" pode não achar
  "Queirós".
- **Testes de interface** (Playwright) para o leitor e os favoritos.
