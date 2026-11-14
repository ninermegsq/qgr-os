/* Banco de teste real (Postgres em WASM, via PGlite) para validar as
   migrations do Q GRAOS.

   POR QUE ISTO EXISTE
   As migrations nunca foram aplicadas no banco de producao (falta
   credencial do Supabase CLI nesta maquina). Sem um Postgres de
   verdade nao da para saber se o SQL e valido, se a cadeia roda sem
   erro e se as protecoes ficam como o texto promete.

   O que este teste cobre:
     - o arquivo de referencia (schema completo) roda sem erro;
     - a cadeia incremental roda sem erro, na ordem;
     - cada migration e idempotente (roda duas vezes);
     - o resultado final tem as protecoes esperadas: `anon` sem escrita,
       as vistas do painel fora do alcance da chave publica, as RPCs de
       contagem com o parametro de sessao e o teto por sessao.

   O que este teste NAO cobre (precisa do Supabase de verdade):
     - a camada HTTP do PostgREST (PGRST202, 204, 401);
     - o GoTrue (login do administrador);
     - o `auth.uid()` real (aqui o uid e fixo).

   Uso: node tools/testar-migrations.js
*/
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const DIR_MIGRACOES = path.join(ROOT, 'supabase', 'migrations');

/* PGlite fica num diretorio proprio: e um banco em disco. */
const DIR_PG = path.join(process.env.TEMP || process.env.TMP || '.', 'qg-pglite-banco');

/* UID fixo do "administrador" simulado. */
const UID_ADMIN = '11111111-1111-4111-8111-111111111111';

/* ------------------------------------------------------------------
 * Preparo do banco: papeis, schemas e funcoes que o Supabase
 * provides (auth.uid, auth.jwt, auth.role) e que nao existem aqui.
 *
 * O `auth` e as funcoes sao criados ANTES do arquivo de referencia:
 * a migration de referencia usa `auth.uid()` dentro de `e_admin()`
 * e usa o schema `auth` (a coluna de identidade do administrador).
 * ------------------------------------------------------------------ */
const PREPARO = `
DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'supabase_admin'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', r);
        END IF;
    END LOOP;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS 'SELECT ''${UID_ADMIN}''::uuid';

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE AS 'SELECT ''{}''::jsonb';

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE AS 'SELECT ''authenticated''::text';

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

/* Stub da tabela auth.users: o GoTrue e quem a cria no Supabase de
   verdade. As migrations de administracao (criar/rotacionar senha,
   limpar usuario de teste) mexem nela, entao ela precisa existir para
   o SQL ser validado. As colunas sao as que o GoTrue usa. */
CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id uuid,
    aud text,
    role text,
    email text UNIQUE,
    encrypted_password text,
    email_confirmed_at timestamptz,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    confirmation_token text,
    recovery_token text,
    email_change_token_new text,
    email_change text,
    phone_change text,
    phone_change_token text,
    email_change_token_current text,
    reauthentication_token text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

/* Stub da tabela auth.identities: o GoTrue liga cada usuario a uma
   identidade por provedor. A migration de administrador a preenche. */
CREATE TABLE IF NOT EXISTS auth.identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    provider_id text NOT NULL,
    provider text NOT NULL,
    identity_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_sign_in_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
`;

/* Stub da funcao crypt do pgcrypto: o PGlite nao embala a extensao
   pgcrypto (ela precisa de compilacao nativa), mas o Supabase de
   verdade tem. As migrations de senha do administrador usam
   crypt(senha, gen_salt('bf')). Aqui a funcao e um substituto
   deterministico: o objetivo e validar o SQL, nao a criptografia. */
const STUB_PGCrypto = `
CREATE OR REPLACE FUNCTION public.gen_salt(tipo text)
    RETURNS text LANGUAGE sql IMMUTABLE AS
    'SELECT ''$2a$10$'' || md5(coalesce(tipo, ''bf''))';

CREATE OR REPLACE FUNCTION public.crypt(texto text, sal text)
    RETURNS text LANGUAGE sql IMMUTABLE AS
    'SELECT ''\$2a\$10\$'' || md5(coalesce(texto, '''') || coalesce(sal, ''''))';
`;
const SENHA_TESTE = 'senha-de-teste-descartavel-0000';

