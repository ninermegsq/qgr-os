'use strict';

/* ------------------------------------------------------------------
 * Q GRAOS — sonda de API
 * ------------------------------------------------------------------
 * Ferramenta de apoio para descobrir o formato exato das respostas
 * das fontes de cotacao (IMEA, Grao Direto, Investing.com). Ela nao
 * grava nada: apenas mostra o que o servidor respondeu, para que o
 * coletor (tools/coletar-cotacoes.js) possa ser ajustado.
 *
 * COMO USAR
 *   node tools/probe-api.js <url> [<url> ...]
 *   node tools/probe-api.js --python <url>   (usa o auxiliar curl_cffi)
 *   node tools/probe-api.js --salvar <arquivo> <url> ...
 *       grava o corpo cru da resposta no arquivo (para ver o HTML
 *       inteiro de uma pagina que o terminal nao cabe)
 *
 * O que e mostrado
 *   - status HTTP e tipo do conteudo
 *   - quando e JSON: o formato do topo e as chaves do primeiro item
 *   - sempre: os primeiros caracteres do corpo bruto
 * ------------------------------------------------------------------ */

const { spawnSync } = require('child_process');
const path = require('path');

const argumentos = process.argv.slice(2);
const USAR_PYTHON = argumentos.indexOf('--python') !== -1;
const USAR_OPCOES = argumentos.indexOf('--options') !== -1;

/* "--salvar <arquivo>" grava o corpo cru da resposta no arquivo. */
const indiceSalvar = argumentos.indexOf('--salvar');
const ARQUIVO_SALVAR = indiceSalvar !== -1 ? (argumentos[indiceSalvar + 1] || '') : '';

/* "@arquivo.txt" le a lista de URLs de um arquivo (uma por linha). */
const URLs = [];
argumentos.filter(item => item.indexOf('--') !== 0).forEach(item => {
    if (item.charAt(0) === '@') {
        const caminho = item.slice(1);

        try {
            require('fs').readFileSync(caminho, 'utf8')
                .split(/\r?\n/)
                .map(linha => linha.trim())
                .filter(linha => linha && linha.charAt(0) !== '#')
                .forEach(linha => URLs.push(linha));
        } catch (erro) {
            console.log('  (nao consegui ler ' + caminho + ': ' + erro.message + ')');
        }

        return;
    }

    URLs.push(item);
});

const LIMITE = 1200;

function resumirItem(item) {
    if (item === null || item === undefined) return '(vazio)';
    if (typeof item !== 'object') return String(item).slice(0, 200);

    if (!Array.isArray(item)) {
        return Object.keys(item).map(chave =>
            chave + '=' + JSON.stringify(item[chave]).slice(0, 160)
        ).join('  ');
    }

    return '[' + item.length + ' itens]';
}

function resumoJson(dados) {
    if (dados === null || dados === undefined) return '  (sem JSON)';

    if (Array.isArray(dados)) {
        const linhas = [
            '  array com ' + dados.length + ' item(ns)',
            '  chaves do 1o item: ' +
                (dados.length && dados[0] && typeof dados[0] === 'object'
                    ? Object.keys(dados[0]).join(', ')
                    : '(item nao e objeto)')
        ];

        dados.slice(0, 25).forEach((item, indice) => {
            linhas.push('   [' + indice + '] ' + resumirItem(item));
        });

        if (dados.length > 25) linhas.push('   ... (' + (dados.length - 25) + ' itens a mais)');

        return linhas.join('\n');
    }

    if (typeof dados === 'object') {
        const linhas = ['  objeto com chaves: ' + Object.keys(dados).join(', ')];

        Object.keys(dados).forEach(chave => {
            const valor = dados[chave];

            if (Array.isArray(valor)) {
                linhas.push('   ' + chave + ' (' + valor.length + '):');

                valor.slice(0, 3).forEach((item, indice) => {
                    linhas.push('     [' + indice + '] ' + resumirItem(item));
                });
            } else if (valor && typeof valor === 'object') {
                linhas.push('   ' + chave + ': ' + JSON.stringify(valor).slice(0, 400));
            } else {
                linhas.push('   ' + chave + ': ' + JSON.stringify(valor).slice(0, 200));
            }
        });

        return linhas.join('\n');
    }

    return '  valor simples: ' + JSON.stringify(dados).slice(0, LIMITE);
}

