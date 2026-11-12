'use strict';

/* ------------------------------------------------------------------
 * Verificacao automatica do site Q GRAOS (sem dependencias).
 * Roda: npm run verify
 * ------------------------------------------------------------------ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const errors = [];
const warnings = [];
const notes = [];

/* Chaves de configuracao reconhecidas pelo script.js */
const KNOWN_CONFIG_KEYS = [
    'whatsapp',
    'phone',
    'email',
    'cnpj',
    'address',
    'year',
    'instagram'
];

/* Padrão de chave secreta do Supabase (nunca deve aparecer no projeto) */
const SECRET_PATTERN = /(sb_secret_[A-Za-z0-9_-]{10,}|service_role[\s_-]*key\s*[:=]\s*['"][A-Za-z0-9._-]{20,})/i;

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function exists(relativePath) {
    return fs.existsSync(path.join(ROOT, relativePath));
}

/* ---------- 1. Arquivos obrigatorios ---------- */
const REQUIRED_FILES = [
    'index.html',
    'noticias.html',
    'noticia.html',
    'publicidade.html',
    '404.html',
    'style.css',
    'script.js',
    'noticia.js',
    'cotacoes.html',
    'cotacoes.js',
    'site.config.js',
    'supabase-api.js',
    'admin/index.html',
    'admin/admin.css',
    'admin/admin.js',
    'supabase/config.toml',
    'supabase/migrations/20260101000000_qg_init.sql',
    'supabase/functions/noticias/index.ts',
    'supabase/migrations/20261112090000_qg_cotacoes.sql',
    'tools/coletar-cotacoes.js',
    'tools/investing-fontes.json',
    'package.json',
    'server.js',
    'robots.txt',
    'sitemap.xml',
    'netlify.toml',
    '_headers',
    '.htaccess',
    '.gitignore',
    'assets'
];

REQUIRED_FILES.forEach(file => {
    if (!exists(file)) errors.push('Arquivo ausente: ' + file);
});

if (errors.length) {
    report();
    process.exit(1);
}

const html = read('index.html');
const css = read('style.css');
const js = read('script.js');

/* ---------- 2. Le a configuracao central (site.config.js) ---------- */
function readSiteConfig() {
    const code = read('site.config.js');
    const sandbox = {};

    // Executa o arquivo com um `window` falso para obter os valores
    const factory = new Function('window', code + '\nreturn window.QG_SITE || {};');
    return factory(sandbox) || {};
}

const config = readSiteConfig();
const socials = config.socials || {};

['whatsapp', 'siteUrl', 'phoneDisplay', 'phoneE164', 'email', 'cnpj', 'address'].forEach(key => {
    if (!config[key]) errors.push('site.config.js sem o campo "' + key + '"');
});
if (!socials.instagram) errors.push('site.config.js sem socials.instagram');

notes.push('site.config.js lido: ' + Object.keys(config).length + ' campos de configuracao');

/* ---------- 3. Scripts e estilos externos ---------- */
const externalScripts = html.match(/<script[^>]+src="(https?:\/\/[^"]+)"/g) || [];
externalScripts.forEach(tag => {
    errors.push('Script externo (CDN) encontrado - o site nao deve depender de CDN: ' + tag);
});

const externalStyles = html.match(/<link[^>]+rel="stylesheet"[^>]+href="(https?:\/\/[^"]+)"/g) || [];
externalStyles.forEach(tag => {
    // Fontes carregadas com media="print" nao bloqueiam a renderizacao
    if (/media="print"/.test(tag)) {
        warnings.push('Fonte externa carregada de forma nao bloqueante (ok): ' + tag.slice(0, 80));
    } else {
        errors.push('CSS externo bloqueante encontrado: ' + tag);
    }
});

/* ---------- 4. CSS e JS locais carregados ---------- */
if (!/<link[^>]+href="style\.css/.test(html)) {
    errors.push('index.html nao carrega style.css');
}
if (!/<script[^>]+src="script\.js/.test(html)) {
    errors.push('index.html nao carrega script.js');
}
const stylesheetLinks = html.match(/<link[^>]*rel="stylesheet"[^>]*>/g) || [];
if (stylesheetLinks.length && !/href="style\.css/.test(stylesheetLinks[0])) {
    errors.push('style.css nao e o primeiro stylesheet do <head>');
}

const configScriptIndex = html.indexOf('site.config.js');
const scriptIndex = html.indexOf('script.js?v');
if (configScriptIndex === -1) {
    errors.push('index.html nao carrega site.config.js');
} else if (scriptIndex !== -1 && configScriptIndex > scriptIndex) {
    errors.push('site.config.js precisa ser carregado ANTES de script.js');
}
notes.push('CSS local carregado primeiro no <head>');
notes.push('Nenhum script de CDN: apenas arquivos locais');
notes.push('site.config.js carregado antes de script.js');

/* ---------- 5. Referencias locais existem no disco ---------- */
const HTML_FILES = ['index.html', 'noticias.html', 'noticia.html', 'cotacoes.html', 'publicidade.html', '404.html'];
let localReferences = 0;

HTML_FILES.forEach(file => {
    const content = read(file);
    const referencePattern = /(?:src|href)="([^"]+)"/g;
    let match;

    while ((match = referencePattern.exec(content)) !== null) {
        const value = match[1];

        if (!value || value.startsWith('#') || value.startsWith('data:')) continue;
        if (/^(https?:|mailto:|tel:|javascript:)/i.test(value)) continue;

        const clean = value.split('?')[0].split('#')[0].replace(/^\/+/, '');
        if (!clean) continue;

        localReferences++;
        if (!exists(clean)) {
            errors.push('Referencia local quebrada em ' + file + ': ' + value);
        }
    }
});
notes.push(localReferences + ' referencias locais conferidas no disco');

/* ---------- 6. Ancoras internas resolvem para ids existentes ---------- */
let anchors = 0;

HTML_FILES.forEach(file => {
    const content = read(file);
    const ids = new Set();
    const idPattern = /\sid="([^"]+)"/g;
    let match;

    while ((match = idPattern.exec(content)) !== null) ids.add(match[1]);

    const anchorPattern = /href="#([^"]+)"/g;
    while ((match = anchorPattern.exec(content)) !== null) {
        anchors++;
        if (!ids.has(match[1])) {
            errors.push('Ancora sem destino em ' + file + ': href="#' + match[1] + '"');
        }
    }
});
notes.push(anchors + ' ancoras internas verificadas');

/* ---------- 7. Simbolos SVG do sprite ---------- */
const symbolPattern = /<symbol[^>]+id="([^"]+)"/g;
const symbols = new Set();
let match;
let uses = 0;

