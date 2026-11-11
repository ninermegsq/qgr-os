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

const server = http.createServer((request, response) => {
    let urlPath;

    try {
        urlPath = decodeURIComponent(request.url.split('?')[0].split('#')[0]);
    } catch (error) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('400 - URL invalida');
        return;
    }

    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    let filePath = path.join(ROOT, urlPath);

    // Impede acesso a arquivos fora da pasta do projeto
    if (!filePath.startsWith(ROOT)) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('403 - Acesso negado');
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
                    const notFoundPage = path.join(ROOT, '404.html');

                    fs.readFile(notFoundPage, (pageError, pageData) => {
                        if (pageError) {
                            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                            response.end('404 - Arquivo nao encontrado: ' + urlPath);
                            return;
                        }

                        response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                        response.end(pageData);
                    });

                    return;
                }

                response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                response.end('404 - Arquivo nao encontrado: ' + urlPath);
                return;
            }

            const extension = path.extname(filePath).toLowerCase();

            response.writeHead(200, {
                'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
                // Durante o desenvolvimento nunca serve versao antiga do cache
                'Cache-Control': 'no-store, no-cache, must-revalidate'
            });
            response.end(data);
        });
    });
});

server.listen(PORT, HOST, () => {
    console.log('Q GRAOS rodando em http://' + HOST + ':' + PORT);
    console.log('Pressione Ctrl+C para encerrar.');
});