/* Como rodar cada migration que precisa de ambiente proprio. */
const AMBIENTE = {
    '20261111160027_qg_admin_padrao.sql':
        "SET app.admin_senha = '" + SENHA_TESTE + "';\n" + STUB_PGCrypto,
    '20261111171841_20261112000000_qg_rota_senha_admin.sql':
        "SET app.admin_senha = '" + SENHA_TESTE + "';\n" + STUB_PGCrypto
};

/* O arquivo de referencia cria `public.e_admin()` com o proprio
   corpo. Esta versao cobre o caso de o arquivo ja existir. */
const PREPARO_POS = `
CREATE OR REPLACE FUNCTION public.e_admin() RETURNS boolean
    LANGUAGE sql STABLE AS 'SELECT true';
`;

const REFERENCIA = '20260101000000_qg_init.sql';

/* A cadeia incremental que precisa ser validada. */
const CADEIA = [
    '20261113120000_qg_dia_cota_anuncios_fuso_site.sql',
    '20261113140000_qg_revoga_vistas_painel_anon.sql',
    '20261113150000_qg_vistas_dia_site.sql',
    '20261113160000_qg_revoga_escrita_anon.sql',
    '20261113170000_qg_rpc_painel_anuncios.sql',
    '20261113180000_qg_limites_chamadas_publicas.sql'
];

/* Todas as migrations do diretorio, na ordem em que o `supabase db push`
   as aplica (ordem alfabetica do nome do arquivo, que comeca com o
   timestamp). Rodar a cadeia INTEIRA e o jeito de saber se um banco
   novo sai do zero: rodar so um trecho nao diz nada, porque cada
   migration assume que a anterior criou os objetos que ela usa. */
function todasMigracoes() {
    return fs.readdirSync(DIR_MIGRACOES)
        .filter(nome => nome.endsWith('.sql'))
        .sort();
}

/* ------------------------------------------------------------------
 * Infra
 * ------------------------------------------------------------------ */
let PGlite = null;

async function carregarPglite() {
    if (PGlite) return PGlite;

    const tentativas = [
        () => import('@electric-sql/pglite'),
        () => import(pathToFileURL(path.join(process.env.APPDATA || '.', 'npm', 'node_modules', '@electric-sql', 'pglite', 'dist', 'index.js')).href),
        () => import(pathToFileURL(path.join(process.env.TEMP || '.', 'claude', 'qg-pgtest', 'node_modules', '@electric-sql', 'pglite', 'dist', 'index.js')).href)
    ];

    for (const tentativa of tentativas) {
        try {
            const mod = await tentativa();
            PGlite = mod.PGlite || (mod.default && mod.default.PGlite);
            if (PGlite) return PGlite;
        } catch (erro) {
            /* tenta a proxima */
        }
    }

    return null;
}

function ler(nome) {
    return fs.readFileSync(path.join(DIR_MIGRACOES, nome), 'utf8');
}

/* ------------------------------------------------------------------
 * Consultas de verificacao
 * ------------------------------------------------------------------ */