HTML_FILES.forEach(file => {
    const content = read(file);
    const doSprite = new Set();
    const usePattern = /<use[^>]+href="#([^"]+)"/g;

    let simbolo;
    while ((simbolo = symbolPattern.exec(content)) !== null) {
        doSprite.add(simbolo[1]);
        symbols.add(simbolo[1]);
    }

    let uso;
    while ((uso = usePattern.exec(content)) !== null) {
        uses++;
        if (!doSprite.has(uso[1])) {
            errors.push('Icone SVG inexistente no sprite de ' + file + ': #' + uso[1]);
        }
    }
});
notes.push(symbols.size + ' icones no sprite, ' + uses + ' usos conferidos');

/* ---------- 8. Redes sociais desativadas ---------- */
['ic-facebook', 'ic-linkedin'].forEach(id => {
    if (symbols.has(id)) errors.push('Sprite ainda contem o icone removido: #' + id);
});
if (/facebook\.com/i.test(html)) errors.push('index.html ainda tem link do Facebook');
if (/linkedin\.com/i.test(html)) errors.push('index.html ainda tem link do LinkedIn');

const socialAnchors = html.match(/<a[^>]+class="[^"]*social-links[^"]*"[^>]*>/g) || [];
const socialBlock = html.slice(html.indexOf('social-links'), html.indexOf('social-links') + 800);
const instagramCount = (socialBlock.match(/instagram\.com/g) || []).length;
if (instagramCount !== 1) {
    errors.push('Esperado exatamente 1 link do Instagram em .social-links (encontrado: ' + instagramCount + ')');
}
notes.push('Redes sociais: somente Instagram, com URL real');

/* ---------- 9. Balanceamento de tags do HTML ---------- */
const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

HTML_FILES.forEach(file => {
    const content = read(file);
    const withoutComments = content
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<script[\s\S]*?<\/script>/g, '')
        .replace(/<style[\s\S]*?<\/style>/g, '');

    const stack = [];
    const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g;
    let tagMatch;

    while ((tagMatch = tagPattern.exec(withoutComments)) !== null) {
        const closing = tagMatch[1] === '/';
        const name = tagMatch[2].toLowerCase();
        const selfClosed = tagMatch[4] === '/';

        if (voidElements.has(name) || selfClosed) continue;

        if (!closing) {
            stack.push(name);
        } else {
            const open = stack.pop();
            if (open !== name) {
                errors.push('Tags HTML desbalanceadas em ' + file + ': esperava </' + open + '> e encontrou </' + name + '>');
                break;
            }
        }
    }
    if (stack.length) {
        errors.push('Tags HTML nunca fechadas em ' + file + ': ' + stack.join(', '));
    }
});
notes.push('Balanceamento de tags conferido em ' + HTML_FILES.length + ' paginas');

/* ---------- 10. Balanceamento de chaves do CSS ---------- */
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const openBraces = (cssNoComments.match(/\{/g) || []).length;
const closeBraces = (cssNoComments.match(/\}/g) || []).length;
if (openBraces !== closeBraces) {
    errors.push('CSS desbalanceado: ' + openBraces + ' chaves de abertura e ' + closeBraces + ' de fechamento');
}
notes.push('CSS com ' + openBraces + ' blocos balanceados');

/* ---------- 11. Assets referenciados no CSS ---------- */
const cssUrlPattern = /url\((['"]?)([^'")]+)\1\)/g;
while ((match = cssUrlPattern.exec(cssNoComments)) !== null) {
    const value = match[2];
    if (/^(https?:|data:)/i.test(value)) continue;
    const clean = value.split('?')[0].split('#')[0];
    if (clean && !exists(clean)) {
        errors.push('CSS aponta para arquivo inexistente: ' + value);
    }
}

/* ---------- 12. Scripts externos dentro do JS ---------- */
if (/import\s+.*from\s+['"]https?:/.test(js)) {
    errors.push('script.js importa modulo externo');
}
if (/src\s*=\s*['"]https?:/.test(js)) {
    errors.push('script.js carrega recurso externo');
}
notes.push('script.js sem dependencias externas');

/* ---------- 13. Chaves de configuracao usadas no HTML ---------- */
const configKeys = new Set();
const configPattern = /data-config(?:-text)?="([^"]+)"/g;

HTML_FILES.forEach(file => {
    const content = read(file);
    const padrao = new RegExp(configPattern.source, 'g');
    let achado;

    while ((achado = padrao.exec(content)) !== null) {
        configKeys.add(achado[1]);
        if (!KNOWN_CONFIG_KEYS.includes(achado[1])) {
            errors.push('Chave de configuracao desconhecida em ' + file + ': "' + achado[1] + '"');
        }
    }
});

if (!configKeys.has('whatsapp')) errors.push('HTML sem nenhum link de WhatsApp com data-config');
if (!configKeys.has('year')) errors.push('HTML sem o ano dinamico (data-config="year")');
notes.push(configKeys.size + ' chaves de configuracao aplicadas no HTML');

/* ---------- 14. Coerencia entre o HTML e o site.config.js ---------- */
const waPattern = /https:\/\/wa\.me\/([0-9]+)/g;
let waLinks = 0;
while ((match = waPattern.exec(html)) !== null) {
    waLinks++;
    if (match[1] !== String(config.whatsapp)) {
        errors.push('Link wa.me com numero diferente do site.config.js: ' + match[1]);
    }
}
if (waLinks === 0) errors.push('Nenhum link wa.me encontrado no HTML');

const telPattern = /href="tel:([^"]+)"/g;
let telLinks = 0;
while ((match = telPattern.exec(html)) !== null) {
    telLinks++;
    if (match[1].replace(/\D/g, '') !== String(config.phoneE164).replace(/\D/g, '')) {
        errors.push('Link tel: com numero diferente do site.config.js: ' + match[1]);
    }
}

const mailPattern = /href="mailto:([^"]+)"/g;
let mailLinks = 0;
while ((match = mailPattern.exec(html)) !== null) {
    mailLinks++;
    if (match[1] !== config.email) {
        errors.push('Link mailto: com e-mail diferente do site.config.js: ' + match[1]);
    }
}

// O texto literal precisa existir no HTML: e a reserva caso o JS falhe
[config.phoneDisplay, config.email, config.cnpj, config.address].forEach(value => {
    if (!html.includes(String(value))) {
        errors.push('Texto de reserva ausente no HTML (valor do site.config.js): ' + value);
    }
});

if (socials.instagram && !html.includes(socials.instagram)) {
    errors.push('URL do Instagram do site.config.js ausente no HTML');
}
notes.push(waLinks + ' links wa.me, ' + telLinks + ' links tel: e ' + mailLinks + ' links mailto: conferidos');

