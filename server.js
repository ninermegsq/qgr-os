'use strict';

/* ------------------------------------------------------------------
 * Servidor local estatico para a Q GRAOS (sem dependencias externas).
 * Uso: npm start  ->  http://127.0.0.1:8080
 * ------------------------------------------------------------------ */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.toml': 'text/plain; charset=utf-8'
};

/* ------------------------------------------------------------------
 * Cabecalhos de seguranca
 * Sao os mesmos do arquivo _headers (Netlify) e do .htaccess (Apache):
 * o servidor local precisa se comportar como os dois em producao.
 * ------------------------------------------------------------------ */
const SECURITY_HEADERS = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co blob:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};

/* Junta os cabecalhos de seguranca com os da resposta. */
function cabecalhos(extras) {
    return Object.assign({}, SECURITY_HEADERS, extras || {});
}

/* ------------------------------------------------------------------
 * O que o servidor local NAO pode servir
 *
 * O site publico e so o que esta na raiz: os HTML, o CSS, os JS, as
 * imagens, o robots.txt, o sitemap.xml e a pasta admin/. Fora disso
 * existe material que nao pode chegar no navegador: o historico do
 * Git (.git), as credenciais do painel (.qg-admin.json), o arquivo de
 * ambiente (.env), as migracoes do banco (supabase/) e as ferramentas
 * de desenvolvimento (tools/).
 *
 * A comparacao e feita por SEGMENTO do caminho, nunca por prefixo:
 * "supabase-api.js" (publico, usado por todas as paginas) tem de
 * continuar sendo servido, enquanto "supabase/" (interno) nao.
 *
 * A resposta e 404 com a pagina de erro do site, e nao 403: assim o
 * servidor nao confirma que o arquivo existe. Quem pede um caminho
 * bloqueado recebe exatamente a mesma resposta de quem pede um
 * caminho que nunca existiu.
 * ------------------------------------------------------------------ */
const SEGMENTOS_BLOQUEADOS = new Set([
    'git',          // .git
    'github',       // .github
    'supabase',     // supabase/ (migrations e functions)
    'tools',        // tools/ (scripts de desenvolvimento)
    'node_modules'  // dependencias do npm
]);

const ARQUIVOS_BLOQUEADOS = new Set([
    'package.json',
    'package-lock.json'
]);

/* Qualquer segmento que comece com ponto e um dotfile: .gitignore,
   .gitattributes, .qg-admin.json, .env, .env.local, .htaccess... */
function caminhoBloqueado(urlPath) {
    const segmentos = urlPath.split('/').filter(segmento => segmento !== '');

    for (const segmento of segmentos) {
        const nome = segmento.toLowerCase();

        // Dotfile: nome que comeca com ponto (inclui .env e variantes)
        if (nome.charAt(0) === '.') return true;

        // Pasta interna (comparacao exata do segmento)
        if (SEGMENTOS_BLOQUEADOS.has(nome)) return true;

        // Arquivo interno
        if (ARQUIVOS_BLOQUEADOS.has(nome)) return true;
    }

    return false;
}

const server = http.createServer((request, response) => {
    let urlPath;

    try {
        urlPath = decodeURIComponent(request.url.split('?')[0].split('#')[0]);
    } catch (error) {
        response.writeHead(400, cabecalhos({ 'Content-Type': 'text/plain; charset=utf-8' }));
        response.end('400 - URL invalida');
        return;
    }

    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    /* Um byte nulo no caminho faz o fs.stat lançar uma exceção
       síncrona (ERR_INVALID_ARG_VALUE) e derrubar o servidor inteiro.
       Melhor recusar a URL antes de tocar no disco. */
    if (urlPath.indexOf('\u0000') !== -1) {
        response.writeHead(400, cabecalhos({ 'Content-Type': 'text/plain; charset=utf-8' }));
        response.end('400 - URL invalida');
        return;
    }

    let filePath = path.join(ROOT, urlPath);

    /* Impede acesso a arquivos fora da pasta do projeto.
       O prefixo sozinho nao basta: um diretorio vizinho cujo nome
       comece com o nome da pasta ("...graos2") passaria no teste.
       Por isso a comparacao inclui o separador de caminho. */
    const dentroDoProjeto = filePath === ROOT || filePath.startsWith(ROOT + path.sep);

    if (!dentroDoProjeto) {
        response.writeHead(403, cabecalhos({ 'Content-Type': 'text/plain; charset=utf-8' }));
        response.end('403 - Acesso negado');
        return;
    }

    /* Caminho interno (dotfile, .git, .env, tools/, supabase/...):
       responde 404 com a pagina de erro do site, sem confirmar que o
       arquivo existe. */
    if (caminhoBloqueado(urlPath)) {
        responderPagina404(response, urlPath);
        return;
    }

    fs.stat(filePath, (statError, stats) => {
        if (!statError && stats.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }

        fs.readFile(filePath, (readError, data) => {
            if (readError) {
                // Caminho sem extensão = página: entrega o 404.html com status 404
                if (!path.extname(urlPath)) {
                    responderPagina404(response, urlPath);
                    return;
                }

                response.writeHead(404, cabecalhos({ 'Content-Type': 'text/plain; charset=utf-8' }));
                response.end('404 - Arquivo nao encontrado: ' + urlPath);
                return;
            }

            const extension = path.extname(filePath).toLowerCase();

            response.writeHead(200, cabecalhos({
                'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
                // Durante o desenvolvimento nunca serve versao antiga do cache
                'Cache-Control': 'no-store, no-cache, must-revalidate'
            }));
            response.end(data);
        });
    });
});

/* Entrega a pagina de erro do site (404.html) com status 404. */
function responderPagina404(response, urlPath) {
    const notFoundPage = path.join(ROOT, '404.html');

    fs.readFile(notFoundPage, (pageError, pageData) => {
        if (pageError) {
            response.writeHead(404, cabecalhos({ 'Content-Type': 'text/plain; charset=utf-8' }));
            response.end('404 - Arquivo nao encontrado: ' + urlPath);
            return;
        }

        response.writeHead(404, cabecalhos({ 'Content-Type': 'text/html; charset=utf-8' }));
        response.end(pageData);
    });
}

server.listen(PORT, HOST, () => {
    console.log('Q GRAOS rodando em http://' + HOST + ':' + PORT);
    console.log('Pressione Ctrl+C para encerrar.');
});
