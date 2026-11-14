/* Sonda: procura no banco uma via de execucao de SQL (RPC administrativa).
   Se existir, as migrations podem ser aplicadas pela API REST usando a
   sessao do administrador — sem depender do Dashboard nem do token do CLI.

   Somente leitura: cada RPC candidata e chamada com uma consulta
   inofensiva e o resultado e apenas observado. */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const cfg = fs.readFileSync(path.join(ROOT, 'site.config.js'), 'utf8');
const URL_BASE = (cfg.match(/url:\s*'([^']+)'/) || [])[1];
const ANON = (cfg.match(/anonKey:\s*'([^']*)'/) || [])[1];

/* ---------- cliente anon ---------- */
async function anonPost(pathname, body) {
    const r = await fetch(URL_BASE + pathname, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            apikey: ANON
        },
        body: JSON.stringify(body),
        cache: 'no-store'
    });
    return { status: r.status, texto: await r.text() };
}

/* ---------- login do administrador ---------- */
async function entrar() {
    const arquivo = path.join(ROOT, '.qg-admin.json');

    if (!fs.existsSync(arquivo)) {
        console.log('Sem .qg-admin.json local.');
        return null;
    }

    const cred = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    const email = cred.email || cred.EMAIL;
    const senha = cred.password || cred.senha || cred.PASSWORD;

    if (!email || !senha) {
        console.log('.qg-admin.json sem e-mail/senha nos campos usuais.');
        return null;
    }

    const r = await fetch(URL_BASE + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            apikey: ANON
        },
        body: JSON.stringify({ email: email, password: senha }),
        cache: 'no-store'
    });

    const t = await r.text();
    let d = null;
    try { d = JSON.parse(t); } catch (e) { d = null; }

    if (!d || !d.access_token) {
        console.log('Login do administrador falhou: HTTP ' + r.status);
        return null;
    }

    console.log('Login do administrador: HTTP ' + r.status + ' (papel: ' + (d.user && d.user.role) + ')');
    return d.access_token;
}

async function tokenPost(jwt, pathname, body) {
    const r = await fetch(URL_BASE + pathname, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            apikey: ANON,
            Authorization: 'Bearer ' + jwt
        },
        body: JSON.stringify(body),
        cache: 'no-store'
    });
    return { status: r.status, texto: await r.text() };
}

async function tokenGet(jwt, pathname) {
    const r = await fetch(URL_BASE + pathname, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            apikey: ANON,
            Authorization: 'Bearer ' + jwt
        },
        cache: 'no-store'
    });
    return { status: r.status, texto: await r.text() };
}

/* Candidatas: nome de RPC que executa SQL dentro do banco. */
const CANDIDATAS = [
    'exec_sql', 'execute_sql', 'exec', 'run_sql', 'sql',
    'pg_exec', 'query', 'execute_query', 'executesql', 'run_query',
    'eval_sql', 'admin_exec', 'supabase_exec', 'exec_statement',
    'exec_ddl', 'run_ddl', 'apply_sql', 'psql', 'do_sql', 'sql_exec'
];

const CORPO = {
    sql: 'select 1',
    query: 'select 1',
    statement: 'select 1',
    sql_query: 'select 1',
    text: 'select 1'
};

async function principal() {
    const jwt = await entrar();

    if (!jwt) {
        console.log('\nSem sessao de administrador: a sondagem de RPC administrativa para aqui.');
        return;
    }

    console.log('\n--- procurando RPC de execucao de SQL (com sessao de admin) ---');

    let achou = false;

    for (const nome of CANDIDATAS) {
        const corpo = Object.assign({}, CORPO, { p_sql: 'select 1', p_query: 'select 1' });
        const r = await tokenPost(jwt, '/rest/v1/rpc/' + nome, corpo);
        const txt = (r.texto || '').slice(0, 120).replace(/\s+/g, ' ');

        /* 404 = nao existe; 400 = existe mas os parametros nao bateram
           (ou seja, a funcao existe!); 401/403 = existe mas negada. */
        const existe = r.status !== 404 || /Could not find the function/i.test(r.texto);

        if (existe) {
            achou = true;
            console.log('  [' + nome + '] HTTP ' + r.status + '  ' + txt);
        }
    }

    if (!achou) {
        console.log('  nenhuma RPC de execucao de SQL encontrada (todas 404).');
    }

    console.log('\n--- funcoes visiveis no schema (OpenAPI) ---');

    const spec = await tokenGet(jwt, '/rest/v1/');

    if (spec.status === 200) {
        try {
            const d = JSON.parse(spec.texto);
            const caminhos = Object.keys(d.paths || {})
                .filter(p => p.indexOf('/rpc/') === 0)
                .map(p => p.replace('/rpc/', ''))
                .sort();

            console.log('  total de RPC expostas: ' + caminhos.length);
            caminhos.forEach(c => console.log('    - ' + c));
        } catch (e) {
            console.log('  OpenAPI nao pode ser lido: ' + (spec.texto || '').slice(0, 120));
        }
    } else {
        console.log('  OpenAPI: HTTP ' + spec.status);
    }

    console.log('\n--- schemas do banco (via OpenAPI) ---');

    const spec2 = await tokenGet(jwt, '/rest/v1/');

    if (spec2.status === 200) {
        try {
            const d = JSON.parse(spec2.texto);
            const defs = d.definitions || d.components?.schemas || {};
            const tabelas = Object.keys(defs).filter(k => !k.startsWith('pg_'));
            console.log('  relacoes expostas: ' + tabelas.length);
            tabelas.forEach(t => console.log('    - ' + t));
        } catch (e) { /* ignora */ }
    }
}

principal().catch(e => { console.error(e); process.exit(1); });