/* ---------- 15. SEO: canonical, Open Graph e dados estruturados ---------- */
const seoRequired = [
    { pattern: /<link[^>]+rel="canonical"/, label: 'link canonical' },
    { pattern: /<meta[^>]+property="og:title"/, label: 'og:title' },
    { pattern: /<meta[^>]+property="og:description"/, label: 'og:description' },
    { pattern: /<meta[^>]+property="og:image"/, label: 'og:image' },
    { pattern: /<meta[^>]+property="og:url"/, label: 'og:url' },
    { pattern: /<meta[^>]+property="og:locale"/, label: 'og:locale' },
    { pattern: /<meta[^>]+name="twitter:card"/, label: 'twitter:card' },
    { pattern: /<meta[^>]+name="theme-color"/, label: 'theme-color' },
    { pattern: /<script[^>]+type="application\/ld\+json"/, label: 'JSON-LD' }
];

// As paginas publicas precisam de SEO completo
const PAGINAS_SEO = ['index.html', 'noticias.html', 'noticia.html', 'cotacoes.html', 'publicidade.html'];

PAGINAS_SEO.forEach(file => {
    const content = read(file);

    seoRequired.forEach(item => {
        if (!item.pattern.test(content)) {
            errors.push('SEO em ' + file + ': falta ' + item.label + ' no <head>');
        }
    });

    // O JSON-LD deve citar os dados de contato
    if (content.includes('application/ld+json')) {
        if (!content.includes(String(config.cnpj))) {
            errors.push('SEO em ' + file + ': JSON-LD sem o CNPJ do site.config.js');
        }
        if (!content.includes(String(config.email))) {
            errors.push('SEO em ' + file + ': JSON-LD sem o e-mail do site.config.js');
        }
    }
});

// O canonical de cada pagina tem de apontar para a propria URL
const canonicalPattern = /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/;
const canonicalIndex = canonicalPattern.exec(html);
const canonicalNoticias = canonicalPattern.exec(read('noticias.html'));
const canonicalNoticia = canonicalPattern.exec(read('noticia.html'));
const canonicalCotacoes = canonicalPattern.exec(read('cotacoes.html'));
const canonicalPublicidade = canonicalPattern.exec(read('publicidade.html'));

if (!canonicalIndex || canonicalIndex[1] !== 'https://qgraos.com.br/') {
    errors.push('index.html sem o canonical https://qgraos.com.br/');
}
if (!canonicalNoticias || canonicalNoticias[1] !== 'https://qgraos.com.br/noticias.html') {
    errors.push('noticias.html sem o canonical https://qgraos.com.br/noticias.html');
}
if (!canonicalNoticia || canonicalNoticia[1] !== 'https://qgraos.com.br/noticia.html') {
    errors.push('noticia.html sem o canonical https://qgraos.com.br/noticia.html');
}
if (!canonicalCotacoes || canonicalCotacoes[1] !== 'https://qgraos.com.br/cotacoes.html') {
    errors.push('cotacoes.html sem o canonical https://qgraos.com.br/cotacoes.html');
}
if (!canonicalPublicidade || canonicalPublicidade[1] !== 'https://qgraos.com.br/publicidade.html') {
    errors.push('publicidade.html sem o canonical https://qgraos.com.br/publicidade.html');
}
notes.push('SEO: canonical, Open Graph, Twitter Card e JSON-LD presentes');

/* ---------- 16. Formulario: campos nomeados e nota de privacidade ---------- */
const formMatch = html.match(/<form[\s\S]*?<\/form>/);
if (!formMatch) {
    errors.push('index.html sem o formulario de contato');
} else {
    const form = formMatch[0];
    const fieldPattern = /<(input|textarea|select)\b[^>]*>/g;
    let field;

    while ((field = fieldPattern.exec(form)) !== null) {
        const tag = field[0];
        if (!/\bname="/.test(tag)) {
            errors.push('Campo do formulario sem atributo name: ' + tag.slice(0, 70));
        }
    }
    if (!/autocomplete="/.test(form)) {
        errors.push('Campos do formulario sem autocomplete');
    }
    if (!/form-note/.test(form)) {
        errors.push('Formulario sem a nota de privacidade (form-note)');
    }

    // Qualificacao do lead: perfil e busca tem de existir, ser obrigatorios
    // e oferecer as opcoes combinadas com a Q GRAOS
    const selects = [
        {
            id: 'perfil',
            rotulo: 'perfil',
            opcoes: ['Comprador', 'Corretor', 'Investidor', 'Transportadora']
        },
        {
            id: 'busca',
            rotulo: 'o que o cliente busca',
            opcoes: ['Grãos', 'CTE + MDF-e', 'Agenciamento de cargas', 'Seguro de cargas']
        }
    ];

    selects.forEach(select => {
        const bloco = form.match(new RegExp('<select[^>]*id="' + select.id + '"[\\s\\S]*?</select>'));

        if (!bloco) {
            errors.push('Formulario sem o campo select "' + select.id + '" (' + select.rotulo + ')');
            return;
        }
        if (!/\brequired\b/.test(bloco[0])) {
            errors.push('Select "' + select.id + '" (' + select.rotulo + ') nao e obrigatorio');
        }
        select.opcoes.forEach(opcao => {
            if (bloco[0].indexOf('>' + opcao + '<') === -1) {
                errors.push('Select "' + select.id + '" sem a opcao "' + opcao + '"');
            }
        });
    });
}
notes.push('Formulario com campos nomeados, autocomplete, nota de privacidade e selects de perfil/busca');

/* ---------- 17. robots.txt e sitemap.xml ---------- */
const robots = read('robots.txt');
if (!/Sitemap:\s*https?:\/\/[^\s]+/i.test(robots)) {
    errors.push('robots.txt sem a linha Sitemap:');
}
if (!/User-agent/i.test(robots)) {
    errors.push('robots.txt sem User-agent');
}