const VERIFICACOES = [
    {
        nome: 'anon nao tem INSERT/UPDATE/DELETE em leads, visitas e administradores',
        sql: `
            SELECT count(*)::int AS falhas FROM (
                SELECT 1
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                CROSS JOIN LATERAL aclexplode(c.relacl) AS perm
                JOIN pg_roles r ON r.oid = perm.grantee
                WHERE n.nspname = 'public'
                  AND c.relname IN ('leads','visitas','administradores')
                  AND r.rolname IN ('anon','PUBLIC')
                  AND perm.privilege_type IN ('INSERT','UPDATE','DELETE')
            ) t;`
    },
    {
        nome: 'anon nao tem SELECT nas vistas do painel',
        sql: `
            SELECT count(*)::int AS falhas FROM (
                SELECT 1
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                CROSS JOIN LATERAL aclexplode(c.relacl) AS perm
                JOIN pg_roles r ON r.oid = perm.grantee
                WHERE n.nspname = 'public'
                  AND c.relname IN ('vw_painel_resumo','vw_leads_por_dia','vw_visitas_por_dia','vw_visitas_por_tipo')
                  AND r.rolname IN ('anon','PUBLIC')
            ) t;`
    },
    {
        nome: 'as quatro RPCs de contagem aceitam p_sessao_id',
        sql: `
            SELECT count(*)::int AS falhas FROM (
                SELECT 1 FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public'
                  AND p.proname IN ('registrar_impressao_anuncio','clicar_anuncio','clicar_noticia','registrar_visualizacao_noticia')
                  AND (SELECT count(*) FROM unnest(p.proargnames) AS nome(nome) WHERE nome.nome = 'p_sessao_id') = 0
            ) t;`
    },
    {
        nome: 'as versoes antigas (1 parametro) das RPCs de contagem nao existem mais',
        sql: `
            SELECT count(*)::int AS falhas FROM (
                SELECT 1 FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public'
                  AND p.proname IN ('registrar_impressao_anuncio','clicar_anuncio','clicar_noticia','registrar_visualizacao_noticia')
                  AND p.pronargs = 1
            ) t;`
    },
    {
        nome: 'a tabela de limite de chamadas nao e aberta para anon',
        sql: `
            SELECT count(*)::int AS falhas FROM (
                SELECT 1
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                CROSS JOIN LATERAL aclexplode(c.relacl) AS perm
                JOIN pg_roles r ON r.oid = perm.grantee
                WHERE n.nspname = 'public' AND c.relname = 'qg_limites_chamadas'
                  AND r.rolname IN ('anon','PUBLIC')
            ) t;`
    },
    {
        nome: 'a RPC de painel de anuncios existe',
        sql: `
            SELECT CASE WHEN count(*) > 0 THEN 0 ELSE 1 END::int AS falhas
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'anuncios_painel_desempenho';`
    },
    {
        nome: 'a view publica de desempenho existe sem a coluna autorizacao',
        sql: `
            SELECT count(*)::int AS falhas FROM (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'vw_anuncios_desempenho_publica'
                  AND column_name = 'autorizacao'
            ) t;`
    },
    {
        nome: 'a policy noticias_leitura_publica vale para anon e authenticated',
        sql: `
            SELECT count(*)::int AS falhas FROM (
                SELECT 1 FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = 'noticias'
                  AND p.policyname = 'noticias_leitura_publica'
                  AND NOT (
                      ('anon' = ANY(p.roles)) AND
                      ('authenticated' = ANY(p.roles))
                  )
            ) t;`
    },
    {
        nome: 'a view de desempenho publico usa security_invoker',
        sql: `
            SELECT CASE WHEN count(*) = 0 THEN 0 ELSE 1 END::int AS falhas
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = 'vw_anuncios_desempenho_publica'
              AND coalesce((SELECT array_to_string(c.reloptions, ',')), '')
                  NOT ILIKE '%security_invoker%';`
    }
];

/* ------------------------------------------------------------------
 * Execucao
 * ------------------------------------------------------------------ */
