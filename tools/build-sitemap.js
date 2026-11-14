'use strict';

/* ------------------------------------------------------------------
 * Gera o sitemap.xml com a data do build.
 * Roda: npm run sitemap
 * ------------------------------------------------------------------ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function readSiteConfig() {
    const configPath = path.join(ROOT, 'site.config.js');

    if (!fs.existsSync(configPath)) {
        console.log('Aviso: site.config.js nao encontrado; usando o endereco padrao.');
        return {};
    }

    const code = fs.readFileSync(configPath, 'utf8');
    const sandbox = {};

    // Executa o arquivo com um `window` falso para ler os valores
    const factory = new Function('window', code + '\nreturn window.QG_SITE || {};');
    return factory(sandbox) || {};
}

/* Deslocamento fixo de Mato Grosso em relacao ao UTC (em ms).
   Mesmo valor do FUSO_QG do script.js: o lastmod precisa ser o dia
   do site, nao o dia UTC, que pode estar ate 4 horas a frente. */
const FUSO_QG = -4 * 60 * 60 * 1000;

const config = readSiteConfig();
const siteUrl = String(config.siteUrl || 'https://qgraos.com.br/').replace(/\/*$/, '/');
const today = new Date(Date.now() + FUSO_QG).toISOString().slice(0, 10);

/* Paginas publicas do site. A pagina de noticias entra separada:
   ela tem conteudo proprio e muda toda vez que ha publicacao nova.
   A pagina de cada materia (noticia.html?id=...) NAO entra: o
   endereco so existe com o id da noticia e o Google indexa pelo
   canonical que o proprio site monta. */
const PAGINAS = [
    { loc: siteUrl, changefreq: 'monthly', priority: '1.0' },
    { loc: siteUrl + 'noticias.html', changefreq: 'daily', priority: '0.8' },
    { loc: siteUrl + 'cotacoes.html', changefreq: 'daily', priority: '0.8' },
    { loc: siteUrl + 'publicidade.html', changefreq: 'yearly', priority: '0.3' }
];

const urls = PAGINAS.map(pagina => (
    '  <url>\n' +
    '    <loc>' + pagina.loc + '</loc>\n' +
    '    <lastmod>' + today + '</lastmod>\n' +
    '    <changefreq>' + pagina.changefreq + '</changefreq>\n' +
    '    <priority>' + pagina.priority + '</priority>\n' +
    '  </url>\n'
)).join('');

const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls +
    '</urlset>\n';

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');

console.log('sitemap.xml gerado: ' + PAGINAS.length + ' pagina(s) (lastmod ' + today + ')');