const sitemap = read('sitemap.xml');
const siteUrl = String(config.siteUrl || '').replace(/\/*$/, '/');
if (siteUrl && !sitemap.includes(siteUrl)) {
    errors.push('sitemap.xml nao contem a URL do site.config.js: ' + siteUrl);
}
if (!/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemap)) {
    errors.push('sitemap.xml sem lastmod no formato AAAA-MM-DD');
}
if (!/<urlset[^>]+sitemaps\.org\/schemas\/sitemap\/0\.9/.test(sitemap)) {
    errors.push('sitemap.xml sem o namespace padrao do sitemap');
}
notes.push('robots.txt e sitemap.xml conferidos');

/* ---------- 18. 404.html ---------- */
const notFound = read('404.html');
if (!/style\.css/.test(notFound)) errors.push('404.html nao carrega style.css');
if (!/site\.config\.js/.test(notFound)) errors.push('404.html nao carrega site.config.js');
if (!/404/.test(notFound)) errors.push('404.html sem a indicacao visual do erro 404');
notes.push('404.html com identidade visual e links para as secoes');

/* ---------- 19. Supabase, secao de noticias e painel administrativo ---------- */
const supabaseConfig = config.supabase || {};

if (!supabaseConfig.url) {
    errors.push('site.config.js sem o campo "supabase.url"');
}
if (!('anonKey' in supabaseConfig)) {
    errors.push('site.config.js sem o campo "supabase.anonKey"');
}
if (supabaseConfig.url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseConfig.url)) {
    errors.push('supabase.url nao tem o formato de URL do Supabase: ' + supabaseConfig.url);
}
if (supabaseConfig.anonKey && !/^(sb_publishable_|eyJ)/.test(supabaseConfig.anonKey)) {
    errors.push('supabase.anonKey nao parece uma chave publica do Supabase');
}
if (!supabaseConfig.anonKey) {
    warnings.push('supabase.anonKey vazio: noticias, leads e visitas seguem desligados ate voce preencher a chave publica');
}

// O cliente REST e o painel tem de existir e ser carregados
if (!/<script[^>]+src="supabase-api\.js/.test(html)) {
    errors.push('index.html nao carrega supabase-api.js');
}
const apiScriptIndex = html.indexOf('supabase-api.js');
if (apiScriptIndex !== -1 && scriptIndex !== -1 && apiScriptIndex > scriptIndex) {
    errors.push('supabase-api.js precisa ser carregado ANTES de script.js');
}

// As noticias tem pagina propria: a lista fica em noticias.html
const noticiasHtml = read('noticias.html');

if (!/id="noticias"/.test(html)) errors.push('index.html sem a secao #noticias');
if (/id="newsGrid"/.test(html)) {
    errors.push('index.html nao deve mais ter a grade de noticias (ela fica em noticias.html)');
}
if (!/id="newsGrid"/.test(noticiasHtml)) errors.push('noticias.html sem o container #newsGrid');
if (!/id="newsMais"/.test(noticiasHtml)) errors.push('noticias.html sem o botao de carregar mais (#newsMais)');
if (!/href="noticias\.html"/.test(html)) errors.push('index.html sem link para a pagina de noticias');
if (!/href="noticias\.html"/.test(noticiasHtml)) errors.push('noticias.html sem link para a propria pagina de noticias');

// O botao de WhatsApp nao volta para o cabecalho
if (/class="nav-whatsapp"/.test(html)) {
    errors.push('index.html ainda tem o botao de WhatsApp na navegacao (.nav-whatsapp)');
}
if (/class="nav-whatsapp"/.test(noticiasHtml)) {
    errors.push('noticias.html ainda tem o botao de WhatsApp na navegacao (.nav-whatsapp)');
}
if (/\.nav-whatsapp/.test(css)) {
    errors.push('style.css ainda tem regras do botao de WhatsApp da navegacao (.nav-whatsapp)');
}

// Consentimento (LGPD) e campo isca anti-spam
if (!/id="consentimento"/.test(html)) {
    errors.push('index.html sem a caixa de consentimento (#consentimento)');
}
if (!/id="website"/.test(html)) {
    errors.push('index.html sem o campo isca anti-spam (#website)');
}
if (!/hp-field/.test(html)) {
    errors.push('index.html sem o bloco .hp-field (campo isca)');
}

// O site publico nao pode escrever direto nas tabelas: so via RPC
if (!/rpc\(\s*'registrar_lead'/.test(js)) {
    errors.push('script.js nao grava o lead pela RPC registrar_lead');
}
if (!/rpc\(\s*'registrar_evento'/.test(js)) {
    errors.push('script.js nao registra os eventos pela RPC registrar_evento');
}

// Nada de innerHTML com dado de usuario no script do site
/* A palavra "innerHTML" pode aparecer numa explicacao do proprio
 * codigo (comentario) sem que haja risco nenhum: o teste olha so
 * o codigo que realmente roda. */
function semComentarios(codigo) {
    return String(codigo)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[;{}])\/\/[^\n]*/g, '$1');
}

if (/\.innerHTML\s*\+?=/.test(semComentarios(js))) {
    errors.push('script.js usa innerHTML (risco de XSS): use textContent');
}

const noticiaJs = read('noticia.js');
if (/\.innerHTML\s*\+?=/.test(semComentarios(noticiaJs))) {
    errors.push('noticia.js usa innerHTML (risco de XSS): use textContent');
}
if (/insertAdjacentHTML|outerHTML\s*=|document\.write/.test(js + noticiaJs)) {
    errors.push('script.js/noticia.js escreve HTML no DOM: use textContent e createElement');
}

/* ---------- 20. Painel administrativo ---------- */
const adminHtml = read('admin/index.html');
const adminJs = read('admin/admin.js');

if (!/<meta[^>]+name="robots"[^>]+noindex/i.test(adminHtml)) {
    errors.push('admin/index.html sem a meta robots noindex');
}
if (!/<script[^>]+src="\.\.\/supabase-api\.js/.test(adminHtml)) {
    errors.push('admin/index.html nao carrega ../supabase-api.js');
}
if (!/<script[^>]+src="\.\.\/site\.config\.js/.test(adminHtml)) {
    errors.push('admin/index.html nao carrega ../site.config.js');
}
['loginForm', 'newsForm', 'leadTableBody', 'visitasBody', 'cardsResumo'].forEach(id => {
    if (adminHtml.indexOf('id="' + id + '"') === -1) {
        errors.push('admin/index.html sem o elemento #' + id);
    }
});
if (adminJs.indexOf('verificarAdministrador') === -1) {
    errors.push('admin/admin.js sem a checagem de administrador (verificarAdministrador)');
}
if (!/textContent/.test(adminJs)) {
    errors.push('admin/admin.js sem uso de textContent (risco de XSS no painel)');
}

/* ---------- 21. Migration do banco ---------- */
const migration = read('supabase/migrations/20260101000000_qg_init.sql');

['administradores', 'noticias', 'leads', 'visitas'].forEach(tabela => {
    if (migration.indexOf('CREATE TABLE IF NOT EXISTS public.' + tabela) === -1) {
        errors.push('Migration sem a tabela public.' + tabela);
    }
    if (migration.indexOf('ENABLE ROW LEVEL SECURITY') === -1) {
        errors.push('Migration sem ENABLE ROW LEVEL SECURITY');
    }
});

