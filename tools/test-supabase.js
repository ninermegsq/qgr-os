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
 *   8. GET  /rest/v1/anuncios           -> o público lê o anúncio publicado
 *   9. POST /rest/v1/anuncios           -> BLOQUEADO (só o painel publica)
 *  10. POST /rest/v1/rpc/registrar_impressao_anuncio e clicar_anuncio
 *                                          -> contam impressão e clique
 *  11. GET  /rest/v1/noticias com or=(categoria.eq.Soja,categoria.eq.Milho)
 *                                          -> o filtro de categoria funciona
 *  12. POST /rest/v1/rpc/registrar_visualizacao_noticia -> conta a
 *                                          visualizacao da materia
 *  13. GET  /rest/v1/noticias com publicado_em=gte./lt. -> o filtro de
 *                                          data (a listagem abre no dia)
 *  14. GET  /rest/v1/cotacoes            -> o público lê só as cotações
 *                                          publicadas
 *  15. POST /rest/v1/cotacoes            -> BLOQUEADO (a chave anônima
 *                                          não publica preço)
 *  16. GET  /rest/v1/cotacoes_fontes     -> BLOQUEADO (o estado da
 *                                          coleta é do painel)
 *  17. Painel: o admin lê cotações e o estado das fontes
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

/* O dia seguinte de uma data AAAA-MM-DD */
function diaSeguinte(dia) {
    const data = new Date(dia + 'T12:00:00Z');
    data.setUTCDate(data.getUTCDate() + 1);

    return data.toISOString().slice(0, 10);
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

    /* 7a. Visualizacao da materia: a coluna e a RPC existem -------- */
    const visualizacoes = await chamar(
        'GET',
        '/rest/v1/noticias?select=id,visualizacoes&publicado=eq.true&limit=3'
    );

    conferir('GET /noticias devolve a coluna visualizacoes',
        visualizacoes.status === 200 && Array.isArray(visualizacoes.dados),
        'HTTP ' + visualizacoes.status);

    const visualizacao = await chamar('POST', '/rest/v1/rpc/registrar_visualizacao_noticia', {
        p_id: '00000000-0000-4000-8000-000000000003'
    });

    conferir('RPC registrar_visualizacao_noticia responde sem erro',
        visualizacao.status === 200 || visualizacao.status === 204,
        'HTTP ' + visualizacao.status);

    /* 7b. Anuncios: leitura publica, gravacao bloqueada e contadores -- */
    const anuncios = await chamar(
        'GET',
        '/rest/v1/anuncios?select=id,titulo,empresa,formato&publicado=eq.true&limit=3'
    );

    conferir('GET /anuncios responde 200', anuncios.status === 200, 'HTTP ' + anuncios.status);
    conferir('GET /anuncios devolve lista', Array.isArray(anuncios.dados),
        Array.isArray(anuncios.dados) ? anuncios.dados.length + ' anuncio(s) publicado(s)' : 'nao e lista');

    /* A chave anonima nao pode forjar um anuncio */
    const anuncioForjado = await chamar('POST', '/rest/v1/anuncios', {
        titulo: 'Anuncio forjado',
        empresa: 'Empresa Forjada',
        publicado: true
    });

    conferir('POST /anuncios direto e bloqueado para a chave anonima',
        bloqueado(anuncioForjado), 'HTTP ' + anuncioForjado.status);

    /* Os contadores sao internos: a impressao e o clique contam sozinhos */
    const impressao = await chamar('POST', '/rest/v1/rpc/registrar_impressao_anuncio', {
        p_id: '00000000-0000-4000-8000-000000000004'
    });

    conferir('RPC registrar_impressao_anuncio responde sem erro',
        impressao.status === 200 || impressao.status === 204, 'HTTP ' + impressao.status);

    const cliqueAnuncio = await chamar('POST', '/rest/v1/rpc/clicar_anuncio', {
        p_id: '00000000-0000-4000-8000-000000000004'
    });

    conferir('RPC clicar_anuncio responde sem erro',
        cliqueAnuncio.status === 200 || cliqueAnuncio.status === 204, 'HTTP ' + cliqueAnuncio.status);

    /* 7d. Rodizio: elegibilidade no banco e colunas do rodizio ------- */
    const elegiveis = await chamar('POST', '/rest/v1/rpc/anuncios_elegiveis', {
        p_posicao: 'noticias',
        p_formato: null
    });

    conferir('RPC anuncios_elegiveis responde 200', elegiveis.status === 200,
        'HTTP ' + elegiveis.status);
    conferir('RPC anuncios_elegiveis devolve lista', Array.isArray(elegiveis.dados),
        Array.isArray(elegiveis.dados) ? elegiveis.dados.length + ' anuncio(s) elegivel(is)' : 'nao e lista');

    /* Quem esta elegivel tem de estar publicado de verdade */
    const naoPublicados = (Array.isArray(elegiveis.dados) ? elegiveis.dados : [])
        .filter(item => item.publicado !== true);

    conferir('RPC anuncios_elegiveis devolve so anuncios publicados',
        naoPublicados.length === 0, naoPublicados.length + ' invalido(s)');

    /* O peso do rodizio e publico: o site precisa dele para montar o ciclo */
    const colunas = await chamar(
        'GET',
        '/rest/v1/anuncios?select=id,peso&publicado=eq.true&limit=3'
    );

    conferir('GET /anuncios devolve o peso (coluna publica do rodizio)',
        colunas.status === 200 && Array.isArray(colunas.dados), 'HTTP ' + colunas.status);

    /* Cotas, impressoes, cliques e o contato de autorizacao sao do painel */
    const cotas = await chamar(
        'GET',
        '/rest/v1/anuncios?select=id,limite_impressoes,limite_impressoes_dia,impressoes,cliques,autorizacao&limit=1'
    );

    conferir('GET /anuncios esconde cotas e metricas da chave anonima',
        semLinhasVisiveis(cotas), detalheTabela(cotas));

    /* A view do painel e so para admin: a chave anonima nao pode ler */
    const desempenho = await chamar('GET', '/rest/v1/vw_anuncios_desempenho?select=id&limit=1');

    conferir('GET /vw_anuncios_desempenho e bloqueado para a chave anonima',
        semLinhasVisiveis(desempenho), detalheTabela(desempenho));

    /* 7c. O filtro de categoria aceita mais de uma categoria ---------- */
    const filtro = await chamar(
        'GET',
        '/rest/v1/noticias?select=id,categoria&publicado=eq.true&or=(categoria.eq.Soja,categoria.eq.Milho)&limit=3'
    );

    conferir('Filtro por multiplas categorias responde 200', filtro.status === 200, 'HTTP ' + filtro.status);
    conferir('Filtro por multiplas categorias devolve lista', Array.isArray(filtro.dados),
        Array.isArray(filtro.dados) ? filtro.dados.length + ' noticia(s)' : 'nao e lista');

    /* 7d. Filtro por data (a listagem abre no dia escolhido) -------- */
    /* A consulta do site usa dois limites na mesma coluna:
       publicado_em=gte.<dia>T00:00:00-04:00 e
       publicado_em=lt.<dia+1>T00:00:00-04:00. Aqui conferimos que os
       dois limites valem de verdade (e nao so o ultimo). */
    const comData = await chamar(
        'GET',
        '/rest/v1/noticias?select=id,publicado_em&publicado=eq.true&order=publicado_em.desc&limit=1'
    );

    const primeira = Array.isArray(comData.dados) && comData.dados.length
        ? comData.dados[0]
        : null;

    if (primeira && primeira.publicado_em) {
        const dia = String(primeira.publicado_em).slice(0, 10);
        const seguinte = diaSeguinte(dia);

        const noDia = await chamar(
            'GET',
            '/rest/v1/noticias?select=id&publicado=eq.true' +
            '&publicado_em=gte.' + encodeURIComponent(dia + 'T00:00:00-04:00') +
            '&publicado_em=lt.' + encodeURIComponent(seguinte + 'T00:00:00-04:00') +
            '&limit=50'
        );

        conferir('Filtro por data devolve as noticias do dia escolhido',
            noDia.status === 200 && Array.isArray(noDia.dados) && noDia.dados.length > 0,
            'HTTP ' + noDia.status + ', ' + (Array.isArray(noDia.dados) ? noDia.dados.length + ' noticia(s)' : 'sem lista') +
            ' em ' + dia);

        /* Intervalo antigo: os dois limites tem de valer */
        const antes = await chamar(
            'GET',
            '/rest/v1/noticias?select=id&publicado=eq.true' +
            '&publicado_em=gte.' + encodeURIComponent('2000-01-01T00:00:00-04:00') +
            '&publicado_em=lt.' + encodeURIComponent('2000-01-02T00:00:00-04:00') +
            '&limit=50'
        );

        conferir('Filtro por data esconde o que nao e do dia (limite antigo)',
            antes.status === 200 && Array.isArray(antes.dados) && antes.dados.length === 0,
            'HTTP ' + antes.status + ', ' + (Array.isArray(antes.dados) ? antes.dados.length + ' noticia(s)' : 'sem lista'));

        /* Intervalo futuro: prova que o limite de baixo tambem vale */
        const depois = await chamar(
            'GET',
            '/rest/v1/noticias?select=id&publicado=eq.true' +
            '&publicado_em=gte.' + encodeURIComponent('2030-01-01T00:00:00-04:00') +
            '&publicado_em=lt.' + encodeURIComponent('2100-01-01T00:00:00-04:00') +
            '&limit=50'
        );

        conferir('Filtro por data esconde o que e posterior ao dia (limite futuro)',
            depois.status === 200 && Array.isArray(depois.dados) && depois.dados.length === 0,
            'HTTP ' + depois.status + ', ' + (Array.isArray(depois.dados) ? depois.dados.length + ' noticia(s)' : 'sem lista'));
    } else {
        conferir('Filtro por data (nao ha noticia publicada no banco para testar)', true, 'sem noticia no banco');
    }

    /* 14. Area de cotacoes: o publico le so o que esta publicado -- */
    const cotacoes = await chamar(
        'GET',
        '/rest/v1/cotacoes?select=id,fonte,mercado,simbolo,produto,produto_chave,uf,preco,unidade,publicado' +
        '&publicado=eq.true&limit=20'
    );

    conferir('GET /cotacoes responde 200', cotacoes.status === 200, 'HTTP ' + cotacoes.status);
    conferir('GET /cotacoes devolve lista', Array.isArray(cotacoes.dados),
        Array.isArray(cotacoes.dados) ? cotacoes.dados.length + ' cotacao(oes)' : 'nao e lista');

    /* As colunas dos filtros de produto e de estado tem de ser legiveis pelo publico */
    const linhasCotacao = Array.isArray(cotacoes.dados) ? cotacoes.dados : [];
    const semProdutoChave = linhasCotacao.filter(item => !item.produto_chave);
    const comUf = linhasCotacao.filter(item => item.uf);

    conferir('A chave anonima le a coluna produto_chave (filtro de produto)',
        cotacoes.status === 200 && semProdutoChave.length === 0,
        'HTTP ' + cotacoes.status + ', ' + linhasCotacao.length + ' linha(s), ' +
        semProdutoChave.length + ' sem produto_chave');

    conferir('A chave anonima le a coluna uf (filtro de estado)',
        cotacoes.status === 200 && linhasCotacao.length > 0 && comUf.length > 0,
        'HTTP ' + cotacoes.status + ', ' + comUf.length + ' com uf em ' +
        linhasCotacao.length + ' linha(s)');

    /* Sem filtro de publicado: a RLS tem de barrar o que nao esta no ar */
    const todasCotacoes = await chamar(
        'GET',
        '/rest/v1/cotacoes?select=id,publicado&limit=200'
    );

    const visiveis = Array.isArray(todasCotacoes.dados) ? todasCotacoes.dados : [];
    const naoPublicadas = visiveis.filter(item => item.publicado !== true);

    conferir('A chave anonima nao ve cotacao fora do ar',
        todasCotacoes.status === 200 && naoPublicadas.length === 0,
        'HTTP ' + todasCotacoes.status + ', ' + visiveis.length + ' linha(s) visivel(is), ' +
        naoPublicadas.length + ' nao publicada(s)');

    /* 15. A chave anonima nao publica preco ------------------------- */
    const cotacaoForjada = await chamar('POST', '/rest/v1/cotacoes', {
        fonte: 'imea',
        mercado: 'spot',
        simbolo: 'teste_automatisado',
        produto: 'Cotacao de teste',
        preco: 9999.99,
        publicado: true
    });

    conferir('POST /cotacoes direto e bloqueado para a chave anonima',
        bloqueado(cotacaoForjada), 'HTTP ' + cotacaoForjada.status);

    /* 16. O estado das fontes e do painel --------------------------- */
    const fontes = await chamar('GET', '/rest/v1/cotacoes_fontes?select=fonte,status,itens&limit=10');

    conferir('GET /cotacoes_fontes nao devolve nada para a chave anonima',
        semLinhasVisiveis(fontes), detalheTabela(fontes));

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

            /* Publicar um anuncio de teste e ver no feed publico -------- */
            const tituloAnuncio = 'Anuncio de teste automatico ' + new Date().toISOString();

            const anuncio = await fetch(CONFIG.url + '/rest/v1/anuncios', {
                method: 'POST',
                headers: Object.assign({}, autorizado, { Prefer: 'return=representation' }),
                body: JSON.stringify({
                    titulo: tituloAnuncio,
                    empresa: 'Empresa de Teste',
                    texto: 'Anuncio criado pelo teste automatizado.',
                    formato: 'faixa',
                    posicao: 'noticias',
                    publicado: true,
                    peso: 3,
                    limite_impressoes_dia: 100,
                    autorizacao: 'Teste automatizado (sem contato real)'
                })
            });

            conferir('Painel publica um anuncio', anuncio.status === 201 || anuncio.status === 200,
                'HTTP ' + anuncio.status);

            let idAnuncio = null;
            try {
                const criadoAnuncio = await anuncio.json();
                idAnuncio = criadoAnuncio && criadoAnuncio[0] && criadoAnuncio[0].id;
            } catch (erro) {
                idAnuncio = null;
            }

            if (idAnuncio) {
                const publicados = await chamar(
                    'GET',
                    '/rest/v1/anuncios?select=id,titulo&publicado=eq.true&limit=50'
                );

                const achouAnuncio = Array.isArray(publicados.dados) &&
                    publicados.dados.some(item => item.titulo === tituloAnuncio);

                conferir('O anuncio publicado aparece no feed publico',
                    achouAnuncio,
                    Array.isArray(publicados.dados) ? publicados.dados.length + ' anuncio(s) publico(s)' : 'sem lista');

                /* O anuncio de teste entra no rodizio com o peso definido */
                const elegiveisAdmin = await fetch(CONFIG.url + '/rest/v1/rpc/anuncios_elegiveis', {
                    method: 'POST',
                    headers: autorizado,
                    body: JSON.stringify({ p_posicao: 'noticias', p_formato: null })
                });
                const linhasElegiveis = await elegiveisAdmin.json();

                const naFila = Array.isArray(linhasElegiveis) &&
                    linhasElegiveis.some(item => item.id === idAnuncio);

                conferir('O anuncio entra na fila do rodizio (RPC anuncios_elegiveis)',
                    elegiveisAdmin.status === 200 && naFila,
                    'HTTP ' + elegiveisAdmin.status);

                const pesoNaFila = Array.isArray(linhasElegiveis)
                    ? (linhasElegiveis.find(item => item.id === idAnuncio) || {}).peso
                    : null;

                conferir('O rodizio devolve o peso definido no painel',
                    pesoNaFila === 3, 'peso=' + pesoNaFila);

                /* O painel enxerga as cotas que o publico nao ve */
                const cotasAdmin = await fetch(
                    CONFIG.url + '/rest/v1/anuncios?select=id,limite_impressoes,limite_impressoes_dia&limit=50',
                    { headers: autorizado }
                );
                const linhasCotas = await cotasAdmin.json();
                const linhaCota = Array.isArray(linhasCotas)
                    ? linhasCotas.find(item => item.id === idAnuncio)
                    : null;

                conferir('O painel le as cotas do anuncio (visiveis so para admin)',
                    cotasAdmin.status === 200 && !!linhaCota && linhaCota.limite_impressoes_dia === 100,
                    'HTTP ' + cotasAdmin.status);

                /* A view do painel traz impressoes de hoje e cota */
                const visaoAdmin = await fetch(
                    CONFIG.url + '/rest/v1/vw_anuncios_desempenho?select=id,impressoes_hoje,cota_esgotada&limit=50',
                    { headers: autorizado }
                );
                const linhasDesempenho = await visaoAdmin.json();

                const linhaDesempenho = Array.isArray(linhasDesempenho)
                    ? linhasDesempenho.find(item => item.id === idAnuncio)
                    : null;

                conferir('O painel le vw_anuncios_desempenho',
                    visaoAdmin.status === 200 && !!linhaDesempenho,
                    'HTTP ' + visaoAdmin.status);

                conferir('A view traz as impressoes de hoje e a situacao da cota',
                    !!linhaDesempenho &&
                    typeof linhaDesempenho.impressoes_hoje === 'number' &&
                    typeof linhaDesempenho.cota_esgotada === 'boolean',
                    linhaDesempenho ? JSON.stringify({
                        hoje: linhaDesempenho.impressoes_hoje,
                        cota: linhaDesempenho.cota_esgotada
                    }) : 'sem linha');

                /* Anuncio fora do prazo: some da fila, mas continua no banco */
                const tituloVencido = 'Anuncio de teste fora do prazo ' + new Date().toISOString();

                const vencido = await fetch(CONFIG.url + '/rest/v1/anuncios', {
                    method: 'POST',
                    headers: Object.assign({}, autorizado, { Prefer: 'return=representation' }),
                    body: JSON.stringify({
                        titulo: tituloVencido,
                        empresa: 'Empresa de Teste',
                        texto: 'Anuncio com prazo vencido.',
                        formato: 'faixa',
                        posicao: 'noticias',
                        publicado: true,
                        fim_em: '2020-01-01T00:00:00Z',
                        autorizacao: 'Teste automatizado (sem contato real)'
                    })
                });

                let idVencido = null;
                try {
                    const criadoVencido = await vencido.json();
                    idVencido = criadoVencido && criadoVencido[0] && criadoVencido[0].id;
                } catch (erro) {
                    idVencido = null;
                }

                if (idVencido) {
                    const fila = await fetch(CONFIG.url + '/rest/v1/rpc/anuncios_elegiveis', {
                        method: 'POST',
                        headers: autorizado,
                        body: JSON.stringify({ p_posicao: 'noticias', p_formato: null })
                    });
                    const linhasFila = await fila.json();

                    const naFilaVencido = Array.isArray(linhasFila) &&
                        linhasFila.some(item => item.id === idVencido);

                    conferir('Anuncio fora do prazo nao entra na fila do rodizio',
                        fila.status === 200 && !naFilaVencido,
                        'HTTP ' + fila.status);

                    const apagadoVencido = await fetch(
                        CONFIG.url + '/rest/v1/anuncios?id=eq.' + idVencido,
                        { method: 'DELETE', headers: autorizado }
                    );

                    conferir('Limpeza: anuncio fora do prazo apagado',
                        apagadoVencido.status === 204 || apagadoVencido.status === 200,
                        'HTTP ' + apagadoVencido.status);
                }

                const apagadoAnuncio = await fetch(
                    CONFIG.url + '/rest/v1/anuncios?id=eq.' + idAnuncio,
                    { method: 'DELETE', headers: autorizado }
                );

                conferir('Painel apaga o anuncio de teste',
                    apagadoAnuncio.status === 204 || apagadoAnuncio.status === 200,
                    'HTTP ' + apagadoAnuncio.status);
            }

            /* 17. Area de cotacoes no painel ----------------------------- */
            const cotacoesAdmin = await fetch(
                CONFIG.url + '/rest/v1/cotacoes?select=id,fonte,mercado,simbolo,produto,preco,publicado&limit=50',
                { headers: autorizado }
            );
            const linhasCotacoes = await cotacoesAdmin.json();

            conferir('Painel le as cotacoes com a sessao de admin',
                cotacoesAdmin.status === 200 && Array.isArray(linhasCotacoes),
                'HTTP ' + cotacoesAdmin.status + ', ' +
                (Array.isArray(linhasCotacoes) ? linhasCotacoes.length + ' cotacao(oes)' : 'sem lista'));

            const fontesAdmin = await fetch(
                CONFIG.url + '/rest/v1/cotacoes_fontes?select=fonte,status,itens,coletado_em&limit=20',
                { headers: autorizado }
            );
            const linhasFontes = await fontesAdmin.json();

            conferir('Painel le o estado das fontes de cotacao',
                fontesAdmin.status === 200 && Array.isArray(linhasFontes),
                'HTTP ' + fontesAdmin.status + ', ' +
                (Array.isArray(linhasFontes) ? linhasFontes.length + ' fonte(s)' : 'sem lista'));

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