function ocorrencias(texto, re, limite) {
    const achados = [];
    let achado;

    while ((achado = re.exec(texto)) !== null) {
        const valor = achado[0];

        if (achados.indexOf(valor) === -1) achados.push(valor);
        if (achados.length >= (limite || 6)) break;
    }

    return achados;
}

function contexto(texto, agulha, tamanho) {
    const saidas = [];
    let posicao = 0;
    let achado;

    while ((achado = texto.indexOf(agulha, posicao)) !== -1) {
        const inicio = Math.max(0, achado - 120);
        saidas.push('      ...' +
            texto.slice(inicio, achado + (tamanho || 200)).replace(/\s+/g, ' ') + '...');

        posicao = achado + agulha.length;
        if (saidas.length >= 2) break;
    }

    return saidas;
}

function garimparHtml(texto) {
    const achados = [];
    const padroes = [
        /"pair_ID"\s*:\s*"?(\d+)/i,
        /"pairId"\s*:\s*"?(\d+)/i,
        /"last_close"\s*:\s*"?([\d.]+)/i,
        /"last"\s*:\s*"?([\d.]+)/i,
        /"close"\s*:\s*"?([\d.]+)/i,
        /"change_percent"\s*:\s*"?(-?[\d.]+)/i,
        /instrument-price__last[^>]*>([^<]+)</i,
        /data-test="instrument-price-last"[^>]*>([^<]+)</i
    ];

    padroes.forEach(re => {
        const achado = re.exec(texto);
        if (achado) achados.push(re.source + '  ->  ' + achado[1]);
    });

    ocorrencias(texto, /financialdata[^"'\\\s]{0,60}/g, 6).forEach(rota => {
        achados.push('rota: ' + rota);
    });

    ocorrencias(texto, /api\/[a-z0-9\/_.-]{3,70}/gi, 8).forEach(api => {
        achados.push('api: ' + api);
    });

    ['"pair_ID"', '"smlId"', '"last"', 'change_percent', 'instrument-price-last']
        .forEach(agulha => {
            contexto(texto, agulha).forEach(trecho => {
                achados.push('contexto ' + agulha + ':' + trecho);
            });
        });

    return achados;
}

/* Paginas Next.js carregam os dados em um <script id="__NEXT_DATA__">.
 * Quando ele existe, mostramos a estrutura (sem despejar o arquivo
 * inteiro no terminal). */
function mostrarNextData(texto) {
    const inicio = texto.indexOf('id="__NEXT_DATA__"');
    if (inicio === -1) return;

    const abre = texto.indexOf('>', inicio);
    const fecha = texto.indexOf('</script>', abre);

    if (abre === -1 || fecha === -1) return;

    const bruto = texto.slice(abre + 1, fecha);

    let dados = null;
    try {
        dados = JSON.parse(bruto);
    } catch (erro) {
        console.log('  __NEXT_DATA__ nao e JSON valido');
        return;
    }

    const pageProps = dados && dados.props && dados.props.pageProps;

    if (pageProps && typeof pageProps === 'object') {
        console.log('  __NEXT_DATA__ -> pageProps: ' + Object.keys(pageProps).join(', '));

        Object.keys(pageProps).forEach(chave => {
            const valor = pageProps[chave];

            if (Array.isArray(valor) && valor.length && typeof valor[0] === 'object') {
                console.log('    ' + chave + ' -> ' + valor.length + ' item(ns), chaves: ' +
                    Object.keys(valor[0]).join(', '));
                console.log('      [0] ' + resumirItem(valor[0]));
                console.log('      [1] ' + resumirItem(valor[1]));
            } else if (valor && typeof valor === 'object') {
                console.log('    ' + chave + ' -> chaves: ' + Object.keys(valor).join(', '));

                Object.keys(valor).forEach(sub => {
                    const interno = valor[sub];

                    if (Array.isArray(interno) && interno.length) {
                        console.log('      ' + sub + ' -> ' + interno.length + ' item(ns), chaves: ' +
                            (typeof interno[0] === 'object' ? Object.keys(interno[0]).join(', ') : '(valor)'));
                        console.log('        [0] ' + resumirItem(interno[0]));
                    }
                });
            }
        });
    }
}

