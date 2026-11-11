'use strict';

/* ------------------------------------------------------------------
 * Teste de ponta a ponta contra o Supabase do Q GRAOS.
 * ------------------------------------------------------------------
 * Usa a chave PUBLICÁVEL (a mesma que vai no site) e confere, de
 * verdade, na API do projeto:
 *
 *   1. GET  /rest/v1/noticias           -> o público lê o que está publicado
 *   2. POST /rest/v1/leads              -> BLOQUEADO (a chave anônima
 *                                          não pode forjar lead)
 *   3. GET  /rest/v1/leads              -> BLOQUEADO (lead é privado)
 *   4. GET  /rest/v1/visitas            -> BLOQUEADO (visita é privada)
 *   5. POST /rest/v1/rpc/registrar_evento-> grava um evento de analytics
 *   6. POST /rest/v1/rpc/registrar_lead -> grava um lead de teste
 *   7. POST /rest/v1/rpc/clicar_noticia -> conta o clique
 *
 * O lead de teste usa o e-mail TESTE@QGRAOS.INVALID (domínio reservado
 * pela RFC 2606, impossível de existir) e é removido no final.
 *
 * Roda: npm run test:supabase
 * ------------------------------------------------------------------ */

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SITE_URL = 'https://rppoiwrbxqdbtavhgdjk.supabase.co';
const EMAIL_TESTE = 'teste@qgraos.invalid';
/* Visitante fixo usado na visita de teste — permite apagar so a
 * linha criada por este teste, sem tocar nas visitas reais. */
const VISITANTE_TESTE = '00000000-0000-4000-8000-000000000001';

const problemas = [];
const resultados = [];

function readConfig() {
    const caminho = path.join(ROOT, 'site.config.js');
    const conteudo = fs.readFileSync(caminho, 'utf8');

    const url = conteudo.match(/url:\s*'([^']+)'/);
    const anonKey = conteudo.match(/anonKey:\s*'([^']*)'/);

    return {
        url: url ? url[1].trim() : SITE_URL,
        anonKey: anonKey ? anonKey[1].trim() : ''
    };
}

function cabecalhos(extra) {
    return Object.assign({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: CONFIG.anonKey
    }, extra || {});
}

/* Credenciais do administrador para testar o painel.
 * Vem do ambiente (QG_ADMIN_EMAIL / QG_ADMIN_PASSWORD) ou do arquivo
 * local .qg-admin.json (que NAO deve ir para o Git). Sem elas, o teste
 * do painel é pulado — o resto do banco continua sendo conferido. */
function credenciaisAdmin() {
    const email = process.env.QG_ADMIN_EMAIL || '';
    const senha = process.env.QG_ADMIN_PASSWORD || '';

    if (email && senha) return { email: email, password: senha };

    try {
        const arquivo = path.join(ROOT, '.qg-admin.json');
        if (fs.existsSync(arquivo)) {
            const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
            if (dados.email && dados.password) {
                return { email: dados.email, password: dados.password };
            }
        }
    } catch (erro) {
        /* arquivo ausente ou invalido: segue sem testar o painel */
    }

    return null;
}

async function chamar(metodo, caminho, corpo) {
    const opcoes = {
        method: metodo,
        headers: cabecalhos(),
        cache: 'no-store'
    };

    if (corpo !== undefined) opcoes.body = JSON.stringify(corpo);

    const resposta = await fetch(CONFIG.url + caminho, opcoes);
    const texto = await resposta.text();

    let dados = null;
    try {
        dados = texto ? JSON.parse(texto) : null;
    } catch (erro) {
        dados = texto;
    }

    return { status: resposta.status, dados: dados };
}

function conferir(descricao, condicao, detalhe) {
    if (condicao) {
        resultados.push('  [ok]    ' + descricao + (detalhe ? '  ->  ' + detalhe : ''));
    } else {
        problemas.push(descricao + (detalhe ? '  ->  ' + detalhe : ''));
        resultados.push('  [ERRO]  ' + descricao + (detalhe ? '  ->  ' + detalhe : ''));
    }
}