['registrar_lead', 'registrar_evento', 'clicar_noticia', 'noticias_publicas', 'e_admin'].forEach(fn => {
    if (migration.indexOf('FUNCTION public.' + fn) === -1) {
        errors.push('Migration sem a funcao public.' + fn);
    }
});

// As escritas publicas precisam ser SECURITY DEFINER (com validacao e limite)
const rpcCalls = migration.match(/CREATE OR REPLACE FUNCTION public\.registrar_\w+\([\s\S]*?\$\$;/g) || [];
if (!rpcCalls.length) {
    errors.push('Migration sem as RPC publicas de escrita');
}
rpcCalls.forEach(bloco => {
    if (bloco.indexOf('SECURITY DEFINER') === -1) {
        errors.push('RPC publica sem SECURITY DEFINER: ' + bloco.slice(0, 60));
    }
});

// A tabela de leads nao pode ter INSERT liberado para o papel anon
if (/GRANT[^;]*INSERT[^;]*ON public\.leads[^;]*TO anon/i.test(migration)) {
    errors.push('Migration libera INSERT anon em public.leads (use a RPC registrar_lead)');
}

/* ---------- 22. Edge Function "noticias" ---------- */
const edgeFunction = read('supabase/functions/noticias/index.ts');

if (!/functions\.v1\/noticias/.test(edgeFunction) && !/noticias\?limite/.test(edgeFunction)) {
    warnings.push('Edge Function noticias sem exemplo de uso documentado');
}
if (SECRET_PATTERN.test(edgeFunction)) {
    errors.push('Edge Function com chave secreta: a service role nao pode ser usada no codigo da funcao');
}
if (!/SUPABASE_ANON_KEY/.test(edgeFunction)) {
    errors.push('Edge Function sem a leitura da SUPABASE_ANON_KEY');
}

/* ---------- 23. Nenhuma chave secreta no projeto ---------- */

function varrerSegredos(diretorio, profundidade) {
    if (profundidade > 4) return;

    fs.readdirSync(diretorio, { withFileTypes: true }).forEach(entrada => {
        const completo = path.join(diretorio, entrada.name);

        if (entrada.name === 'node_modules' || entrada.name === '.git') return;

        if (entrada.isDirectory()) {
            varrerSegredos(completo, profundidade + 1);
            return;
        }

        if (!/\.(js|ts|html|css|json|sql|toml|md|txt|yml|yaml)$/i.test(entrada.name)) return;

        const conteudo = fs.readFileSync(completo, 'utf8');
        if (SECRET_PATTERN.test(conteudo)) {
            errors.push('Possivel chave secreta em ' + path.relative(ROOT, completo));
        }
    });
}

varrerSegredos(ROOT, 0);
notes.push('Nenhuma chave secreta (service role / sb_secret_) no projeto');

/* ---------- 24. robots.txt bloqueia o painel ---------- */
if (!/Disallow:\s*\/admin\/?/i.test(robots)) {
    errors.push('robots.txt nao bloqueia /admin');
}
notes.push('robots.txt bloqueia o painel administrativo');

/* ---------- 25. Portal de noticias: materia hospedada, anuncios e filtro ---------- */
const noticiaHtml = read('noticia.html');
const publicidadeHtml = read('publicidade.html');
const portalMigration = read('supabase/migrations/20261111192112_qg_portal_noticias_e_anuncios.sql');

/* Pilar 1: a materia completa mora no banco e aparece em noticia.html */
if (!/conteudo\s+text/.test(migration)) {
    errors.push('Migration inicial sem a coluna public.noticias.conteudo (texto completo da materia)');
}
if (!/ADD COLUMN IF NOT EXISTS conteudo text/.test(portalMigration)) {
    errors.push('Migration do portal sem a coluna conteudo em public.noticias');
}
if (!/id="noticiaCorpo"/.test(noticiaHtml)) {
    errors.push('noticia.html sem o container #noticiaCorpo (texto da materia)');
}
if (!/id="noticiaErro"/.test(noticiaHtml)) {
    errors.push('noticia.html sem o estado de erro #noticiaErro (id invalido ou nao publicado)');
}
if (!/"@type":\s*"NewsArticle"/.test(noticiaHtml)) {
    errors.push('noticia.html sem o JSON-LD NewsArticle');
}
if (!/name="conteudo"/.test(adminHtml)) {
    errors.push('admin/index.html sem o campo do texto completo da noticia (name="conteudo")');
}
if (!/conteudo/.test(adminJs)) {
    errors.push('admin/admin.js sem gravar o conteudo da noticia');
}
if (!/newsSummaryCount/.test(adminHtml)) {
    errors.push('admin/index.html sem o contador de caracteres do resumo');
}

/* O card da listagem leva para a materia interna (nunca para fora) */
if (!/noticia\.html\?id=/.test(js)) {
    errors.push('script.js sem o link interno da materia (noticia.html?id=...)');
}
if (!/data-noticia-id/.test(js)) {
    errors.push('script.js sem marcar o card com data-noticia-id (contagem de clique na materia)');
}
if (!/clicar_noticia/.test(js)) {
    errors.push('script.js sem contar o clique na materia (RPC clicar_noticia)');
}

/* Pilar 2: anuncios com selo, link marcado e transparencia */
if (!/CREATE TABLE IF NOT EXISTS public\.anuncios/.test(portalMigration)) {
    errors.push('Migration do portal sem a tabela public.anuncios');
}
if (!/autorizacao text/.test(portalMigration)) {
    errors.push('Tabela public.anuncios sem a coluna autorizacao (prova de autorizacao do anunciante)');
}
if (!/ENABLE ROW LEVEL SECURITY/.test(portalMigration)) {
    errors.push('Tabela public.anuncios sem ENABLE ROW LEVEL SECURITY');
}
if (!/sponsored nofollow noopener/.test(js)) {
    errors.push('script.js sem a marcacao rel="sponsored nofollow noopener" nos links de anunciante');
}
if (!/Publicidade/.test(js)) {
    errors.push('script.js sem o selo de Publicidade nos anuncios');
}
if (!/publicidade\.html/.test(js)) {
    errors.push('script.js sem o link para a politica de publicidade (publicidade.html)');
}
if (!/publicidade\.html/.test(noticiaHtml)) {
    errors.push('noticia.html sem o link para a politica de publicidade');
}
['sponsored nofollow noopener', '9.279/1996', 'pixel', 'não endossa'].forEach(termo => {
    if (publicidadeHtml.indexOf(termo) === -1) {
        errors.push('publicidade.html sem o trecho obrigatorio: "' + termo + '"');
    }
});
if (!/name="autorizacao"/.test(adminHtml)) {
    errors.push('admin/index.html sem o campo "Autorizado por (contato)" (name="autorizacao")');
}

/* Nenhum script de rastreamento de terceiros no site */
if (/doubleclick|google-analytics|googletagmanager|connect\.facebook|hotjar|clarity\.ms/i.test(js + noticiaJs)) {
    errors.push('script.js/noticia.js carrega script de rastreamento de terceiros (use so contadores internos)');
}

/* O anuncio nunca entra no cabecalho do site */
HTML_FILES.forEach(file => {
    const conteudo = read(file);
    const blocos = conteudo.match(/<nav class="navbar"[\s\S]*?<\/nav>/g) || [];

    blocos.forEach(bloco => {
        if (/anuncio|publicidade/i.test(bloco)) {
            errors.push('Anuncio dentro do cabecalho em ' + file + ' (o cabeçalho nao leva anuncio)');
        }
    });
});

/* Pilar 3: filtro por categoria com varios valores */
if (!/id="filtroCategorias"/.test(read('noticias.html'))) {
    errors.push('noticias.html sem o bloco de filtro #filtroCategorias');
}
if (!/id="filtroChips"/.test(read('noticias.html'))) {
    errors.push('noticias.html sem o container #filtroChips');
}
if (!/aria-pressed/.test(js)) {
    errors.push('script.js sem aria-pressed nos chips de categoria');
}
if (!/history\.replaceState/.test(js)) {
    errors.push('script.js sem guardar a selecao de categoria na URL (history.replaceState)');
}
/* O filtro de varias categorias monta a consulta do banco assim:
 * or=(categoria.eq.Soja,categoria.eq.Milho) — o "or=(" vem de um
 * trecho e a lista de categorias vem de outro, entao os dois
 * pedacos sao conferidos separadamente. */
if (!/or=\(/.test(js) || !/categoria\.eq\./.test(js)) {
    errors.push('script.js sem o filtro de varias categorias (or=(categoria.eq....))');
}

/* Pilar 4: a listagem abre no dia de hoje e o leitor troca a data */
const noticiasHtml2 = read('noticias.html');

if (!/id="newsData"/.test(noticiasHtml2)) {
    errors.push('noticias.html sem o bloco de data #newsData');
}
if (!/id="newsDataInput"/.test(noticiasHtml2)) {
    errors.push('noticias.html sem o campo de data #newsDataInput');
}
if (!/id="newsDataStatus"/.test(noticiasHtml2)) {
    errors.push('noticias.html sem a linha de status do dia #newsDataStatus');
}
if (!/type="date"/.test(noticiasHtml2)) {
    errors.push('noticias.html sem o campo de escolha de data (input type="date")');
}

/* O filtro de data vira um intervalo de tempo na consulta: os dois
   limites precisam estar no codigo (publicado_em=gte. e publicado_em=lt.) */
if (!/publicado_em=gte\./.test(js) || !/publicado_em=lt\./.test(js)) {
    errors.push('script.js sem o filtro de data na consulta (publicado_em=gte./lt.)');
}

/* O dia escolhido fica no endereco e a listagem volta para o dia de hoje */
if (!/parametros\.set\('data'/.test(js)) {
    errors.push('script.js sem gravar o dia escolhido na URL (parametros.set("data"))');
}
if (!/dataSelecionada\s*=\s*lerDataDaUrl\(\)/.test(js)) {
    errors.push('script.js sem ler o dia escolhido da URL (dataSelecionada = lerDataDaUrl())');
}

/* O painel tem a aba de anuncios */
if (!/data-tab="anuncios"/.test(adminHtml)) {
    errors.push('admin/index.html sem a aba de Anuncios');
}
if (!/adTableBody/.test(adminHtml)) {
    errors.push('admin/index.html sem a tabela de anuncios (#adTableBody)');
}
if (!/clicar_anuncio/.test(js)) {
    errors.push('script.js sem contar o clique no anuncio (RPC clicar_anuncio)');
}
if (!/registrar_impressao_anuncio/.test(js)) {
    errors.push('script.js sem contar a impressao do anuncio (RPC registrar_impressao_anuncio)');
}

/* Metrica da materia: quantas vezes a noticia foi aberta.
   O contador e interno (sem pixel de terceiro). */
const migrationsSql = fs.readdirSync(path.join(ROOT, 'supabase/migrations'))
    .filter(nome => nome.endsWith('.sql'))
    .map(nome => fs.readFileSync(path.join(ROOT, 'supabase/migrations', nome), 'utf8'))
    .join('\n');

if (!/visualizacoes\s+integer/.test(migrationsSql)) {
    errors.push('Nenhuma migration cria a coluna public.noticias.visualizacoes');
}
if (!/registrar_visualizacao_noticia/.test(migrationsSql)) {
    errors.push('Nenhuma migration cria a RPC registrar_visualizacao_noticia');
}
if (!/registrar_visualizacao_noticia/.test(noticiaJs)) {
    errors.push('noticia.js sem contar a visualizacao da materia (RPC registrar_visualizacao_noticia)');
}
if (!/visualizacoes/.test(adminJs)) {
    errors.push('admin/admin.js sem mostrar as visualizacoes da materia no painel');
}

/* O contador de clique tem de reconhecer a classe que o card usa:
   o card da manchete e o proprio link, entao se as classes nao
   baterem o `clicar_noticia` nunca dispara. */
const classeDoCard = (js.match(/card\.className\s*=\s*'([^']*)'/) || [])[1] || '';
const classesDoCard = classeDoCard.split(/\s+/).filter(Boolean);

if (!classesDoCard.length) {
    errors.push('script.js sem a classe do card da manchete');
} else if (!classesDoCard.some(classe => js.includes("classList.contains('" + classe + "')"))) {
    errors.push('script.js: o contador de clique nao reconhece a classe do card (' +
        classesDoCard.join(' ') + ')');
}

/* Nenhuma imagem sem src: o navegador mostraria um quadro quebrado */
HTML_FILES.forEach(file => {
    const content = read(file);
    const tags = content.match(/<img\b[^>]*>/g) || [];

    tags.forEach(tag => {
        if (!/\ssrc=/.test(tag)) {
            errors.push('Imagem sem src em ' + file + ': ' + tag.slice(0, 90));
        }
    });
});

notes.push('Portal de noticias: materia hospedada, anuncios com selo e filtro por categoria conferidos');
notes.push('Listagem por dia: bloco de data na pagina de noticias e filtro por intervalo no banco conferidos');
notes.push('Metricas da materia conferidas: visualizacoes (RPC) e clique (classe do card)');

/* ---------- 26. Rotacao de anuncios (rodizio real) ---------- */

/* O banco precisa saber quem pode aparecer agora: a funcao
   anuncios_elegiveis e o que garante prazo e cota na pratica. */
if (!/CREATE OR REPLACE FUNCTION public\.anuncios_elegiveis/.test(migrationsSql)) {
    errors.push('Nenhuma migration cria a RPC public.anuncios_elegiveis (elegibilidade do anuncio)');
}
if (!/CREATE TABLE IF NOT EXISTS public\.anuncio_impressoes_diarias/.test(migrationsSql)) {
    errors.push('Nenhuma migration cria a tabela public.anuncio_impressoes_diarias (cota diaria)');
}
if (!/vw_anuncios_desempenho/.test(migrationsSql)) {
    errors.push('Nenhuma migration cria a view public.vw_anuncios_desempenho (painel)');
}
if (!/ADD COLUMN IF NOT EXISTS peso integer/.test(migrationsSql)) {
    errors.push('Nenhuma migration cria a coluna peso em public.anuncios (peso do rodizio)');
}
if (!/ADD COLUMN IF NOT EXISTS limite_impressoes integer/.test(migrationsSql)) {
    errors.push('Nenhuma migration cria a coluna limite_impressoes em public.anuncios (cota total)');
}
if (!/ADD COLUMN IF NOT EXISTS limite_impressoes_dia integer/.test(migrationsSql)) {
    errors.push('Nenhuma migration cria a coluna limite_impressoes_dia em public.anuncios (cota diaria)');
}

/* O motor do rodizio no script.js: fila ponderada, semente por
   visitante/dia e cursor de sessao. */
['montarCicloAnuncio', 'proximoAnuncioEspaco', 'sementeAnuncio', 'hashAnuncio'].forEach(peca => {
    if (js.indexOf(peca) === -1) {
        errors.push('script.js sem a parte do rodizio: ' + peca);
    }
});
if (!/rpc\(\s*'anuncios_elegiveis'/.test(js)) {
    errors.push('script.js nao consulta a RPC anuncios_elegiveis (elegibilidade no banco)');
}
if (!/p_posicao/.test(js) || !/p_formato/.test(js)) {
    errors.push('script.js nao envia posicao e formato para a RPC anuncios_elegiveis');
}
if (!/qg_espaco_/.test(js)) {
    errors.push('script.js sem guardar o cursor do rodizio por sessao (sessionStorage)');
}
if (!/window\.QGAnuncios/.test(js)) {
    errors.push('script.js sem expor o motor de anuncios (window.QGAnuncios)');
}

/* O fim da materia usa o mesmo motor (mesmo rodizio, formato certo) */
if (!/QGAnuncios/.test(noticiaJs)) {
    errors.push('noticia.js sem usar o motor de anuncios (window.QGAnuncios)');
}

/* O painel precisa falar de peso e de cotas */
if (!/name="peso"/.test(adminHtml)) {
    errors.push('admin/index.html sem o campo de peso do anuncio (name="peso")');
}
if (!/name="limite_impressoes"/.test(adminHtml)) {
    errors.push('admin/index.html sem o campo de cota total (name="limite_impressoes")');
}
if (!/name="limite_impressoes_dia"/.test(adminHtml)) {
    errors.push('admin/index.html sem o campo de cota diaria (name="limite_impressoes_dia")');
}
if (!/impressoes_hoje/.test(adminJs)) {
    errors.push('admin/admin.js sem mostrar as impressoes de hoje do anuncio');
}
if (!/vw_anuncios_desempenho/.test(adminJs)) {
    errors.push('admin/admin.js sem ler a view vw_anuncios_desempenho');
}

/* ---------- 27. Tela de login do painel: o login tem de sumir ---------- */
/* Sem a regra [hidden] abaixo, o display:flex do .login-screen vencia o
   atributo hidden e o painel aparecia embaixo da tela de login. */
const adminCss = read('admin/admin.css');

if (!/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(adminCss)) {
    errors.push('admin/admin.css sem a regra [hidden] { display: none !important } (a tela de login continua aberta depois do login)');
}
if (!/id="loginScreen"/.test(adminHtml)) {
    errors.push('admin/index.html sem a tela de login (#loginScreen)');
}
if (!/id="app"/.test(adminHtml)) {
    errors.push('admin/index.html sem o painel (#app)');
}
if (!/byId\('loginScreen'\)\.hidden\s*=\s*true/.test(adminJs)) {
    errors.push('admin/admin.js sem esconder a tela de login depois de entrar');
}
if (!/byId\('app'\)\.hidden\s*=\s*false/.test(adminJs)) {
    errors.push('admin/admin.js sem mostrar o painel depois de entrar');
}

notes.push('Rotacao de anuncios: peso, prioridade (ordem no ciclo), cotas e elegibilidade no banco conferidas');
notes.push('Painel: regra [hidden] confere (a tela de login some depois do login)');

/* ---------- 28. Privacidade dos anuncios: quem ve o que ---------- */
/* O site (chave anonima) le o conteudo do anuncio. Cotas, metricas e o
   contato de autorizacao ficam so no painel: o banco precisa barrar. */
if (!/REVOKE ALL ON public\.anuncios FROM anon/.test(migrationsSql)) {
    errors.push('Nenhuma migration tira do papel anon a leitura inteira da tabela anuncios');
}
if (!/GRANT SELECT \([\s\S]{0,400}?\) ON public\.anuncios TO anon/.test(migrationsSql)) {
    errors.push('Nenhuma migration libera no papel anon apenas as colunas publicas de public.anuncios');
}
if (!/REVOKE ALL ON public\.anuncio_impressoes_diarias FROM anon/.test(migrationsSql)) {
    errors.push('A contagem diaria de impressoes continua visivel para a chave anonima (e dado do painel)');
}
if (!/REVOKE ALL ON public\.vw_anuncios_desempenho FROM anon/.test(migrationsSql)) {
    errors.push('A view de desempenho continua visivel para a chave anonima (e dado do painel)');
}
if (!/CREATE POLICY anuncios_leitura_publica[\s\S]{0,200}?FOR SELECT TO anon/.test(migrationsSql)) {
    errors.push('A leitura publica do anuncio nao esta restrita ao papel anon (quem entra com conta sem ser admin veria o que esta pausado)');
}

/* A RPC do rodizio nao pode devolver o contato de autorizacao */
const inicioElegiveis = migrationsSql.lastIndexOf('CREATE FUNCTION public.anuncios_elegiveis');

if (inicioElegiveis === -1) {
    errors.push('A RPC anuncios_elegiveis nao foi recriada com a lista de colunas publica');
} else {
    const fimElegiveis = migrationsSql.indexOf('$$;', inicioElegiveis);
    const corpoElegiveis = migrationsSql.slice(
        inicioElegiveis,
        fimElegiveis === -1 ? inicioElegiveis + 1500 : fimElegiveis
    );

    if (/autorizacao/.test(corpoElegiveis)) {
        errors.push('A RPC anuncios_elegiveis ainda devolve a coluna autorizacao (contato do anunciante)');
    }
}

/* O site nao pode pedir coluna privada do anuncio */
['limite_impressoes', 'autorizacao'].forEach(coluna => {
    if (js.indexOf(coluna) !== -1) {
        errors.push('script.js pede a coluna privada "' + coluna + '" (o publico nao deve ver dado do painel)');
    }
});
if (/select=[^;]{0,300}\b(impressoes|cliques)\b/.test(js)) {
    errors.push('script.js pede as metricas (impressoes/cliques) do anuncio (sao dados do painel)');
}

notes.push('Privacidade dos anuncios: o publico ve o conteudo, o painel ve cotas, metricas e autorizacao');

/* ---------- 29. Area de cotacoes (IMEA + Grao Direto + Investing) ---------- */
/* A pagina nao calcula preco no navegador: ela mostra o que o coletor
   gravou no banco. Por isso o dado tem de vir com fonte e hora. */
const cotacoesHtml = read('cotacoes.html');
const cotacoesJs = read('cotacoes.js');
const cotacoesMigration = read('supabase/migrations/20261112090000_qg_cotacoes.sql');

['cotGrid', 'cotStatus', 'cotChips', 'cotEmpty', 'cotFiltro'].forEach(id => {
    if (cotacoesHtml.indexOf('id="' + id + '"') === -1) {
        errors.push('cotacoes.html sem o elemento #' + id);
    }
});

/* O script da pagina le o banco e escreve com textContent */
if (!/select\('cotacoes'/.test(cotacoesJs)) {
    errors.push('cotacoes.js sem ler a tabela cotacoes do Supabase');
}
if (!/publicado=eq\.true/.test(cotacoesJs)) {
    errors.push('cotacoes.js sem filtrar as cotacoes publicadas (publicado=eq.true)');
}
if (/\.innerHTML\s*\+?=/.test(semComentarios(cotacoesJs))) {
    errors.push('cotacoes.js usa innerHTML (risco de XSS): use textContent');
}
if (/insertAdjacentHTML|outerHTML\s*=|document\.write/.test(cotacoesJs)) {
    errors.push('cotacoes.js escreve HTML no DOM: use textContent e createElement');
}

/* A migration do banco */
['cotacoes', 'cotacoes_fontes'].forEach(tabela => {
    if (cotacoesMigration.indexOf('CREATE TABLE IF NOT EXISTS public.' + tabela) === -1) {
        errors.push('Migration das cotacoes sem a tabela public.' + tabela);
    }
});
if (!/ALTER TABLE public\.cotacoes ENABLE ROW LEVEL SECURITY/.test(cotacoesMigration)) {
    errors.push('Migration das cotacoes sem ENABLE ROW LEVEL SECURITY em public.cotacoes');
}
if (!/CREATE POLICY cotacoes_leitura_publica[\s\S]{0,200}?USING \(publicado = true\)/.test(cotacoesMigration)) {
    errors.push('A leitura publica das cotacoes nao esta restrita ao que esta publicado (USING (publicado = true))');
}
if (/GRANT[^;]*INSERT[^;]*ON public\.cotacoes[^;]*TO anon/i.test(cotacoesMigration)) {
    errors.push('Migration libera INSERT anon em public.cotacoes (a cotacao e publicada pelo coletor ou pelo painel)');
}
if (!/REVOKE ALL ON public\.cotacoes_fontes FROM anon/.test(cotacoesMigration)) {
    errors.push('O estado das fontes continua visivel para a chave anonima (e dado do painel)');
}

/* O painel tem a aba de cotacoes */
if (!/data-tab="cotacoes"/.test(adminHtml)) {
    errors.push('admin/index.html sem a aba de Cotacoes');
}
if (!/cotTableBody/.test(adminHtml)) {
    errors.push('admin/index.html sem a tabela de cotacoes (#cotTableBody)');
}
if (!/cotFontesBody/.test(adminHtml)) {
    errors.push('admin/index.html sem a tabela do estado das fontes (#cotFontesBody)');
}
if (!/carregarCotacoes/.test(adminJs)) {
    errors.push('admin/admin.js sem a rotina que carrega as cotacoes');
}

/* O coletor existe, cobre as tres fontes e grava sem duplicar */
const coletor = read('tools/coletar-cotacoes.js');

['imea', 'grao_direto', 'investing'].forEach(fonte => {
    if (coletor.indexOf("'" + fonte + "'") === -1) {
        errors.push('tools/coletar-cotacoes.js sem a coleta da fonte ' + fonte);
    }
});
if (!/on_conflict=fonte,simbolo/.test(coletor)) {
    errors.push('tools/coletar-cotacoes.js sem gravar por on_conflict=fonte,simbolo (a cotacao volta sem duplicar)');
}
if (!/cotacoes_fontes/.test(coletor)) {
    errors.push('tools/coletar-cotacoes.js sem gravar o estado das fontes (cotacoes_fontes)');
}
if (SECRET_PATTERN.test(coletor)) {
    errors.push('tools/coletar-cotacoes.js com chave secreta embutida (use variavel de ambiente)');
}

/* A area de cotacoes entra no menu e no rodape do site todo */
['index.html', 'noticias.html', 'cotacoes.html'].forEach(file => {
    if (!/href="cotacoes\.html"/.test(read(file))) {
        errors.push(file + ' sem link para a area de cotacoes (cotacoes.html)');
    }
});

/* O sitemap anuncia a pagina */
if (!sitemap.includes('cotacoes.html')) {
    errors.push('sitemap.xml sem a pagina cotacoes.html');
}

notes.push('Area de cotacoes: pagina, filtro por mercado, painel e coletor conferidos');
notes.push('Privacidade das cotacoes: o publico ve so o que esta publicado; o estado das fontes e do painel');

/* ---------- Relatorio ---------- */
function report() {
    console.log('');
    console.log('=== Verificacao do site Q GRAOS ===');
    console.log('');

    notes.forEach(note => console.log('  [ok]    ' + note));
    warnings.forEach(warning => console.log('  [aviso] ' + warning));

    if (errors.length) {
        console.log('');
        errors.forEach(error => console.log('  [ERRO]  ' + error));
        console.log('');
        console.log('Resultado: ' + errors.length + ' problema(s) encontrado(s).');
    } else {
        console.log('');
        console.log('Resultado: tudo certo, nenhum problema encontrado.');
    }
    console.log('');
}

report();
process.exit(errors.length ? 1 : 0);
