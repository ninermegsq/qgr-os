# Q GRÃOS — Site institucional

Site estático (HTML + CSS + JavaScript puro) da **Q GRÃOS – Corretora de Grãos** (Mato Grosso, BR).
Não usa framework, não usa CDN e não precisa de build: o site funciona **offline**, direto do disco.

O **portal de notícias** (matéria hospedada no site, filtro por dia e por categoria e espaços
patrocinados) está descrito em [O portal de notícias](#o-portal-de-notícias).

## Como abrir

**Opção 1 — servidor local (recomendado, com Node.js instalado):**

```bash
npm start
```

Abre em <http://127.0.0.1:8080>. Para trocar a porta: `PORT=3000 npm start` (Windows: `set PORT=3000 && npm start`).

**Opção 2 — sem Node.js:** abra `index.html` com duplo clique (o site também funciona via `file://`).

## Onde você mexe (o resto já está pronto)

**`site.config.js` é o único lugar com telefone, e-mail, CNPJ e redes sociais.**
Altere o valor lá e o site inteiro se atualiza — o `script.js` aplica os valores nos
elementos marcados com `data-config` no HTML.

```js
window.QG_SITE = {
    whatsapp: '5566992281757',      // só dígitos: '55' + DDD + número
    siteUrl: 'https://qgraos.com.br/',
    phoneDisplay: '(66) 99228-1757', // como aparece para o cliente
    phoneE164: '+5566992281757',    // formato internacional (link tel:)
    email: 'contato@qgraos.com.br',
    cnpj: '62.793.851/0001-96',
    address: 'Mato Grosso, Brasil',
    socials: {
        instagram: 'https://www.instagram.com/q_graos/'
    },
    supabase: {
        url: 'https://rppoiwrbxqdbtavhgdjk.supabase.co',
        anonKey: 'sb_publishable_Rr1vHc5Kr_qQjti4HuaPxA_8pTdjztH'   // chave pública (ver seção Supabase)
    }
};
```

O HTML **mantém os valores literais** como reserva: se o `site.config.js` não carregar,
o site continua funcionando do jeito que está. O `npm run verify` falha se o HTML e o
config divergirem, então você nunca fica com o telefone velho em um canto do site.

## Verificação

```bash
npm run check
```

Roda `node --check` no JavaScript e o verificador `tools/verify.js`, que confere:

- existência de todos os arquivos referenciados (imagens, CSS, JS);
- âncoras internas (`#home`, `#contactForm`, …) apontando para `id` existente;
- ícones do sprite SVG sem referência quebrada;
- balanceamento de tags do HTML e de chaves do CSS;
- ausência de scripts/CSS de CDN;
- **coerência entre `site.config.js` e o HTML** (WhatsApp, `tel:`, `mailto:`, CNPJ, Instagram);
- **presença de SEO**: canonical, Open Graph, Twitter Card e JSON-LD;
- campos do formulário com `name`/`autocomplete`, os **selects de qualificação** (perfil e
  o que o cliente busca), a **caixa de consentimento (LGPD)** e o **campo isca anti-spam**;
- **integração com o Supabase**: página de notícias `noticias.html` (com grade `#newsGrid` e
  botão "carregar mais"), **ausência do botão de WhatsApp na navegação** (`.nav-whatsapp` não
  pode voltar), cliente `supabase-api.js`, painel `/admin` com `noindex` e migration com RLS +
  RPC `SECURITY DEFINER`;
- **portal de notícias**: a matéria hospedada em `noticia.html` (coluna `conteudo` no banco,
  container `#noticiaCorpo`, estado de erro `#noticiaErro`, JSON-LD `NewsArticle`), os anúncios
  com selo de "Publicidade", `rel="sponsored nofollow noopener"` e a política `publicidade.html`,
  e o filtro de categoria com multi-seleção (`?categoria=Soja,Milho`);
- **listagem por dia**: o bloco de data da página de notícias (`#newsData`, `#newsDataInput`,
  `#newsDataStatus`) e o filtro por intervalo no banco (`publicado_em=gte…&publicado_em=lt…`),
  com a data no endereço (`?data=AAAA-MM-DD`);
- **bloco de contato da matéria**: o bloco compacto `#leadMateria` ("O que você busca hoje?")
  com o botão dourado para a ficha de contato (`index.html#contact`);
- **métricas da matéria**: a coluna `visualizacoes` com a RPC `registrar_visualizacao_noticia`,
  e a coerência entre a classe do card da manchete e o contador de clique;
- **privacidade dos anúncios**: o site só pede as colunas públicas do anúncio — cotas, métricas
  e o contato de autorização têm de ficar restritos ao painel (o `verify` falha se o
  `script.js` pedir dado privado ou se as migrations deixarem de revogar o acesso do `anon`);
- **imagens**: nenhuma tag `<img>` sem `src` (o navegador mostraria um quadro quebrado);
- **nenhuma chave secreta** (`service_role` / `sb_secret_`) em nenhum arquivo do projeto;
- `robots.txt` e `sitemap.xml` consistentes com a URL do site.

Teste do servidor local (sobe o servidor e busca tudo por HTTP):

```bash
npm run test:server
```

Teste da configuração (executa o `applySiteConfig` do `script.js` contra um DOM simulado
e confere se cada `data-config` do HTML recebe o valor certo):

```bash
npm run test:config
```

Teste da classificação de produto e estado (confere a regra que traduz o nome publicado
pela fonte na chave do produto e na sigla do estado):

```bash
npm run test:classificacao
```

Teste de integração com o Supabase (roda contra o projeto real, com a chave pública):

```bash
npm run test:supabase
```

Ele confere, de ponta a ponta: o feed público responde; a chave anônima **não** consegue
inserir lead nem ver nenhuma linha de `leads`/`visitas`; as funções `registrar_lead`,
`registrar_evento`, `clicar_noticia` e `registrar_visualizacao_noticia` gravam; o antispam
recusa envio repetido e o e-mail inválido é barrado; os anúncios publicados são lidos pelo
público e a chave anônima **não** consegue inserir um anúncio; a chave anônima **não** consegue
ler as cotas do anúncio nem a view de desempenho (são dados do painel), mas o painel lê as duas
coisas; o filtro com várias categorias (`or=(categoria.eq.Soja,categoria.eq.Milho)`) funciona;
o **filtro por dia** devolve só as notícias do dia escolhido (e esconde o que é de antes ou de
depois dele); o login do administrador funciona; e o painel publica uma notícia e um anúncio, que aparecem no
feed público, e depois os apaga.

Para ele entrar no painel, informe a credencial por variável de ambiente
(`QG_ADMIN_EMAIL` e `QG_ADMIN_PASSWORD`) ou crie o arquivo `.qg-admin.json`
(ele está no `.gitignore` e **não** deve ir para o Git):

```json
{ "email": "contato@qgraos.com.br", "password": "sua-senha" }
```

Sem credencial o teste roda tudo menos a parte do painel e avisa no final.

### Verificação visual no navegador (Chrome headless)

Existe um navegador de verdade rodando dentro do projeto: o `tools/visual-check.js` sobe o
`server.js`, abre o site no **Chrome instalado na máquina** (sem baixar nenhum navegador),
percorre as telas e confere o que só aparece no navegador.

```bash
npm install     # instala o puppeteer-core (só isso; não baixa navegador)
npm run visual
```

O que ele verifica, em `/`, `/noticias.html`, `/noticia.html?id=…`, `/noticias.html?categoria=…`,
`/noticias.html?data=…` (um dia com notícia e um dia sem notícia), `/publicidade.html`,
`/404.html` e `/admin/`, nos tamanhos **1440×900**, **390×844** e **360×740**:

- erros de console, exceções da página, requisições falhas e respostas HTTP ≥ 400;
- rolagem horizontal (conteúdo mais largo que a tela) e elementos fora da viewport;
- ícones do sprite SVG realmente desenhados (`getBBox` em cada `<use>`) e `<use>` quebrados;
- imagens carregadas e com `alt`;
- animações de revelação concluídas (elemento visível, opacidade 1);
- **contraste WCAG AA** do texto (mínimo 4.5:1, ou 3:1 para texto grande), considerando
  gradientes, cores semi-transparentes e opacidade herdada;
- conteúdo do hero cortado em telas baixas;
- foco visível ao navegar pelo teclado (Tab);
- menu hambúrguer abrindo e fechando no mobile;
- **tilt 3D** ativando com mouse e *não* ativando em toque;
- envio do formulário gerando o link correto do WhatsApp (com o consentimento marcado);
- a home **sem** grade de notícias (só o convite) e a página `/noticias.html` com a grade
  carregada e o botão "carregar mais"; a **ausência do botão de WhatsApp** na navegação;
- **a listagem por dia**: a página de notícias abre no dia de hoje (campo de data preenchido,
  botão "Hoje" marcado, linha de status com o número de notícias do dia, `aria-live` na linha
  de status); um dia escolhido pela URL aparece no endereço, com `noindex` e o `canonical` da
  página principal; e um dia sem notícia avisa que não há nada naquele dia, oferece a volta
  para o dia de hoje e não mostra nenhum card;
- **a matéria hospedada**: `/noticia.html?id=…` mostra o texto completo, o JSON-LD
  `NewsArticle`, o crédito da fonte e o bloco "Mais notícias"; a página com filtro mostra os
  chips marcados, a categoria na URL e o `canonical` da combinação;
- **o card da manchete**: todo card renderizado (na listagem e no "Mais notícias") tem a classe
  `news-card-link` e o `data-noticia-id` — é o que o contador de clique do site reconhece — e
  aponta para a matéria interna (`noticia.html?id=…`), nunca para fora do site;
- **os anúncios**: selo de "Publicidade" visível em todo bloco, aviso de corretora e link com
  `sponsored nofollow noopener`, o formato pedido pelo anunciante (faixa ou card) e a regra de
  não repetir o mesmo anúncio duas vezes na mesma tela;
- **o painel `/admin`**: tela de login, `noindex`, login de verdade com a credencial local,
  e as cinco abas (Resumo, Notícias, Anúncios, Leads, Visitas) carregando os dados sem erro.

O teste do painel apaga no final o lead e as visitas que ele mesmo criou, para não
sujar o painel de quem usa o site. A limpeza das visitas roda em várias passadas
(esperando os eventos que ainda estavam a caminho) e apaga também as visitas cujo
`referrer` aponta para o servidor local (`127.0.0.1`) — o que o navegador de teste
deixa para trás. Visita de visitante real, com `referrer` externo, nunca é apagada.

Saídas:

- `tools/visual-report.json` — relatório completo em JSON (o `npm run visual` **sai com código 1**
  se encontrar algum problema, o que faz ele poder entrar no CI);
- `tools/shots/*.png` — capturas de tela de cada tela/tamanho.

Se o Chrome estiver em outro lugar, aponte o executável:

```bash
CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" npm run visual
```

Rode tudo de uma vez (estático + servidor + navegador):

```bash
npm run check:all
```

Gerar o `sitemap.xml` com a data do dia (rode antes de publicar):

```bash
npm run sitemap
```

## Estrutura

| Arquivo | Função |
| --- | --- |
| `index.html` | Página principal (sobre, serviços, produtos, contato) + sprite de ícones SVG inline + SEO (OG/JSON-LD) |
| `noticias.html` | **Página exclusiva das notícias** do agronegócio (grade, **filtro por dia (lista abre no dia de hoje)**, filtro por categoria, "carregar mais" e SEO próprio) |
| `cotacoes.html` | **Página exclusiva das cotações** do agro (grade de preços, filtros por mercado, por produto e por estado, "carregar mais", fontes citadas, CTA de WhatsApp e SEO próprio) |
| `cotacoes.js` | Lê a tabela `cotacoes` do Supabase e desenha os cards (preço, variação, unidade, região, fonte e hora da coleta) só com `textContent`, monta os filtros por mercado, por produto e por estado, a paginação e o SEO |
| `classificacao-cotacoes.js` | **Regra única de classificação** (produto e estado): traduz o nome que a fonte publicou ("Soja · Janeiro 2027", "Farelo de soja (Chicago)") para a chave do filtro (`soja`, `farelo_soja`) e para a sigla do estado (MT, SP, PR…). É a mesma regra que o coletor grava no banco |
| `noticia.html` | **Página da matéria**: o texto completo da notícia, hospedado no site (o visitante nunca é levado para fora), com SEO próprio (canonical, Open Graph, JSON-LD `NewsArticle`), crédito da fonte, **bloco compacto "O que você busca hoje?" com botão para a ficha de contato**, espaço patrocinado no fim e "Mais notícias" |
| `noticia.js` | Carrega a matéria do banco e escreve na tela com `textContent` (nunca `innerHTML`), monta o SEO, conta a visualização, carrega o anúncio do fim e monta o link do botão de lead (escolha + contexto da matéria) |
| `publicidade.html` | Política de transparência dos anúncios: o que é anúncio, o que a Q GRÃOS não endossa, autorização do anunciante, links `sponsored`, contadores e LGPD |
| `404.html` | Página de erro com a identidade do site e links para as seções |
| `style.css` | Estilos completos (tema verde/dourado, responsivo) |
| `script.js` | Menu mobile, rolagem suave, animação ao rolar, partículas, tilt 3D, envio ao WhatsApp, aplicação do `site.config.js`, **notícias + leads + analytics**, preenchimento automático da ficha a partir da matéria e URL de origem do lead |
| `site.config.js` | **Fonte única dos dados**: telefone, e-mail, CNPJ, endereço, redes e chave do Supabase |
| `supabase-api.js` | Cliente REST do Supabase (PostgREST + Auth) em `fetch` puro — sem SDK, sem CDN |
| `admin/index.html` | Painel administrativo (login + abas Resumo/Notícias/Cotações/Anúncios/Leads/Visitas) |
| `admin/admin.css` | Estilos do painel |
| `admin/admin.js` | Lógica do painel (login, CRUD de notícias, de cotações e de anúncios, status de lead, CSV, gráficos) |
| `supabase/migrations/20260101000000_qg_init.sql` | Schema do banco: tabelas, RLS, RPC públicas e vistas do painel |
| `supabase/migrations/20261112103000_qg_cotacoes_produto_uf.sql` | Colunas `produto_chave` e `uf` da tabela `cotacoes` (filtros de produto e de estado), com índice e o preenchimento das cotações publicadas |
| `supabase/migrations/20261113120000_qg_dia_cota_anuncios_fuso_site.sql` | A cota diária de impressões, a RPC `anuncios_elegiveis`, a `registrar_impressao_anuncio` e a view `vw_anuncios_desempenho` passam a contar o dia de Mato Grosso (o dia do site) e não o dia UTC do Postgres |
| `supabase/migrations/20261113140000_qg_revoca_vistas_painel_anon.sql` | Revoga das seis vistas do painel o privilégio padrão `SELECT ... TO PUBLIC` (é o que entregava os números do painel à chave pública) e o papel `anon` |
| `supabase/migrations/20261113150000_qg_vistas_dia_site.sql` | Faz `vw_leads_por_dia` e `vw_visitas_por_dia` agruparem pelo dia de Mato Grosso (o site), e não pelo dia UTC do Postgres |
| `supabase/functions/noticias/index.ts` | Edge Function `noticias` (feed público com cache) |
| `supabase/config.toml` | Configuração do projeto Supabase (inclui `verify_jwt = false` da função) |
| `server.js` | Servidor estático local, sem dependências (entrega `404.html` em URL errada) |
| `robots.txt` / `sitemap.xml` | Indexação pelos buscadores (`/admin` bloqueado) |
| `netlify.toml` / `_headers` | Publicação no Netlify (cache e cabeçalhos de segurança) |
| `.htaccess` | Equivalente para Apache/Hostinger/cPanel (cache, HTTPS, página 404) |
| `.gitignore` | Ignora `node_modules/`, `.DS_Store`, `.env` e a credencial local `.qg-admin.json` |
| `.qg-admin.json` | Credencial local do administrador usada pelos testes (não versionar) |
| `tools/verify.js` | Verificador automático do projeto |
| `tools/build-sitemap.js` | Gera o `sitemap.xml` com a data do build |
| `tools/test-config.js` | Testa a aplicação do `site.config.js` no HTML |
| `tools/test-classificacao.js` | Testa a regra de classificação de produto e estado (`classificacao-cotacoes.js`): 61 casos com o nome que a fonte publica |
| `tools/test-server.js` | Teste HTTP de ponta a ponta |
| `tools/test-supabase.js` | Teste de integração com o Supabase (RLS, RPC, login e painel) |
| `tools/visual-check.js` | Verificação visual real no Chrome headless (layout, contraste, interações) |
| `tools/coletar-cotacoes.js` | Coletor de cotações (IMEA + Grão Direto + Investing.com): monta os cards, grava no Supabase ou imprime o SQL pronto |
| `tools/cotacoes-investing.py` | Cliente Python (curl_cffi) da API da Investing.com, usado pelo coletor para os pregões de Chicago, B3, dólar e macro |
| `tools/investing-fontes.json` | Lista dos instrumentos da Investing.com coletados (soja, milho, farelo, café, algodão, Ibovespa, dólar, ouro, Brent e WTI) |
| `assets/` | Imagens do site |

## As páginas do site

| Página | Endereço | O que tem |
| --- | --- | --- |
| Home | `/` (`index.html`) | Hero, sobre, serviços, produtos, **convite para as notícias** e contato |
| Notícias | `/noticias.html` | **A lista de notícias do agronegócio** (página própria, com SEO próprio), **filtro por dia (abre no dia de hoje)**, filtro de categoria e espaços patrocinados |
| Cotações | `/cotacoes.html` | **A lista de cotações do agro** (página própria, com SEO próprio): preço físico (MT), regional, Chicago, B3, dólar e macro, com filtros por **mercado**, **produto** (soja, milho, algodão…) e **estado** (MT, SP, PR…), "carregar mais" e a origem de cada número |
| Matéria | `/noticia.html?id=…` | **A notícia inteira, hospedada no site**: texto completo, crédito da fonte, compartilhamento, **bloco "O que você busca hoje?" + botão para a ficha**, anúncio no fim e "Mais notícias" |
| Publicidade | `/publicidade.html` | Política de transparência dos anúncios (como anunciar, o que a Q GRÃOS não endossa, LGPD) |
| Erro 404 | `/404.html` | Página de erro com links para as seções e para as notícias |
| Painel | `/admin/` | Área administrativa (bloqueada para buscadores) |

Regras que valem para todas as páginas:

- **A grade de notícias fica só em `noticias.html`.** Na home existe apenas um bloco de
  convite (“Ver todas as notícias”) apontando para lá — a lista não aparece mais misturada
  com as informações da Q GRÃOS.
- **Não existe botão de WhatsApp no cabeçalho.** O `npm run verify` **falha** se o
  `.nav-whatsapp` reaparecer no HTML ou no `style.css`, para ele não voltar sem querer.
  Os links de WhatsApp do hero e do contato continuam existindo.
- A navegação é a mesma nas duas páginas (a página atual recebe `aria-current="page"`).

As notícias carregam do Supabase com paginação real (`limit`/`offset` na API REST):
a página mostra 9 por vez e o botão **“Carregar mais notícias”** aparece só quando ainda
há resultado — ao terminar, ele some sozinho.

A listagem **abre no dia de hoje** (no fuso de Mato Grosso): para ver outro dia, o leitor
usa o campo de data, os atalhos “Hoje”/“Ontem” ou as setas — e a escolha fica na URL
(`?data=AAAA-MM-DD`), sem ficar guardada no navegador.

## O portal de notícias

**1. A matéria fica hospedada aqui.** O card da listagem abre `noticia.html?id=…` e o texto
completo vem do banco (coluna `noticias.conteudo`). O visitante **não** é levado para a
página de origem: a fonte vira um crédito em texto no fim da matéria. No painel, o campo
“Texto completo” é opcional — sem ele, a página avisa que o texto está sendo publicado.
Para formatar: parágrafo separado por linha em branco, `## ` para subtítulo e `- ` para lista.

**2. Filtro por categoria (várias de uma vez).** Os chips da página de notícias marcam Soja,
Milho, Safra… e podem ser marcados **vários ao mesmo tempo** (`?categoria=Soja,Milho`). A
escolha fica no endereço (para linkar e compartilhar), o canonical aponta para a combinação
escolhida e uma combinação sem resultado recebe `noindex`.

**3. Filtro por dia (a listagem abre no dia de hoje).** A página de notícias mostra **só o que
saiu hoje**, no fuso de **Mato Grosso (UTC-4, sem horário de verão)** — o dia do calendário do
estado, não o do relógio de quem está lendo. Para ver outro dia, o leitor troca a data:

- o **campo de data** (calendário nativo, abre o seletor do celular);
- os atalhos **“Hoje”** e **“Ontem”**;
- as setas **‹ ›**, que **pulam os dias sem notícia** (se o dia anterior estiver vazio, a seta
  vai para o dia anterior que tem notícia; quando não existe nenhum, ela desliga).

A escolha vira um **intervalo de tempo na consulta** (`publicado_em` da meia-noite do dia até a
meia-noite do dia seguinte, no fuso de Mato Grosso) e fica no endereço: `?data=AAAA-MM-DD`. O
filtro de categoria continua valendo junto (`?categoria=Soja&data=2026-11-10`), e **os números
dos chips passam a contar só o dia que está na tela**.

- **Não é guardado no navegador**: quem entra de novo vê o dia de hoje.
- **Dia sem notícia**: a página avisa (“Ainda não publicamos notícia hoje (DD/MM/AAAA)” ou
  “Não publicamos notícias em DD/MM/AAAA.”) e oferece o caminho de volta — **“Ver as de
  ontem”** (quando ontem tem notícia) ou **“Voltar para as de hoje”**.
- **SEO**: só o dia de hoje é indexado. Um dia diferente mantém o `canonical` da página
  principal e recebe `noindex, follow` (o conteúdo é o mesmo, muda só a data).
- **“Carregar mais”** carrega mais notícias **do mesmo dia**.

**4. Anúncios com regra (rodízio de verdade).** A aba “Anúncios” do painel publica espaços
patrocinados em duas formas (faixa e card) e em duas posições (lista de notícias e fim da
matéria). Todo anúncio precisa de **autorização do anunciante** (campo “Autorizado por”, Lei
9.279/1996, art. 37) e aparece com selo de “Publicidade”, aviso de que a Q GRÃOS é corretora
e recebe comissão, e link com `rel="sponsored nofollow noopener"`. A política completa está em
`/publicidade.html`. Nenhum pixel ou script de terceiros: só os contadores internos
(impressões, cliques e CTR). O anúncio **nunca** entra no cabeçalho do site.

Como os espaços são distribuídos:

- **Fila de rodízio** — o banco devolve só os anúncios *elegíveis* (publicados, dentro do prazo
  e sem cota esgotada) e o site os reveza. Antes, o anúncio de maior “prioridade” levava 100%
  das exibições e os outros, 0%.
- **Peso no rodízio** — define a participação: peso 3 = três vezes mais espaço que peso 1.
  Anúncios com o mesmo peso dividem o espaço por igual.
- **Prioridade** — só a ordem dentro do ciclo (desempate do peso). O de maior prioridade aparece
  primeiro no ciclo de cada visitante, mas **não** trava o espaço: todos os elegíveis são
  exibidos.
- **Distribuição por visitante** — cada visitante começa a rodada do ciclo num ponto diferente
  (semente determinística de visitante + dia), então o primeiro anúncio da página já é
  distribuído entre os anunciantes.
- **Cursor de sessão** — ao navegar, o próximo espaço mostra o próximo da fila, sem repetir o
  mesmo anunciante duas vezes seguidas.
- **Cotas** — cota total e cota por dia (contagem real, mostrada no painel). Esgotou, o anúncio
  sai da fila sozinho.
- **Quem vê o quê** — o site (chave anônima) lê **só o conteúdo** do anúncio (título, empresa,
  texto, link, imagem, posição, formato, prazo e peso). **Cotas, impressões, cliques e o contato
  de autorização ficam restritos ao painel**: a chave pública do site não consegue lê-los (o
  banco devolve 401) e quem entra no Supabase sem ser administrador também não enxerga nada.

**5. Métricas.** Cada matéria conta **visualizações** (aberturas da página) e **cliques**
(cliques na manchete). As duas ficam na tabela do painel, e o clique na manchete também
aparece como evento nas visitas.

**6. Contato a partir da matéria (bloco compacto).** No fim da página da matéria existe apenas
um bloco pequeno, **"O que você busca hoje?"**, com um seletor (Grãos, CTE + MDF-e, Agenciamento
de cargas, Seguro de cargas) e um **botão dourado de WhatsApp**. Não há telefone, e-mail nem
bloco de contato repetido na matéria: quem quiser falar com a Q GRÃOS clica no botão.

O botão leva à **ficha de contato da home** (`index.html#contact`) já com o que foi escolhido:

| Parâmetro | Para que serve |
| --- | --- |
| `busca` | opção marcada no seletor (vai para o campo "O que busca" da ficha) |
| `origem=noticia` | avisa que a visita veio da matéria |
| `materia` | id da notícia (monta a URL de origem do lead) |
| `titulo` | título da matéria (vira o texto inicial da mensagem: "Sobre a matéria: …") |

Na ficha, o formulário já aparece preenchido com a escolha e com a mensagem pronta, o bloco de
contato abre rolando até ele (abaixo da navbar fixa) e, ao enviar, o lead é gravado no painel
com a **URL da matéria como origem** — tanto no `origem_url` do lead quanto no "Link de Origem"
da mensagem do WhatsApp. O bloco também conta como seção vista no analytics (`leadMateria`).

## Supabase: banco, notícias, leads e painel

O site continua **estático** (sem backend no servidor de hospedagem). O Supabase entra como
banco de dados + autenticação, e a comunicação acontece direto do navegador pela API REST.

```
site público  ──►  PostgREST  ──►  tabelas (RLS)          leads / visitas / notícias
      │
      └──────────►  RPC SECURITY DEFINER  ──►  gravação validada + com limite
painel /admin  ──►  Auth (GoTrue)  ──►  tabela administradores  ──►  RLS libera o painel
```

### 1. Publicar o schema no banco

O arquivo `supabase/migrations/20260101000000_qg_init.sql` cria tudo:

| Objeto | Para que serve |
| --- | --- |
| `administradores` | Quem pode entrar no painel (ligado ao `user_id` do Auth) |
| `noticias` | Notícias do agronegócio (`publicado`, `destaque`, `cliques`, `visualizacoes` e `conteudo`, o texto completo da matéria) |
| `cotacoes` | Uma linha por cotação do agro (fonte, mercado, símbolo, produto, região, preço, variação, unidade, referência e `publicado`) — o anônimo lê só as publicadas |
| `cotacoes_fontes` | Saúde de cada fonte de cotação (status, itens, coletado em) — só o painel enxerga |
| `anuncios` | Espaços patrocinados (empresa, texto, posição, formato, `autorizacao`, `prioridade`, `peso`, `limite_impressoes`, `limite_impressoes_dia`, `impressoes`, `cliques`) — escrita só pelo painel |
| `anuncio_impressoes_diarias` | Impressões do anúncio por dia (base da cota diária) |
| `leads` | Contatos do formulário, com `status` e `consentimento` |
| `visitas` | Pageviews e interações (WhatsApp, seção vista, lead enviado…) |
| `e_admin()` | Responde “este usuário é admin?” (base das políticas) |
| `registrar_lead()` | Grava o lead com validação e antispam (5 min) |
| `registrar_evento()` | Grava um evento de analytics (limite de 60/min por sessão) |
| `clicar_noticia()` | Soma 1 no contador de cliques da notícia |
| `registrar_visualizacao_noticia()` | Soma 1 nas visualizações da notícia (só em notícia publicada) |
| `registrar_impressao_anuncio()` / `clicar_anuncio()` | Contam a exposição (total e do dia) e o clique do anúncio (CTR no painel) |
| `anuncios_elegiveis()` | Devolve só o que pode aparecer agora: publicado, no prazo e com cota disponível (base do rodízio) |
| `vw_*` | Vistas do painel (resumo, leads por dia, visitas por dia/tipo, `vw_anuncios_desempenho` com as impressões de hoje e a cota restante) |

Aplique no **SQL Editor** do Supabase Dashboard (ou via `supabase db push`) colando o
conteúdo do arquivo. O script é idempotente: pode rodar de novo sem erro.

> Neste projeto as migrations **já estão aplicadas** no banco `rppoiwrbxqdbtavhgdjk`,
> com exceção das três mais recentes (13/11/2026). O histórico completo (com o que cada
> uma faz) está em `supabase/migrations/README.md`.
>
> ⚠️ **Três migrations ainda não aplicadas no banco** (13/11/2026):
> `20261113120000` (cota diária no dia do site), `20261113140000` (revoga das vistas do
> painel o acesso da chave pública) e `20261113150000` (gráfico do painel agrupado pelo dia
> de Mato Grosso). Elas estão prontas e versionadas, mas o CLI do Supabase não está
> autenticado nesta máquina e a senha do banco não está disponível aqui. Aplique-as no
> **SQL Editor** do Dashboard (ou com `supabase db push`) antes de publicar: até lá, a
> chave pública continua lendo `vw_painel_resumo`, o gráfico do painel agrupa pelo dia UTC
> e a cota diária de anúncios reinicia às 20h (horário de Brasília) em vez de à meia-noite.

### 2. A chave pública (já preenchida)

`site.config.js` → `supabase.anonKey` já está com a chave pública deste projeto
(`sb_publishable_…`). Para pegar outra:
**Supabase Dashboard → Project Settings → API Keys → Publishable key**.

Essa chave **é pública por definição** e vai no navegador de propósito — não é senha.
O que protege os dados são as **políticas de RLS**. A chave `service_role` / `sb_secret_`
**nunca** entra no site nem no `supabase-api.js` (o `npm run verify` falha se aparecer).

Enquanto o `anonKey` estiver vazio o site funciona igual: a página de notícias mostra
“entram no ar em breve” e nada é enviado ao banco.

### 3. O usuário administrador (já criado)

O painel já tem um administrador pronto:

- e-mail: `contato@qgraos.com.br`
- senha: **não fica no repositório** (o repositório é público). Guarde a sua no
  gerenciador de senhas e anote também no `.qg-admin.json` local (ignorado pelo Git),
  para os testes continuarem entrando no painel.

> **Troque a senha no primeiro acesso**
> (Supabase Dashboard → Authentication → Users → `contato@qgraos.com.br` → ⋮ → *Reset password*)
> e atualize o `.qg-admin.json` local com a nova senha, para os testes continuarem
> entrando no painel.

O que liga o usuário ao painel é a linha dele na tabela `administradores`:

```sql
SELECT user_id, email, nome, ativo FROM public.administradores;
```

Para cadastrar **outro** administrador:

1. No Supabase Dashboard → **Authentication → Users → Add user** (e-mail e senha).
2. Pegue o `id` do usuário e cadastre-o na tabela:

```sql
INSERT INTO public.administradores (user_id, email, nome)
VALUES ('<UUID-do-usuario>', 'seu@email.com', 'Seu nome');
```

Com isso o login em `/admin` passa. Sem essa linha o painel recusa o acesso com
“Este usuário não está cadastrado como administrador da Q GRÃOS”.

### 4. Publicar a Edge Function (opcional)

O código está em `supabase/functions/noticias/index.ts`, mas **a função não foi publicada**
no projeto — e o site não depende dela: ele lê as notícias direto pela tabela com RLS, e
**nenhuma página do site chama essa função** (o portal de notícias usa só `/rest/v1/`). Para
publicar mesmo assim:

```bash
supabase functions deploy noticias
```

A função serve o feed público com cache (`/functions/v1/noticias?limite=6&categoria=Soja`).
É útil se você quiser servir o feed por CDN ou de outra página.

### 5. O que fica gravado (LGPD)

- O formulário grava nome, e-mail, telefone, perfil, o que busca, a mensagem, a URL de origem,
  o `referrer` e asUTM — **só** se a pessoa marcar a caixa de consentimento. Quando o lead vem
  da página de uma matéria, a URL de origem gravada é a da **matéria** (não a da home).
- **Não** gravamos IP, cookies de terceiros nem geolocalização. Guardamos apenas dois
  identificadores aleatórios (`visitante_id` e `sessao_id`) no `localStorage`/`sessionStorage`
  do próprio navegador, para contar visitantes únicos.
- Campo isca (`#website`) bloqueia robôs de preenchimento automático.
- O painel permite **exportar os leads em CSV** e **apagar qualquer lead** a qualquer momento.
- **Os dados de desempenho dos anúncios são do painel**: o site público lê só o conteúdo do
  anúncio; cotas, impressões, cliques e o contato de autorização ficam restritos a quem entra
  como administrador (RLS + permissão por coluna no banco).
- `/admin` tem `noindex`, `Disallow` no `robots.txt` e `Cache-Control: no-store`.

### 6. Usar o painel

`/admin` (por exemplo `https://qgraos.com.br/admin/`) tem cinco abas:

- **Resumo** — total de leads, leads novos, visitas, visitantes únicos e gráficos de 14 dias;
- **Notícias** — publicar, editar, destacar e excluir (o que está *publicado* aparece no site),
  com o texto completo da matéria, o resumo (até 320 caracteres) e as métricas de leitura;
- **Anúncios** — publicar espaços patrocinados (faixa ou card), definir posição e prazo,
  registrar a autorização do anunciante e acompanhar impressões, cliques e CTR. Também define
  o **peso no rodízio** (participação no revezamento), a **prioridade** (ordem no ciclo) e as
  **cotas** (total e por dia). A tabela mostra as impressões de hoje, a cota restante e o
  status real de cada anúncio (no ar, fora do prazo, cota esgotada ou rascunho);
- **Leads** — filtrar, mudar o status (novo / em andamento / convertido / descartado), abrir
  o WhatsApp do cliente, exportar CSV e excluir;
- **Visitas** — eventos por tipo e as últimas interações.

## A área de cotações

A página `/cotacoes.html` é a pendant News: mostra **o preço do agro** (soja, milho, algodão,
sorgo), os pregões de Chicago e da B3, o dólar e os indicadores macro, com a **origem de cada
número** escrita no card.

**Fontes (coleta no servidor, nunca no navegador):**

| Fonte | O que traz | Como é coletada |
| --- | --- | --- |
| **IMEA** (`api1.imea.com.br`) | Preço físico de soja, milho e algodão por praça (Mato Grosso e regiões) | API `/cadeias/{id}/cotacoes` + `/cadeias/{id}/indicadores` (é o que separa preço de semente, frete e óleo) |
| **Grão Direto** (`graodireto.com.br`) | Preço regional (CEPEA/ESALQ), futuros de Chicago e da B3, dólar | HTML `__NEXT_DATA__` (Next.js) das páginas `/quotations/soy`, `/corn` e `/sorghum` |
| **Investing.com** | Soja, milho, farelo, café, algodão (Chicago), Ibovespa, dólar, ouro, Brent e WTI | `tools/cotacoes-investing.py` (Python + `curl_cffi`, com impersonation de Chrome) — a API Investment bloqueia CORS e anti-bot no navegador |

**Tabelas no Supabase** (`supabase/migrations/20261112090000_qg_cotacoes.sql`):

| Objeto | Para que serve |
| --- | --- |
| `cotacoes` | Uma linha por cotação (`fonte`, `mercado`, `simbolo`, `produto`, `produto_chave`, `regiao`, `uf`, `preco`, `preco_max`, `preco_min`, `variacao`, `variacao_abs`, `unidade`, `referencia`, `publicado`). Chave única `(fonte, simbolo)`. `produto_chave` e `uf` são as colunas dos filtros de produto e de estado |
| `cotacoes_fontes` | Saúde de cada fonte (`status`, `itens`, `coletado_em`) — alimenta o painel e o aviso da página |

O visitante lê **só** as linhas com `publicado = true` (política RLS). A tabela de fontes é
**restrita ao painel**: o anônimo não consegue nem ler.

**Filtro de produto e de estado:** as colunas `produto_chave` (soja, milho, algodao, sorgo,
farelo_soja, cafe, dolar, ibovespa, ouro, petroleo) e `uf` (MT, SP, PR…) foram criadas em
`supabase/migrations/20261112103000_qg_cotacoes_produto_uf.sql` e já estão preenchidas nas 143
cotações publicadas (119 com estado — Chicago, BM&F, B3 e o dólar/macro não têm estado de
propósito). A regra de classificação mora em `classificacao-cotacoes.js` e é a mesma que o
coletor grava a cada coleta.

**Como rodar a coleta:**

```bash
npm run cotacoes:coletar            # coleta e grava no Supabase (pede login de admin)
npm run cotacoes:simular            # dry-run: mostra o que seria gravado, sem gravar
node tools/coletar-cotacoes.js --dry-run --sql   # imprime o SQL pronto (formato jsonb_to_recordset)
```

- Com credenciais: `QG_ADMIN_EMAIL` e `QG_ADMIN_PASSWORD` (ou o arquivo local `.qg-admin.json`,
  que está no `.gitignore`). Sem elas, o coletor imprime o SQL para colar no SQL Editor.
- A Investing.com exige `python` com `curl_cffi` instalado (`pip install curl_cffi`); sem ele,
  as outras duas fontes continuam funcionando.
- O SQL impresso usa `jsonb_to_recordset` + `ON CONFLICT` — é o formato aceito pelo SQL Editor
  do Supabase e pelas ferramentas de migração (um `VALUES` com muitas linhas não é interpretado).

### Coleta automática (GitHub Actions)

A coleta não depende de ninguém: ela roda sozinha no repositório, pela workflow
`.github/workflows/cotacoes.yml` (nome: **Atualizar cotações**).

| Quando | De quanto em quanto |
| --- | --- |
| Segunda a sexta, das 8h às 17h45 (horário de Mato Grosso) | 15 minutos |
| Fora desse período, de segunda a sexta | 2 horas |
| Sábado e domingo, das 8h às 16h | 2 horas |
| Sábado e domingo, à noite | 2 horas |

O cron do GitHub roda em UTC: a workflow usa `*/15 12-21 * * 1-5` para o expediente
(08h–17h45 de Mato Grosso) e `0 0,2,4,6,8,10,22 * * *` mais `0 12,14,16,18,20 * * 0,6`
para o resto. Os horários de 2 em 2 horas não invadem o expediente, para não disparar duas
coletas ao mesmo tempo.

> **Atenção ao dia da semana no cron.** O GitHub aceita de **0 a 6** (0 = domingo) e
> **recusa o valor 7**. Um cron inválido não aparece como erro no botão *Run*: o GitHub
> simplesmente **rejeita o arquivo inteiro da workflow**, a execução morre em 0 segundo e a
> workflow passa a aparecer pelo **caminho** do arquivo, sem o nome. Por isso o fim de semana
> é `0,6` e nunca `6,7`. O `tools/verify.js` valida o cron de todas as workflows antes do
> push, para o erro ser pego no terminal em vez de no GitHub.

**Por que 15 minutos e não 5:** preço físico de grão não muda a cada 5 minutos. O IMEA publica
1 a 2 vezes por dia e o Investing.com só anda junto com o mercado. O ciclo de 15 minutos dentro
do expediente é o que pega o preço novo logo depois da divulgação, sem gastar runner à toa.

**Três formas de disparar:**

1. **Sozinho**, pelo `schedule` da workflow (é o padrão);
2. **Na mão**, pelo botão **Run workflow** na aba *Actions* do GitHub (útil para conferir se
   está funcionando);
3. **Pelo painel do site** (`/admin/` → aba **Cotações** → **Atualizar cotações agora**), que
   pede ao servidor que rode a mesma coleta na hora.

**Segredos do repositório** (*Settings → Secrets and variables → Actions*):

| Segredo | Para que serve | Situação |
| --- | --- | --- |
| `QG_SUPABASE_SERVICE_ROLE` | chave service role do Supabase: é o que o coletor usa para gravar. **É ela que deve ser usada** — assim, trocar a senha do painel não quebra a coleta | ⏸ ainda falta cadastrar |
| `QG_ADMIN_EMAIL` | reserva: se a service role não existir, o coletor entra no painel com este e-mail | ✅ cadastrado |
| `QG_ADMIN_PASSWORD` | reserva: a senha do administrador, para o caso acima | ✅ cadastrado |

> **Como funciona o caminho de reserva.** Sem a service role, o coletor faz login no
> Supabase com e-mail e senha e grava com o token de sessão. Esse caminho depende de duas
> coisas: a chave pública estar no `site.config.js` (é de lá que o coletor tira a
> `anonKey`) e o e-mail/senha estarem nos secrets. **Com os dois no lugar a coleta
> funciona** — foi assim que a primeira execução bem-sucedida aconteceu.
>
> A service role continua sendo o caminho recomendado: não depende de senha e não
> quebra se o dono trocar a senha do painel.

Nenhum desses segredos vai para o Git. O `tools/verify.js` confere que nenhum deles aparece
no código versionado.

**O botão do painel sem segredo no navegador:** o token do GitHub **não** fica no
`admin/admin.js` (que é público). Quem guarda o token é a Edge Function
`supabase/functions/cotacoes-trigger`, no servidor do Supabase. O painel só manda um POST
autenticado; a função confere se quem chamou é administrador e só então dispara a workflow
(`repository_dispatch`). As secrets da função:

| Secret | Para que serve |
| --- | --- |
| `QG_GITHUB_TOKEN` | token do GitHub com escopo `repo` (ou fine-grained, só neste repositório) |
| `QG_GITHUB_OWNER` | dono do repositório (`ninermegsq`) |
| `QG_GITHUB_REPO` | nome do repositório (`qgr-os`) |
| `QG_GITHUB_WORKFLOW` | arquivo da workflow (`cotacoes.yml`) |

**A trava de lote parcial:** se a fonte responder com menos da metade do que já está publicado
(a fonte caiu no meio, veio paginada, o HTML mudou), **nenhuma cotação sai do ar** — as antigas
continuam publicadas com o horário delas. O mesmo vale quando só *algumas* respostas da fonte
falham: o coletor publica o que veio e mantém o resto. É o que impede que uma falha de rede
apague o preço do dia. O corte é configurável em `QG_LOTE_PARCIAL` (padrão `0.5`).

**O que o leitor vê:** a página `/cotacoes.html` pergunta o banco de novo a cada 5 minutos
(enquanto a aba está à vista) e redesenha a grade só quando algum número mudou de verdade.

**Limitações conhecidas (para não ter surpresa):**

* O cron do GitHub é *best effort*: a execução costuma atrasar de 10 a 20 minutos quando há
  muita fila na plataforma. Não é um servidor com horário garantido.
* Repositório público sem atividade por 60 dias tem o workflow agendado desativado pelo
  GitHub. Push novo ou uso do botão reativam.
* O IP dos runners do GitHub pode ser bloqueado pelo IMEA, pelo Grão Direto ou pelo
  Investing.com. A trava de lote parcial mantém o preço antigo no ar nesse caso — o painel
  mostra a fonte como *erro* e a página continua com o último valor bom.
* A Edge Function `cotacoes-trigger` **ainda não foi publicada** — `GET/OPTIONS
  /functions/v1/cotacoes-trigger` responde `404`. Sem ela, o botão do painel não funciona; a
  coleta automática (schedule) continua normal. Publicar com
  `supabase functions deploy cotacoes-trigger` (ver item 9 em *Ajustes que ainda dependem
  de você*).

**No painel** (`/admin/`), a aba **Cotações** mostra a tabela toda (fonte, mercado, produto,
preço, variação, data), o estado de cada fonte e deixa **publicar**, **despublicar** e **excluir**
linha por linha. O botão **Atualizar cotações agora** dispara a coleta (veja
*Coleta automática* abaixo).

**Na página:** três filtros que se combinam — **mercado**, **produto** e **estado** — com a
escolha no endereço (`?mercado=regional&produto=soja&uf=MT`), "carregar mais" (24 por vez) e,
quando o filtro não tem resultado, `noindex` — o mesmo cuidado do portal de notícias. O número
de cada chip conta só as cotações que passam pelos **outros** filtros, então a contagem muda a
cada escolha.

## Dependências externas

O site **não depende de nenhum CDN** para funcionar. A única requisição externa é a fonte do Google
(Outfit/Rajdhani), carregada de forma **não bloqueante**: se a rede falhar, o site usa a fonte do
sistema e continua idêntico em estrutura e conteúdo. Os ícones são SVG inline, sem requisição.

O **único pacote npm** do projeto é o `puppeteer-core`, usado só pela verificação visual.
Ele é `devDependency` e não é necessário para publicar o site — o site publicado não tem
JavaScript de terceiros, nem requisição extra.

## Repositório no GitHub

O projeto está versionado em **https://github.com/ninermegsq/qgr-os** (branch `main`).
O repositório é **público**: ele guarda o *código*, nunca senhas.

### Enviar uma alteração

```bash
git status                 # o que mudou
git add -A
git commit -m "descreva a mudança"
git push origin main
```

Pelo npm (sem digitar `git`): `npm run git -- status`, `npm run git -- push origin main`.
E para o GitHub CLI: `npm run gh -- repo view`, `npm run gh -- run list`.

### O que **não** vai para o repositório

O `.gitignore` segura o que é temporário ou secreto:

| Item | Por quê |
| --- | --- |
| `node_modules/` | dependências (reinstale com `npm ci`) |
| `.qg-admin.json` | **credenciais do painel** (e-mail e senha do administrador) |
| `.env`, `.env.*` | variáveis de ambiente com segredos |
| `tools/shots/`, `tools/visual-report.json` | capturas da verificação visual |
| `.netlify/`, `.vercel/`, `.cache/` | temporários de publicação |

> **Regra de ouro:** a senha do painel **nunca** entra no Git. Para criar ou trocar o
> administrador, use `SET app.admin_senha = '...'` na migration
> (`supabase/migrations/20261111160027_qg_admin_padrao.sql`) ou a tela de
> *Authentication → Users* do Supabase.

### Verificação automática

O workflow `.github/workflows/ci.yml` roda `npm run check` em cada push na `main` e em cada
pull request (badge "Verificacao" no topo do repositório).

Antes de enviar, rode localmente:

```bash
npm run check:all        # estático + servidor + visual (Chrome headless)
npm run test:supabase    # integração real com o Supabase
```

## Publicação

Site estático: basta subir o conteúdo da pasta para qualquer hospedagem
(Netlify, Vercel, GitHub Pages, Hostinger, cPanel). Não há processo de build.

- **Netlify/Vercel:** arraste a pasta ou aponte o repositório — o `netlify.toml` e o `_headers`
  já cuidam de cache e cabeçalhos de segurança.
- **Hostinger/cPanel/Apache:** envie os arquivos para `public_html` — o `.htaccess` já configura
  cache, HTTPS e a página de erro 404.
- **GitHub Pages:** não precisa de nada além de subir os arquivos na branch.

Depois de publicar:

1. confira se o domínio usado no `site.config.js` (`siteUrl`) é o mesmo do publicado — ele aparece
   na mensagem do WhatsApp e no `canonical`/`og:url`;
2. rode `npm run sitemap` antes de cada publicação para atualizar o `lastmod`;
3. envie o `sitemap.xml` no Google Search Console.

## Ajustes que ainda dependem de você (dados de negócio)

1. **Confirmar o WhatsApp** — `site.config.js`: `whatsapp` (`55` + DDD + número) e
   `phoneE164`/`phoneDisplay` com o mesmo número.
2. **Confirmar o e-mail** — `site.config.js`: `email`.
3. **Endereço completo** — hoje o rodapé mostra apenas "Mato Grosso, Brasil". Se quiser a rua,
   a cidade e o CEP (melhora o SEO local), troque `address` e ajuste o JSON-LD em `index.html`.
4. **Instagram** — hoje é o único link de rede social (Facebook e LinkedIn foram removidos,
   junto com os ícones do sprite). Se quiser adicionar outra rede, use o mesmo padrão:
   link em `.social-links` no `index.html` + entrada em `socials` no `site.config.js`.
5. **Trocar a senha do administrador** — o usuário `contato@qgraos.com.br` já existe,
   mas a senha **não é versionada** (o repositório é público). Defina a sua pelo painel do
   Supabase (Authentication → Users → *Reset password*) e atualize o `.qg-admin.json`
   local (ignorado pelo Git) com a nova senha.
6. **Publicar a primeira notícia** — o painel já abre e publica. É só preencher título,
   resumo e categoria; o que estiver marcado como “Publicar no site” aparece na página
   **`/noticias.html`** na hora (a home mostra apenas o convite para abrir essa página).
   Para a **matéria inteira hospedada no site**, cole o texto no campo “Texto completo”.
7. **Definir a imagem da notícia** — o campo “URL da imagem” vira a capa da matéria e do card.
   Sem imagem, o site mostra o ícone de muda em vez de um espaço quebrado.
8. **Publicar a Edge Function** — `supabase functions deploy noticias` (opcional: o site
   funciona sem ela).
9. **Publicar a Edge Function da coleta** — `supabase functions deploy cotacoes-trigger` e
   cadastrar as secrets `QG_GITHUB_TOKEN`, `QG_GITHUB_OWNER`, `QG_GITHUB_REPO` e
   `QG_GITHUB_WORKFLOW` (*Edge Functions → Secrets*). É o que faz o botão
   **Atualizar cotações agora** do painel funcionar. Sem ela, a coleta automática
   (GitHub Actions) continua funcionando normalmente.
   > A função confere o token **dentro dela** (Bearer → `/auth/v1/user` → tabela
   > `administradores`), e não no gateway. É por isso que o `supabase/config.toml` usa
   > `verify_jwt = false`: com `true`, o gateway exigiria o JWT também no preflight
   > `OPTIONS` do CORS, que nunca leva o `Authorization`, o navegador abortaria antes do
   > `POST` e o painel mostraria apenas “Failed to fetch”, sem status nenhum.
10. **Cadastrar o segredo da coleta no GitHub** — *Settings → Secrets and variables → Actions*:
   `QG_SUPABASE_SERVICE_ROLE` (a chave service role do Supabase, em
   *Project Settings → API Keys*). É o único segredo obrigatório para a coleta automática
   rodar; `QG_ADMIN_EMAIL` e `QG_ADMIN_PASSWORD` são só a reserva.
   > **Já funciona pela reserva.** `QG_ADMIN_EMAIL` e `QG_ADMIN_PASSWORD` já estão
   > cadastrados e a coleta automática grava no banco por esse caminho. A service role é
   > o recomendado (trocar a senha do painel não quebra a coleta), mas não é o que
   > impede a coleta de rodar hoje.
11. **Primeiro anúncio (opcional)** — a aba “Anúncios” publica espaços patrocinados. Antes,
   combine com o patrocinador a posição (lista de notícias ou fim da matéria), o prazo de
   veiculação, o **peso no rodízio** (a participação dele no revezamento) e a autorização por
   escrito (Lei 9.279/1996, art. 37): o painel exige o campo “Autorizado por” para o anúncio
   ir ao ar.