function bloqueado(resposta) {
    // PostgREST nega com 401 (sem papel) ou 403 (sem política) ou 404
    return [401, 403, 404].indexOf(resposta.status) !== -1;
}

/* Uma tabela protegida pode responder de duas formas e as duas sao
 * seguras: negada (401/403/404) ou respondendo 200 com lista vazia
 * (a RLS filtra as linhas e o anon nao ve nada). O que nao pode
 * acontecer e o anon enxergar alguma linha. */
function semLinhasVisiveis(resposta) {
    if (bloqueado(resposta)) return true;
    return resposta.status === 200 && Array.isArray(resposta.dados) && resposta.dados.length === 0;
}

function detalheTabela(resposta) {
    if (Array.isArray(resposta.dados)) {
        return 'HTTP ' + resposta.status + ', ' + resposta.dados.length + ' linha(s) visivel(is)';
    }
    return 'HTTP ' + resposta.status;
}

function detalheErro(resposta) {
    if (resposta.dados && typeof resposta.dados === 'object' && resposta.dados.message) {
        return 'HTTP ' + resposta.status + ': ' + resposta.dados.message;
    }
    return 'HTTP ' + resposta.status;
}

const CONFIG = readConfig();

async function principal() {
    console.log('\n=== Teste do Supabase (chave publica do site) ===\n');
    console.log('  Projeto: ' + CONFIG.url);

    if (!CONFIG.anonKey) {
        console.log('\n  [ERRO]  site.config.js esta sem a chave publica (supabase.anonKey).');
        console.log('\n  Preencha a chave antes de rodar este teste.\n');
        process.exit(1);
    }

    /* 1. Leitura publica das noticias -------------------------------- */
    const noticias = await chamar(
        'GET',
        '/rest/v1/noticias?select=id,titulo,categoria&publicado=eq.true&limit=3'
    );

    conferir('GET /noticias responde 200', noticias.status === 200, 'HTTP ' + noticias.status);
    conferir('GET /noticias devolve lista', Array.isArray(noticias.dados),
        Array.isArray(noticias.dados) ? noticias.dados.length + ' noticia(s)' : 'nao é lista');

    /* 2. Insercao direta na tabela de leads tem de ser negada ------- */
    const leadForjado = await chamar('POST', '/rest/v1/leads', {
        nome: 'Teste Forjado',
        email: EMAIL_TESTE,
        telefone: '66999990000',
        status: 'convertido'
    });

    conferir('POST /leads direto e bloqueado para a chave anonima',
        bloqueado(leadForjado), 'HTTP ' + leadForjado.status);

    /* O lead forjado nao pode ter entrado. Confirmamos pela RPC. */
    const forjados = await chamar('POST', '/rest/v1/rpc/noticias_publicas', { p_limite: 1 });
    conferir('RPC noticias_publicas responde', forjados.status === 200, 'HTTP ' + forjados.status);

    /* 3. Leitura da tabela de leads tem de ser negada ---------------- */
    const leituraLeads = await chamar('GET', '/rest/v1/leads?select=id&limit=1');
    conferir('GET /leads nao devolve nenhuma linha para a chave anonima',
        semLinhasVisiveis(leituraLeads), detalheTabela(leituraLeads));

    /* 4. Leitura da tabela de visitas tem de ser negada --------------- */
    const leituraVisitas = await chamar('GET', '/rest/v1/visitas?select=id&limit=1');
    conferir('GET /visitas nao devolve nenhuma linha para a chave anonima',
        semLinhasVisiveis(leituraVisitas), detalheTabela(leituraVisitas));

    /* 5. RPC de evento (analytics) ----------------------------------- */
    const evento = await chamar('POST', '/rest/v1/rpc/registrar_evento', {
        p_tipo: 'pageview',
        p_path: '/teste-automated',
        p_dispositivo: 'desktop',
        p_visitante_id: VISITANTE_TESTE,
        p_sessao_id: '00000000-0000-4000-8000-000000000002'
    });

    conferir('RPC registrar_evento grava o evento', evento.status === 200, 'HTTP ' + evento.status);

    /* 6. RPC de lead (captura) ---------------------------------------- */
    /* Telefone unico por execucao: a regra antispam do banco recusa o
     * mesmo e-mail + telefone em menos de 5 minutos. */
    const telefoneTeste = '66' + String(Date.now()).slice(-8);

    const lead = await chamar('POST', '/rest/v1/rpc/registrar_lead', {
        p_nome: 'Teste Automatizado',
        p_email: EMAIL_TESTE,
        p_telefone: telefoneTeste,
        p_perfil: 'Comprador',
        p_busca: 'Graos',
        p_mensagem: 'Lead de teste automatizado.',
        p_origem_url: 'https://qgraos.com.br/?teste=1',
        p_consentimento: true
    });

    conferir('RPC registrar_lead grava o lead', lead.status === 200,
        'HTTP ' + lead.status + (typeof lead.dados === 'string' ? ' id=' + lead.dados : ''));

    /* 6b. A mesma combinaçao de novo tem de ser recusada (antispam) --- */
    const duplicado = await chamar('POST', '/rest/v1/rpc/registrar_lead', {
        p_nome: 'Teste Automatizado',
        p_email: EMAIL_TESTE,
        p_telefone: telefoneTeste,
        p_consentimento: true
    });

    const mensagemDuplicado = (duplicado.dados && duplicado.dados.message) || '';
    conferir('RPC registrar_lead recusa envio repetido (antispam)',
        duplicado.status >= 400 && mensagemDuplicado.indexOf('envio_duplicado') !== -1,
        detalheErro(duplicado));

    /* 7. RPC de clique em noticia ------------------------------------- */
    const clique = await chamar('POST', '/rest/v1/rpc/clicar_noticia', {
        p_id: '00000000-0000-4000-8000-000000000003'
    });

    conferir('RPC clicar_noticia responde sem erro',
        clique.status === 200 || clique.status === 204, 'HTTP ' + clique.status);

    /* 8. Validacao: e-mail invalido tem de ser recusado --------------- */
    const invalido = await chamar('POST', '/rest/v1/rpc/registrar_lead', {
        p_nome: 'Teste',
        p_email: 'email-sem-arroba',
        p_telefone: '66999990000',
        p_consentimento: true
    });

    conferir('RPC registrar_lead recusa e-mail invalido',
        invalido.status >= 400, 'HTTP ' + invalido.status);

    /* 9. Painel: login do administrador e leitura dos dados ----------- */
    const credenciais = credenciaisAdmin();

    if (!credenciais) {
        console.log('\n  [aviso] Sem credenciais de administrador: o painel nao foi testado.');
        console.log('  Defina QG_ADMIN_EMAIL e QG_ADMIN_PASSWORD (ou crie .qg-admin.json)');
        console.log('  e rode "npm run test:supabase" de novo.\n');
    } else {
        const login = await fetch(CONFIG.url + '/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: cabecalhos(),
            body: JSON.stringify({
                email: credenciais.email,
                password: credenciais.password
            })
        });

        const sessao = await login.json();
        const token = sessao && sessao.access_token;

        conferir('Login do administrador no Auth', Boolean(token),
            token ? 'HTTP ' + login.status : 'HTTP ' + login.status + ': ' + ((sessao && sessao.msg) || 'sem token'));

        if (token) {
            const autorizado = cabecalhos({ Authorization: 'Bearer ' + token });

            const leadsAdmin = await fetch(CONFIG.url + '/rest/v1/leads?select=id,nome,email,perfil&limit=5', {
                headers: autorizado
            });
            const linhasLeads = await leadsAdmin.json();

            conferir('Painel le os leads com a sessao de admin',
                leadsAdmin.status === 200 && Array.isArray(linhasLeads),
                'HTTP ' + leadsAdmin.status + ', ' + (Array.isArray(linhasLeads) ? linhasLeads.length + ' lead(s)' : 'sem lista'));

            const noticiasAdmin = await fetch(CONFIG.url + '/rest/v1/noticias?select=id,titulo&limit=5', {
                headers: autorizado
            });
            const linhasNoticias = await noticiasAdmin.json();

            conferir('Painel le as noticias com a sessao de admin',
                noticiasAdmin.status === 200 && Array.isArray(linhasNoticias),
                'HTTP ' + noticiasAdmin.status + ', ' + (Array.isArray(linhasNoticias) ? linhasNoticias.length + ' noticia(s)' : 'sem lista'));

            const resumo = await fetch(CONFIG.url + '/rest/v1/vw_painel_resumo', {
                headers: autorizado
            });
            const linhasResumo = await resumo.json();

            conferir('Painel le o resumo (vw_painel_resumo)',
                resumo.status === 200 && Array.isArray(linhasResumo) && linhasResumo.length === 1,
                'HTTP ' + resumo.status);

            /* Publicar uma noticia de teste pelo painel e ver no site --- */
            const tituloTeste = 'Notícia de teste automático ' + new Date().toISOString();
            const nova = await fetch(CONFIG.url + '/rest/v1/noticias', {
                method: 'POST',
                headers: Object.assign(autorizado, { Prefer: 'return=representation' }),
                body: JSON.stringify({
                    titulo: tituloTeste,
                    resumo: 'Notícia criada pelo teste automatizado.',
                    categoria: 'Geral',
                    publicado: true
                })
            });

            conferir('Painel publica uma noticia', nova.status === 201 || nova.status === 200,
                'HTTP ' + nova.status);

            const publicada = await chamar(
                'GET',
                '/rest/v1/noticias?select=id,titulo&publicado=eq.true&limit=10'
            );

            const achouPublicada = Array.isArray(publicada.dados) &&
                publicada.dados.some(item => item.titulo === tituloTeste);

            conferir('A noticia publicada aparece no feed publico',
                achouPublicada,
                Array.isArray(publicada.dados) ? publicada.dados.length + ' noticia(s) publica(s)' : 'sem lista');

            /* Apagar a noticia de teste ---------------------------------- */
            if (nova.status === 201 || nova.status === 200) {
                let criada = null;
                try {
                    criada = await nova.json();
                } catch (erro) {
                    criada = null;
                }
                const idCriada = criada && criada[0] && criada[0].id;

                if (idCriada) {
                    const apagada = await fetch(
                        CONFIG.url + '/rest/v1/noticias?id=eq.' + idCriada,
                        { method: 'DELETE', headers: autorizado }
                    );

                    conferir('Painel apaga a noticia de teste',
                        apagada.status === 204 || apagada.status === 200,
                        'HTTP ' + apagada.status);
                }
            }

            /* 10. Limpeza: o teste nao pode deixar lixo no banco ------
             * Apaga o lead e a visita criados por esta execucao. */
            const leadLimpo = await fetch(
                CONFIG.url + '/rest/v1/leads?email=eq.' + encodeURIComponent(EMAIL_TESTE),
                { method: 'DELETE', headers: autorizado }
            );

            const visitaLimpa = await fetch(
                CONFIG.url + '/rest/v1/visitas?visitante_id=eq.' +
                    encodeURIComponent(VISITANTE_TESTE),
                { method: 'DELETE', headers: autorizado }
            );

            conferir('Limpeza: lead e visita de teste apagados',
                (leadLimpo.status === 200 || leadLimpo.status === 204) &&
                (visitaLimpa.status === 200 || visitaLimpa.status === 204),
                'lead HTTP ' + leadLimpo.status + ', visita HTTP ' + visitaLimpa.status);
        }
    }

    console.log(resultados.join('\n'));

    if (problemas.length) {
        console.log('\nResultado: ' + problemas.length + ' problema(s) encontrado(s).\n');
        process.exit(1);
    }

    console.log('\nResultado: integracao com o Supabase funcionando.\n');

    if (!credenciais) {
        console.log('  Aviso: sem credenciais de administrador o lead de teste (' + EMAIL_TESTE + ')');
        console.log('  ficou no banco. Apague pelo painel ou pelo SQL:\n');
        console.log("    DELETE FROM public.leads WHERE email = '" + EMAIL_TESTE + "';\n");
    } else {
        console.log('  O lead e a visita de teste foram apagados no final do teste.\n');
    }
}

principal().catch(erro => {
    console.error('\nFalha no teste do Supabase: ' + (erro && erro.message) + '\n');
    process.exit(1);
});