async function sondarComFetch(url) {
    const metodo = USAR_OPCOES ? 'OPTIONS' : 'GET';

    const resposta = await fetch(url, {
        method: metodo,
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; QG-RAOS/1.0; +https://qgraos.com.br)',
            Accept: 'application/json, text/html, */*',
            Origin: 'https://qgraos.com.br'
        },
        redirect: 'follow'
    });

    const texto = await resposta.text();
    const tipo = resposta.headers.get('content-type') || '';

    console.log('\n=== ' + url + ' (' + metodo + ') ===');
    console.log('  status: ' + resposta.status + '  (' + tipo + ')');

    /* Os cabecalhos de CORS decidem se o navegador entrega a
       resposta ou se o fetch falha com "Failed to fetch". */
    const cors = [];

    resposta.headers.forEach((valor, nome) => {
        if (nome.toLowerCase().indexOf('access-control') === 0) {
            cors.push(nome + ': ' + valor);
        }
    });

    console.log('  CORS: ' + (cors.length ? cors.join(' | ') : '(nenhum cabecalho de CORS)'));

    let dados = null;
    try {
        dados = JSON.parse(texto);
    } catch (erro) {
        dados = null;
    }

    if (dados !== null) {
        console.log(resumoJson(dados));
    } else {
        console.log('  corpo nao e JSON');
        garimparHtml(texto).forEach(item => console.log('  ' + item));
        mostrarNextData(texto);
    }

    console.log('  corpo (inicio): ' + texto.slice(0, LIMITE).replace(/\s+/g, ' '));

    if (ARQUIVO_SALVAR) {
        require('fs').writeFileSync(ARQUIVO_SALVAR, texto, 'utf8');
        console.log('  corpo salvo em: ' + ARQUIVO_SALVAR + ' (' + texto.length + ' caracteres)');
    }
}

function sondarComPython(url) {
    const executavel = (function () {
        const tentativa = spawnSync(process.env.QG_PYTHON || 'python', ['--version'], {
            encoding: 'utf8'
        });

        if (tentativa.error && tentativa.error.code === 'ENOENT') {
            const alternativa = spawnSync('python3', ['--version'], { encoding: 'utf8' });
            return alternativa.error ? null : 'python3';
        }

        return process.env.QG_PYTHON || 'python';
    })();

    if (!executavel) {
        console.log('\n=== ' + url + ' ===');
        console.log('  Python nao encontrado.');
        return;
    }

    const processo = spawnSync(executavel, [path.join(__dirname, 'cotacoes-investing.py')], {
        input: JSON.stringify({
            requisicoes: [{
                chave: 'probe',
                url: url,
                metodo: 'GET',
                corpo: null,
                headers: { 'domain-id': 'www' }
            }]
        }),
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024
    });

    console.log('\n=== ' + url + ' (curl_cffi) ===');

    let dados = null;
    try {
        dados = JSON.parse(processo.stdout || '{}');
    } catch (erro) {
        console.log('  saida invalida do auxiliar: ' + (processo.stderr || '').slice(0, 300));
        return;
    }

    if (dados.erro) {
        console.log('  erro: ' + dados.erro);
        return;
    }

    (dados.itens || []).forEach(item => {
        console.log('  status: ' + item.status + (item.erro ? '  erro: ' + item.erro : ''));

        if (item.json !== null && item.json !== undefined) {
            console.log(resumoJson(item.json));
        } else {
            console.log('  (sem JSON)');
            garimparHtml(String(item.texto || '')).forEach(item => console.log('  ' + item));
        }

        console.log('  corpo (inicio): ' + String(item.texto || '').slice(0, LIMITE).replace(/\s+/g, ' '));
    });
}

async function principal() {
    if (!URLs.length) {
        console.log('Uso: node tools/probe-api.js [--python] <url> [<url> ...]');
        return;
    }

    for (const url of URLs) {
        try {
            if (USAR_PYTHON) {
                sondarComPython(url);
            } else {
                await sondarComFetch(url);
            }
        } catch (erro) {
            console.log('\n=== ' + url + ' ===');
            console.log('  falha: ' + erro.message);
        }
    }
}

principal();