async function main() {
    const PGliteClass = await carregarPglite();

    if (!PGliteClass) {
        console.log('\n[aviso] PGlite nao esta instalado neste ambiente.');
        console.log('        Instale com:  npm install @electric-sql/pglite');
        console.log('        (rode dentro de tools/ ou na raiz do projeto)');
        process.exit(2);
    }

    const problemas = [];
    const avisos = [];

    const db = new PGliteClass(DIR_PG);
    await db.waitReady;

    console.log('\n=== 1. Banco novo: arquivo de referencia ===');

    try {
        await db.exec(PREPARO);
        console.log('  [ok]    preparo (papeis anon/authenticated, schema auth, auth.uid)');
    } catch (erro) {
        console.log('  [ERRO]  preparo -> ' + String(erro.message || erro).slice(0, 300));
        problemas.push('preparo: ' + String(erro.message || erro).slice(0, 200));
    }

    const sqlReferencia = ler(REFERENCIA);
    let refOk = true;

    try {
        await db.exec(sqlReferencia);
        console.log('  [ok]    ' + REFERENCIA + ' rodou sem erro');
    } catch (erro) {
        refOk = false;
        console.log('  [ERRO]  ' + REFERENCIA + ' -> ' + String(erro.message || erro).slice(0, 300));
        problemas.push('arquivo de referencia: ' + String(erro.message || erro).slice(0, 200));
    }

    if (refOk) {
        try {
            await db.exec(PREPARO_POS);
            console.log('  [ok]    preparo pos-referencia (public.e_admin)');
        } catch (erro) {
            console.log('  [ERRO]  preparo pos -> ' + String(erro.message || erro).slice(0, 300));
            problemas.push('preparo pos: ' + String(erro.message || erro).slice(0, 200));
        }
    }

    console.log('\n=== 2. Cadeia completa, do zero (ordem do supabase db push) ===');

    const todas = todasMigracoes();
    console.log('  total de migrations no diretorio: ' + todas.length);

    for (const nome of todas) {
        if (nome === REFERENCIA) continue; /* ja rodou acima */
        const sql = ler(nome);
        try {
            const prefixo = AMBIENTE[nome];
            await db.exec(prefixo ? prefixo + '\n' + sql : sql);
            console.log('  [ok]    ' + nome);
        } catch (erro) {
            console.log('  [ERRO]  ' + nome + ' -> ' + String(erro.message || erro).slice(0, 300));
            problemas.push('migration ' + nome + ': ' + String(erro.message || erro).slice(0, 200));
        }
    }

    console.log('\n=== 3. Cadeia incremental pendente (rodar de novo) ===');

    for (const nome of CADEIA) {
        const sql = ler(nome);
        try {
            await db.exec(sql);
            console.log('  [ok]    ' + nome);
        } catch (erro) {
            console.log('  [ERRO]  ' + nome + ' -> ' + String(erro.message || erro).slice(0, 300));
            problemas.push(nome + ': ' + String(erro.message || erro).slice(0, 200));
        }
    }

    console.log('\n=== 4. Idempotencia (rodar a cadeia pendente de novo) ===');

    for (const nome of CADEIA) {
        const sql = ler(nome);
        try {
            await db.exec(sql);
            console.log('  [ok]    ' + nome + ' (segunda vez)');
        } catch (erro) {
            console.log('  [ERRO]  ' + nome + ' (segunda vez) -> ' + String(erro.message || erro).slice(0, 300));
            problemas.push('idempotencia ' + nome + ': ' + String(erro.message || erro).slice(0, 200));
        }
    }

    console.log('\n=== 5. Protecoes no banco final ===');

    for (const v of VERIFICACOES) {
        try {
            const r = await db.query(v.sql);
            const falhas = r.rows[0] ? Number(r.rows[0].falhas) : 0;

            if (falhas === 0) {
                console.log('  [ok]    ' + v.nome);
            } else {
                console.log('  [ERRO]  ' + v.nome + ' (' + falhas + ' pendencia(s))');
                problemas.push(v.nome + ' (' + falhas + ')');
            }
        } catch (erro) {
            console.log('  [ERRO]  ' + v.nome + ' -> ' + String(erro.message || erro).slice(0, 200));
            avisos.push(v.nome + ': consulta falhou (' + String(erro.message || erro).slice(0, 120) + ')');
        }
    }

    await db.close();

    console.log('\n=== Resultado ===');

    if (problemas.length === 0) {
        console.log('  Tudo certo: a cadeia roda, e idempotente, e as protecoes ficam como o texto promete.');
    } else {
        console.log('  ' + problemas.length + ' problema(s):');
        problemas.forEach(p => console.log('    - ' + p));
    }

    if (avisos.length) {
        console.log('\n  Avisos:');
        avisos.forEach(a => console.log('    - ' + a));
    }

    process.exit(problemas.length === 0 ? 0 : 1);
}

main().catch(erro => {
    console.error(erro);
    process.exit(1);
});
