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

const config = readSiteConfig();
const siteUrl = String(config.siteUrl || 'https://qgraos.com.br/').replace(/\/*$/, '/');
const today = new Date().toISOString().slice(0, 10);

const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    '  <url>\n' +
    '    <loc>' + siteUrl + '</loc>\n' +
    '    <lastmod>' + today + '</lastmod>\n' +
    '    <changefreq>monthly</changefreq>\n' +
    '    <priority>1.0</priority>\n' +
    '  </url>\n' +
    '</urlset>\n';

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');

console.log('sitemap.xml gerado: ' + siteUrl + ' (lastmod ' + today + ')');
