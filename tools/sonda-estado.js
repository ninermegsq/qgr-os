/* Sonda de estado do banco (somente leitura). */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const conteudo = fs.readFileSync(path.join(ROOT, 'site.config.js'), 'utf8');
const url = (conteudo.match(/url:\s*'([^']+)'/) || [])[1];
const anonKey = (conteudo.match(/anonKey:\s*'([^']*)'/) || [])[1];

async function p(method, caminho, corpo, extra) {
    const headers = Object.assign({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: anonKey
    }, extra || {});

    const opcoes = { method: method, headers: headers, cache: 'no-store' };
    if (corpo !== undefined) opcoes.body = JSON.stringify(corpo);

    const r = await fetch(url + caminho, opcoes);
    const t = await r.text();

    let dados = null;
    try { dados = t ? JSON.parse(t) : null; } catch (e) { dados = t; }

    return { status: r.status, dados: dados };
}

async function principal() {
    const vistas = [
        'vw_painel_resumo',
        'vw_leads_por_dia',
        'vw_visitas_por_dia',
        'vw_visitas_por_tipo',
        'vw_anuncios_desempenho',
        'vw_anuncios_desempenho_publica'
    ];

    console.log('\n--- vistas (anon) ---');
    for (const v of vistas) {
        const r = await p('GET', '/rest/v1/' + v + '?select=*&limit=3');
        const linhas = Array.isArray(r.dados) ? r.dados.length : '-';
        const msg = (r.dados && r.dados.message) ? String(r.dados.message).slice(0, 70) : '';
        console.log('  ' + v.padEnd(32) + ' HTTP ' + r.status + '  linhas=' + linhas + '  ' + msg);
    }

    console.log('\n--- escrita anon com rollback ---');
    const rb = { Prefer: 'tx=rollback' };
    /* O id de `visitas` e `bigserial`, nao uuid: um id de teste
       precisa caber em bigint, senao o proprio filtro volta 400
       (invalid input syntax for type bigint) e a sonda mente. */
    const alvos = [
        ['POST', '/rest/v1/visitas', { tipo: 'pageview', path: '/sonda', visitante_id: '00000000-0000-4000-8000-0000000000ff', sessao_id: '00000000-0000-4000-8000-0000000000fe' }],
        ['POST', '/rest/v1/leads', { nome: 'Sonda', email: 'sonda@qgraos.invalid', telefone: '66999990000' }],
        ['POST', '/rest/v1/administradores', { email: 'sonda@qgraos.invalid' }],
        ['PATCH', '/rest/v1/leads?id=eq.00000000-0000-4000-8000-0000000000fd', { nome: 'X' }],
        ['DELETE', '/rest/v1/leads?id=eq.00000000-0000-4000-8000-0000000000fd'],
        ['DELETE', '/rest/v1/visitas?id=eq.999999999'],
        ['DELETE', '/rest/v1/administradores?id=eq.00000000-0000-4000-8000-0000000000fb']
    ];
    for (const [m, c, b] of alvos) {
        const r = await p(m, c, b, rb);
        const msg = (r.dados && r.dados.message) ? String(r.dados.message).slice(0, 70) : '';
        console.log('  ' + (m + ' ' + c).padEnd(58) + ' HTTP ' + r.status + '  ' + msg);
    }

    console.log('\n--- RPC novas (anon) ---');
    const rpcs = [
        ['anuncios_painel_desempenho', {}],
        ['registrar_impressao_anuncio', { p_id: '00000000-0000-4000-8000-000000000004' }],
        ['clicar_anuncio', { p_id: '00000000-0000-4000-8000-000000000004' }],
        ['clicar_noticia', { p_id: '00000000-0000-4000-8000-000000000003' }],
        ['registrar_visualizacao_noticia', { p_id: '00000000-0000-4000-8000-000000000003' }]
    ];
    for (const [n, b] of rpcs) {
        const r = await p('POST', '/rest/v1/rpc/' + n, b);
        const msg = (r.dados && r.dados.message) ? String(r.dados.message).slice(0, 90) : '';
        console.log('  ' + n.padEnd(32) + ' HTTP ' + r.status + '  ' + msg);
    }

    console.log('\n--- leitura publica (anon) ---');
    const leituras = [
        '/rest/v1/noticias?select=id,titulo,publicado_em&limit=5',
        '/rest/v1/anuncios?select=id,titulo&limit=5',
        '/rest/v1/leads?select=id&limit=1',
        '/rest/v1/visitas?select=id&limit=1'
    ];
    for (const l of leituras) {
        const r = await p('GET', l);
        const linhas = Array.isArray(r.dados) ? r.dados.length : '-';
        console.log('  ' + l.padEnd(58) + ' HTTP ' + r.status + '  linhas=' + linhas);
    }
}

principal().catch(e => { console.error(e); process.exit(1); });
