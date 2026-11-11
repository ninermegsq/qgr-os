# Q GRÃOS — Site institucional

Site estático (HTML + CSS + JavaScript puro) da **Q GRÃOS – Corretora de Grãos** (Mato Grosso, BR).
Não usa framework, não usa CDN e não precisa de build: o site funciona **offline**, direto do disco.

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
- **integração com o Supabase**: seção `#noticias`, botão de WhatsApp na navegação, cliente
  `supabase-api.js`, painel `/admin` com `noindex` e migration com RLS + RPC `SECURITY DEFINER`;
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

Teste de integração com o Supabase (roda contra o projeto real, com a chave pública):

```bash
npm run test:supabase
```

Ele confere, de ponta a ponta: o feed público responde; a chave anônima **não** consegue
inserir lead nem ver nenhuma linha de `leads`/`visitas`; as funções `registrar_lead`,
`registrar_evento` e `clicar_noticia` gravam; o antispam recusa envio repetido e o e-mail
inválido é barrado; o login do administrador funciona; e o painel publica uma notícia,
que aparece no feed público, e depois a apaga.

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

O que ele verifica, em `/`, `/404.html` e `/admin/`, nos tamanhos **1440×900**, **390×844** e **360×740**:

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
- existência da seção de notícias e do botão de WhatsApp na barra de navegação;
- **o painel `/admin`**: tela de login, `noindex`, login de verdade com a credencial local,
  e as quatro abas (Resumo, Notícias, Leads, Visitas) carregando os dados sem erro.

O teste do painel apaga no final o lead e as visitas que ele mesmo criou, para não
sujar o painel de quem usa o site.

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
| `index.html` | Página única + sprite de ícones SVG inline + SEO (OG/JSON-LD) |
| `404.html` | Página de erro com a identidade do site e links para as seções |
| `style.css` | Estilos completos (tema verde/dourado, responsivo) |
| `script.js` | Menu mobile, rolagem suave, animação ao rolar, partículas, tilt 3D, envio ao WhatsApp, aplicação do `site.config.js`, **notícias + leads + analytics** |
| `site.config.js` | **Fonte única dos dados**: telefone, e-mail, CNPJ, endereço, redes e chave do Supabase |
| `supabase-api.js` | Cliente REST do Supabase (PostgREST + Auth) em `fetch` puro — sem SDK, sem CDN |
| `admin/index.html` | Painel administrativo (login + abas Resumo/Notícias/Leads/Visitas) |
| `admin/admin.css` | Estilos do painel |
| `admin/admin.js` | Lógica do painel (login, CRUD de notícias, status de lead, CSV, gráficos) |
| `supabase/migrations/20260101000000_qg_init.sql` | Schema do banco: tabelas, RLS, RPC públicas e vistas do painel |
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
| `tools/test-server.js` | Teste HTTP de ponta a ponta |
| `tools/test-supabase.js` | Teste de integração com o Supabase (RLS, RPC, login e painel) |
| `tools/visual-check.js` | Verificação visual real no Chrome headless (layout, contraste, interações) |
| `assets/` | Imagens do site |

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
| `noticias` | Notícias do agronegócio (`publicado`, `destaque`, `cliques`) |
| `leads` | Contatos do formulário, com `status` e `consentimento` |
| `visitas` | Pageviews e interações (WhatsApp, seção vista, lead enviado…) |
| `e_admin()` | Responde “este usuário é admin?” (base das políticas) |
| `registrar_lead()` | Grava o lead com validação e antispam (5 min) |
| `registrar_evento()` | Grava um evento de analytics (limite de 60/min por sessão) |
| `clicar_noticia()` | Soma 1 no contador de cliques da notícia |
| `vw_*` | Vistas do painel (resumo, leads por dia, visitas por dia/tipo) |

Aplique no **SQL Editor** do Supabase Dashboard (ou via `supabase db push`) colando o
conteúdo do arquivo. O script é idempotente: pode rodar de novo sem erro.

> Neste projeto as migrations **já estão aplicadas** no banco `rppoiwrbxqdbtavhgdjk`.
> O histórico completo (com o que cada uma faz) está em `supabase/migrations/README.md`.

### 2. A chave pública (já preenchida)

`site.config.js` → `supabase.anonKey` já está com a chave pública deste projeto
(`sb_publishable_…`). Para pegar outra:
**Supabase Dashboard → Project Settings → API Keys → Publishable key**.

Essa chave **é pública por definição** e vai no navegador de propósito — não é senha.
O que protege os dados são as **políticas de RLS**. A chave `service_role` / `sb_secret_`
**nunca** entra no site nem no `supabase-api.js` (o `npm run verify` falha se aparecer).

Enquanto o `anonKey` estiver vazio o site funciona igual: a seção de notícias mostra
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

### 4. Publicar a Edge Function (pendente)

O código está em `supabase/functions/noticias/index.ts`, mas **a função ainda não foi
publicada** no projeto — o site não depende dela: ele lê as notícias direto pela tabela
com RLS. Para publicar:

```bash
supabase functions deploy noticias
```

A função serve o feed público com cache (`/functions/v1/noticias?limite=6&categoria=Soja`).
É útil se você quiser servir o feed por CDN ou de outra página.

### 5. O que fica gravado (LGPD)

- O formulário grava nome, e-mail, telefone, perfil, o que busca, a mensagem, a URL de origem,
  o `referrer` e asUTM — **só** se a pessoa marcar a caixa de consentimento.
- **Não** gravamos IP, cookies de terceiros nem geolocalização. Guardamos apenas dois
  identificadores aleatórios (`visitante_id` e `sessao_id`) no `localStorage`/`sessionStorage`
  do próprio navegador, para contar visitantes únicos.
- Campo isca (`#website`) bloqueia robôs de preenchimento automático.
- O painel permite **exportar os leads em CSV** e **apagar qualquer lead** a qualquer momento.
- `/admin` tem `noindex`, `Disallow` no `robots.txt` e `Cache-Control: no-store`.

### 6. Usar o painel

`/admin` (por exemplo `https://qgraos.com.br/admin/`) tem quatro abas:

- **Resumo** — total de leads, leads novos, visitas, visitantes únicos e gráficos de 14 dias;
- **Notícias** — publicar, editar, destacar e excluir (o que está *publicado* aparece no site);
- **Leads** — filtrar, mudar o status (novo / em andamento / convertido / descartado), abrir
  o WhatsApp do cliente, exportar CSV e excluir;
- **Visitas** — eventos por tipo e as últimas interações.

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
   resumo e categoria; o que estiver marcado como “Publicar no site” aparece em `/` na hora.
7. **Publicar a Edge Function** — `supabase functions deploy noticias` (opcional: o site
   funciona sem ela).
