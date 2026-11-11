'use strict';

/* ------------------------------------------------------------------
 * Teste de ponta a ponta: sobe o servidor local e busca todos os
 * arquivos do site, conferindo status HTTP e tipo de conteudo.
 * Roda: npm run test:server
 * ------------------------------------------------------------------ */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 8099;
const HOST = '127.0.0.1';

const failures = [];
const results = [];

function request(urlPath) {
    return new Promise(resolve => {
        const request = http.get(
            { host: HOST, port: PORT, path: urlPath, timeout: 5000 },
            response => {
                let body = '';
                response.setEncoding('utf8');
                response.on('data', chunk => { body += chunk; });
                response.on('end', () => {
                    resolve({ status: response.statusCode, type: response.headers['content-type'] || '', body });
                });
            }
        );
        request.on('error', error => resolve({ status: 0, type: '', body: '', error }));
        request.on('timeout', () => { request.destroy(); resolve({ status: 0, type: '', body: '', error: new Error('timeout') }); });
    });
}

function collectReferences() {
    const references = new Set(['/style.css', '/script.js', '/site.config.js', '/404.html', '/robots.txt', '/sitemap.xml']);

    ['index.html', '404.html'].forEach(file => {
        const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const pattern = /(?:src|href)="([^"]+)"/g;
        let match;

        while ((match = pattern.exec(html)) !== null) {
            const value = match[1];
            if (!value || value.startsWith('#') || value.startsWith('data:')) continue;
            if (/^(https?:|mailto:|tel:|javascript:)/i.test(value)) continue;
            references.add('/' + value.split('?')[0].split('#')[0].replace(/^\/+/, ''));
        }
    });

    return Array.from(references);
}

async function main() {
    const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
        env: Object.assign({}, process.env, { PORT: String(PORT), HOST }),
        stdio: 'ignore'
    });

    // Espera o servidor subir
    let ready = false;
    for (let attempt = 0; attempt < 40 && !ready; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 150));
        const probe = await request('/');
        ready = probe.status === 200;
    }

    if (!ready) {
        console.log('  [ERRO]  O servidor nao respondeu na porta ' + PORT);
        server.kill();
        process.exit(1);
    }

    // Pagina inicial
    const home = await request('/');
    if (home.status === 200 && /<title>/i.test(home.body)) {
        results.push('GET /  ->  200  (' + home.type + ')');
    } else {
        failures.push('GET /  ->  ' + home.status);
    }

    // Todos os arquivos referenciados
    for (const reference of collectReferences()) {
        const response = await request(reference);
        if (response.status === 200) {
            results.push('GET ' + reference + '  ->  200');
        } else {
            failures.push('GET ' + reference + '  ->  ' + response.status);
        }
    }

    // Arquivo inexistente deve retornar 404 (e nao derrubar o servidor)
    const missing = await request('/arquivo-que-nao-existe.js');
    if (missing.status === 404) {
        results.push('GET /arquivo-que-nao-existe.js  ->  404 (esperado)');
    } else {
        failures.push('GET /arquivo-que-nao-existe.js  ->  ' + missing.status + ' (esperava 404)');
    }

    // Pagina inexistente deve entregar a pagina de erro 404 com status 404
    const missingPage = await request('/pagina-que-nao-existe');
    if (missingPage.status === 404 && /P.gina n.o encontrada/.test(missingPage.body)) {
        results.push('GET /pagina-que-nao-existe  ->  404 + pagina de erro (esperado)');
    } else {
        failures.push('GET /pagina-que-nao-existe  ->  ' + missingPage.status + ' (esperava 404 com a pagina de erro)');
    }

    // A pagina de erro precisa estar disponivel direto
    const errorPage = await request('/404.html');
    if (errorPage.status === 200) {
        results.push('GET /404.html  ->  200');
    } else {
        failures.push('GET /404.html  ->  ' + errorPage.status);
    }

    server.kill();

    console.log('');
    console.log('=== Teste do servidor local ===');
    console.log('');
    results.forEach(result => console.log('  [ok]    ' + result));

    if (failures.length) {
        console.log('');
        failures.forEach(failure => console.log('  [ERRO]  ' + failure));
        console.log('');
        console.log('Resultado: ' + failures.length + ' falha(s).');
        console.log('');
        process.exit(1);
    }

    console.log('');
    console.log('Resultado: servidor entregou todos os arquivos com HTTP 200.');
    console.log('');
}

main();
