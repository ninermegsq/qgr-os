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
    '404.html',
    'style.css',
    'script.js',
    'site.config.js',
    'supabase-api.js',
    'admin/index.html',
    'admin/admin.css',
    'admin/admin.js',
    'supabase/config.toml',
    'supabase/migrations/20260101000000_qg_init.sql',
    'supabase/functions/noticias/index.ts',
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
const HTML_FILES = ['index.html', '404.html'];
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

while ((match = symbolPattern.exec(html)) !== null) symbols.add(match[1]);

const usePattern = /<use[^>]+href="#([^"]+)"/g;
let uses = 0;
while ((match = usePattern.exec(html)) !== null) {
    uses++;
    if (!symbols.has(match[1])) {
        errors.push('Icone SVG inexistente no sprite: #' + match[1]);
    }
}
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
while ((match = configPattern.exec(html)) !== null) {
    configKeys.add(match[1]);
    if (!KNOWN_CONFIG_KEYS.includes(match[1])) {
        errors.push('Chave de configuracao desconhecida no HTML: "' + match[1] + '"');
    }
}
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

seoRequired.forEach(item => {
    if (!item.pattern.test(html)) errors.push('SEO: falta ' + item.label + ' no <head>');
});

// O JSON-LD deve citar os dados de contato
if (html.includes('application/ld+json')) {
    if (!html.includes(String(config.cnpj))) errors.push('JSON-LD sem o CNPJ do site.config.js');
    if (!html.includes(String(config.email))) errors.push('JSON-LD sem o e-mail do site.config.js');
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

// Secao de noticias no site
if (!/id="noticias"/.test(html)) errors.push('index.html sem a secao #noticias');
if (!/id="newsGrid"/.test(html)) errors.push('index.html sem o container #newsGrid');
if (!/class="nav-whatsapp"/.test(html)) errors.push('index.html sem o botao de WhatsApp na navegacao (.nav-whatsapp)');

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
if (/innerHTML/.test(js)) {
    errors.push('script.js usa innerHTML (risco de XSS): use textContent');
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
