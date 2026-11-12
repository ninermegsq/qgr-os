'use strict';

/* ------------------------------------------------------------------
 * Q GRAOS — coletor de cotações (IMEA + Grão Direto + Investing.com)
 * ------------------------------------------------------------------
 * O site é estático: ele nunca chama as APIs do mercado direto do
 * navegador (CORS e, no Investing.com, bloqueio de TLS). Por isso a
 * coleta acontece aqui, no servidor de quem publica, e o resultado
 * é gravado na tabela `public.cotacoes` do Supabase.
 *
 * O site lê essa tabela pela chave pública (só o que está publicado).
 * Se uma fonte falhar, o que já estava no ar continua no ar com o
 * horário dele: nada é estimado e nada é inventado.
 *
 * COMO RODAR
 *   node tools/coletar-cotacoes.js --dry-run   (só mostra, não grava)
 *   node tools/coletar-cotacoes.js             (coleta e grava)
 *   npm run cotacoes:coletar                   (o mesmo, pelo npm)
 *
 * CREDENCIAIS (necessárias para gravar; no --dry-run não são pedidas)
 *   QG_SUPABASE_SERVICE_ROLE  (preferida) chave service role do
 *                              Supabase: grava direto, sem depender
 *                              da senha do painel
 *   QG_ADMIN_EMAIL + QG_ADMIN_PASSWORD  (reserva: login no painel)
 *   ou um arquivo .qg-admin.json na raiz:  {"email":"...","password":"..."}
 *   (esse arquivo NÃO deve ir para o Git)
 *
 * AJUSTES (variáveis de ambiente, todas opcionais)
 *   QG_IMEA_BASE           base da API do IMEA
 *                          (padrão: https://api1.imea.com.br/api/v2/mobile)
 *   QG_IMEA_CADEIAS        ids de cadeia separados por vírgula (padrão 4,3,1)
 *   QG_GRAO_DIRETO_PRODUTOS  produtos: soy,corn,sorghum (padrão)
 *   QG_INVESTING_FONTES    caminho de um JSON com a lista de instrumentos
 *   QG_INVESTING_MODELO    modelo de URL do Investing (usa {id})
 *   QG_PYTHON              executavel do Python (padrão: python)
 *
 * OPÇÕES
 *   --dry-run             não grava nada, só mostra o que seria gravado
 *   --sql                 imprime o INSERT pronto para publicar no banco
 *                         (implica --dry-run)
 *   --somente=a,b         coleta só as fontes indicadas
 *   --manter-antigas      mantém no ar as cotações que sumiram da fonte
 *   --debug               mostra o pedaço cru da resposta de cada fonte
 * ------------------------------------------------------------------ */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

/* A regra de classificacao (produto e estado) e a mesma do site:
   classificacao-cotacoes.js. */
const classificacao = require('../classificacao-cotacoes.js');

const ROOT = path.join(__dirname, '..');

/* ---------- configuração ---------- */

const URL_PADRAO = 'https://rppoiwrbxqdbtavhgdjk.supabase.co';

const CONFIG = {
    url: URL_PADRAO,
    anonKey: '',

    /* Chave service role do Supabase (secret). Quando existe, o
       coletor grava direto, sem depender da senha do painel. */
    serviceRole: (process.env.QG_SUPABASE_SERVICE_ROLE || '').trim(),

    imeaBase: (process.env.QG_IMEA_BASE || 'https://api1.imea.com.br/api/v2/mobile')
        .replace(/\/+$/, ''),

    imeaCadeias: (process.env.QG_IMEA_CADEIAS || '4,3,1')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean),

    graoDiretoProdutos: (process.env.QG_GRAO_DIRETO_PRODUTOS || 'soy,corn,sorghum')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean),

    investingFontes: process.env.QG_INVESTING_FONTES ||
        path.join(__dirname, 'investing-fontes.json'),

    investingModelo: process.env.QG_INVESTING_MODELO ||
        'https://endpoints.investing.com/pd-instruments/v1/instruments/{id}',

    python: process.env.QG_PYTHON || 'python'
};

/* ---------- argumentos ---------- */

const ARGUMENTOS = process.argv.slice(2);

function temArgumento(nome) {
    return ARGUMENTOS.indexOf(nome) !== -1;
}

function valorArgumento(nome) {
    const achado = ARGUMENTOS.find(item => item.indexOf(nome + '=') === 0);
    return achado ? achado.slice(nome.length + 1) : '';
}

const DRY_RUN = temArgumento('--dry-run') || temArgumento('--sql');
const DEBUG = temArgumento('--debug');
const MANTER_ANTIGAS = temArgumento('--manter-antigas');

/* Trava de lote parcial: se a fonte responder com menos da metade do
   que ja esta publicado, nenhuma cotacao sai do ar. (Ajuste com
   QG_LOTE_PARCIAL: 0.5 = metade.) */
const FRAZAO_LOTE_PARCIAL = Number(process.env.QG_LOTE_PARCIAL || 0.5);
const SOMENTE = valorArgumento('--somente')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

function fonteAtiva(fonte) {
    return !SOMENTE.length || SOMENTE.indexOf(fonte) !== -1;
}

/* ---------- utilidades ---------- */

function lerConfigDoSite() {
    try {
        const conteudo = fs.readFileSync(path.join(ROOT, 'site.config.js'), 'utf8');
        const url = conteudo.match(/url:\s*'([^']+)'/);
        const anonKey = conteudo.match(/anonKey:\s*'([^']*)'/);

        if (url) CONFIG.url = url[1].trim();
        if (anonKey) CONFIG.anonKey = anonKey[1].trim();
    } catch (erro) {
        /* site.config.js ausente: segue com o padrão */
    }
}

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
        /* arquivo ausente ou inválido */
    }

    return null;
}

/* Texto sem acento, para comparar nomes */
function semAcento(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim();
}

/* Número do formato brasileiro ("1.234,56") ou com ponto decimal */
function numeroBR(texto) {
    if (texto === null || texto === undefined) return null;

    let limpo = String(texto).replace(/\s/g, '').replace(/[^\d,.\-+]/g, '');

    if (!limpo) return null;

    const temVirgula = limpo.indexOf(',') !== -1;
    const temPonto = limpo.indexOf('.') !== -1;

    if (temVirgula && temPonto) {
        // O ponto é separador de milhar; a vírgula é decimal.
        limpo = limpo.replace(/\./g, '').replace(',', '.');
    } else if (temVirgula) {
        limpo = limpo.replace(',', '.');
    } else if (temPonto) {
        const partes = limpo.split('.');
        // "1.234" com três casas depois do ponto é milhar, não decimal.
        if (partes.length === 2 && partes[1].length === 3 && partes[0].length <= 3 &&
            limpo.indexOf('-') === -1) {
            limpo = limpo.replace(/\./g, '');
        }
    }

    const numero = Number(limpo);
    return isNaN(numero) ? null : numero;
}

/* Arredonda para tirar o resto de ponto flutuante (4.486000000000001). */
function arredondar(valor, casas) {
    if (valor === null || valor === undefined) return null;

    const fator = Math.pow(10, casas || 4);

    return Math.round(valor * fator) / fator;
}

/* Preço que pode chegar como número (API) ou como texto ("1.234,56") */
function precoNumerico(valor) {
    if (typeof valor === 'number') return isFinite(valor) ? valor : null;

    return numeroBR(valor);
}

function primeiroValor(objeto, chaves) {
    for (let i = 0; i < chaves.length; i++) {
        const chave = chaves[i];
        if (objeto && objeto[chave] !== undefined && objeto[chave] !== null &&
            objeto[chave] !== '') {
            return objeto[chave];
        }
    }
    return null;
}

function textoValor(valor) {
    if (valor === null || valor === undefined) return '';
    if (typeof valor === 'object') return '';

    return String(valor).trim();
}

/* ---------- rede ---------- */

async function buscarTexto(url, cabecalhos) {
    const opcoes = {
        headers: Object.assign({
            'User-Agent': 'Mozilla/5.0 (compatible; QG-RAOS/1.0; +https://qgraos.com.br)',
            Accept: 'application/json, text/html, */*'
        }, cabecalhos || {}),
        redirect: 'follow'
    };

    const resposta = await fetch(url, opcoes);
    const texto = await resposta.text();

    return { status: resposta.status, texto: texto };
}

async function buscarJson(url, cabecalhos) {
    const resposta = await buscarTexto(url, cabecalhos);

    let dados = null;
    try {
        dados = JSON.parse(resposta.texto);
    } catch (erro) {
        dados = null;
    }

    return { status: resposta.status, dados: dados, texto: resposta.texto };
}

/* ------------------------------------------------------------------
 * IMEA
 * ------------------------------------------------------------------
 * A API mobile do IMEA devolve o histórico de cada cadeia (soja,
 * milho, algodão...). Cada registro tem:
 *
 *   { Localidade, Valor, Variacao, Safra, IndicadorFinalId, CadeiaId,
 *     DataPublicacao, TipoLocalidadeId, UnidadeSigla, UnidadeDescricao }
 *
 * A API não manda o nome do indicador: o que separa um do outro é o
 * par (IndicadorFinalId, Localidade, UnidadeSigla). Dentro de uma
 * cadeia existem preço médio por região, preço à vista por município,
 * preço até o porto e custo de produção (R$/ha, que não é cotação).
 *
 * O que o coletor faz, sem inventar nada:
 *   1. descarta custo de produção e registro sem preço;
 *   2. dentro de cada indicador, fica com a publicação mais recente;
 *   3. dentro de cada (praça, unidade), fica com a série mais recente
 *      — a mesma praça não aparece duas vezes com datas diferentes;
 *   4. usa o nome da cadeia (Soja, Milho, Algodão) como produto.
 * ------------------------------------------------------------------ */

function slug(texto) {
    return semAcento(texto)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

/* Unidades que são preço de grão. O IMEA também publica custo de
 * produção (R$/ha), que não é cotação de mercado. */
const UNIDADES_DE_PRECO = [
    'R$/sc', 'R$/bag', 'R$/t', 'R$/@', 'R$/kg',
    'US$/sc', 'US$/t', 'US$/@', 'US$/bu'
];

function ehUnidadeDePreco(unidade) {
    const sigla = String(unidade || '').trim();

    if (!sigla) return false;
    if (sigla.indexOf('/ha') !== -1) return false;

    return UNIDADES_DE_PRECO.indexOf(sigla) !== -1;
}

/* "2026-09-15 00:00:00" -> "2026-09-15" */
function diaDePublicacao(texto) {
    const achado = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(texto || ''));

    return achado ? achado[1] + '-' + achado[2] + '-' + achado[3] : '';
}

/* Nomes dos indicadores de uma cadeia.
 *
 * A cotação do IMEA vem com "IndicadorFinalId" (um número), mas a
 * API também diz o nome de cada indicador:
 *
 *   GET /cadeias/<id>/indicadores
 *   [{ "Id": "708192508838936580", "Nome": "Preço soja disponível compra" }, ...]
 *
 * Sem esse nome, o site mostraria "Soja · Sorriso" sem dizer o que
 * é o preço (médio da.region, à vista, até o porto...). Com ele, o
 * card diz exatamente qual é o indicador. */
async function nomesDosIndicadores(cadeia) {
    const mapa = {};

    try {
        const url = CONFIG.imeaBase + '/cadeias/' + encodeURIComponent(cadeia) + '/indicadores';
        const resposta = await buscarJson(url);

        if (!Array.isArray(resposta.dados)) return mapa;

        resposta.dados.forEach(item => {
            const id = textoValor(primeiroValor(item, ['Id', 'id', 'IndicadorFinalId']));
            const nome = textoValor(primeiroValor(item, ['Nome', 'nome', 'Name']));

            if (id && nome && !mapa[id]) mapa[id] = nome;
        });
    } catch (erro) {
        /* sem os nomes, o coletor continua funcionando (mostra o id) */
    }

    return mapa;
}

/* Um indicador que é preço de mercado do grão (e não custo,
 * semente, frete ou Derivado). */
function ehIndicadorDePreco(nome) {
    const texto = semAcento(nome || '');

    if (!texto) return false;
    if (texto.indexOf('preco') === -1) return false;

    /* Não é a cotação do grão que interessa ao mercado. */
    const fora = ['semente', 'frete', 'oleo', 'farelo', 'custo', 'insumo'];

    for (let i = 0; i < fora.length; i++) {
        if (texto.indexOf(fora[i]) !== -1) return false;
    }

    return true;
}

/* Qual indicador vale mais quando dois descrevem o mesmo preço:
   o preço à vista ("disponível compra") vale mais que a média
   mensal do mesmo grão. */
function prioridadeDoIndicador(nome) {
    const texto = semAcento(nome || '');

    if (texto.indexOf('disponivel') !== -1) return 3;
    if (texto.indexOf('mensal') !== -1) return 2;

    return 1;
}

/* Nomes das cadeias: 4 = Soja, 3 = Milho, 1 = Algodão... */
async function nomesDasCadeias() {
    const mapa = {};

    try {
        const resposta = await buscarJson(CONFIG.imeaBase + '/cadeias');

        if (!Array.isArray(resposta.dados)) return mapa;

        resposta.dados.forEach(item => {
            const id = textoValor(primeiroValor(item, ['Id', 'id', 'CadeiaId']));
            const nome = textoValor(primeiroValor(item, ['Nome', 'nome', 'Name']));

            if (id && nome) mapa[id] = nome;
        });
    } catch (erro) {
        /* sem os nomes, o coletor usa "Cadeia <id>" */
    }

    return mapa;
}

async function coletarImea() {
    const itens = [];
    const mensagens = [];
    const nomes = await nomesDasCadeias();

    for (const cadeia of CONFIG.imeaCadeias) {
        const url = CONFIG.imeaBase + '/cadeias/' + encodeURIComponent(cadeia) + '/cotacoes';

        let registros = null;

        try {
            const resposta = await buscarJson(url);

            if (resposta.status < 200 || resposta.status >= 300) {
                mensagens.push('cadeia ' + cadeia + ': HTTP ' + resposta.status);
                continue;
            }

            if (!Array.isArray(resposta.dados)) {
                mensagens.push('cadeia ' + cadeia + ': resposta fora do formato');
                continue;
            }

            registros = resposta.dados;
        } catch (erro) {
            mensagens.push('cadeia ' + cadeia + ': ' + erro.message);
            continue;
        }

        const nomeCadeia = nomes[cadeia] || ('Cadeia ' + cadeia);
        const indicadores = await nomesDosIndicadores(cadeia);

        function nomeDoIndicador(item) {
            return indicadores[String(item.IndicadorFinalId)] || '';
        }

        if (DEBUG) {
            console.log('  [debug] IMEA cadeia ' + cadeia + ' (' + nomeCadeia + '): ' +
                registros.length + ' registro(s)');
            console.log('  [debug]   exemplo: ' +
                JSON.stringify(registros[0] || {}).slice(0, 400));
        }

        /* 1. só o que é preço do grão. Variação de -100% significa
         *    que o preço zerou: é resíduo da série, não cotação. */
        const precos = registros.filter(item => {
            if (!ehUnidadeDePreco(item.UnidadeSigla)) return false;
            if (typeof item.Valor !== 'number' || item.Valor <= 0) return false;
            if (!item.DataPublicacao) return false;
            if (typeof item.Variacao === 'number' && item.Variacao <= -99.9) return false;

            const nome = nomeDoIndicador(item);

            /* Sem o nome do indicador (a API falhou): fica o que tem
               preço, como antes. Com o nome: só o preço do grão. */
            if (!nome) return true;

            return ehIndicadorDePreco(nome);
        });

        /* 2. a publicação mais nova de cada indicador */
        const porIndicador = {};

        precos.forEach(item => {
            const chave = item.IndicadorFinalId + '|' + item.Localidade + '|' + item.UnidadeSigla;
            const atual = porIndicador[chave];

            if (!atual || String(item.DataPublicacao) > String(atual.DataPublicacao)) {
                porIndicador[chave] = item;
            }
        });

        /* 3. a série mais nova de cada (praça, unidade). Em caso de
         *    empate de data (dois indicadores no mesmo dia), fica o
         *    valor mais alto. */
        const porPraca = {};

        Object.keys(porIndicador).forEach(chave => {
            const item = porIndicador[chave];
            const chavePraca = item.Localidade + '|' + item.UnidadeSigla;
            const atual = porPraca[chavePraca];

            if (!atual) {
                porPraca[chavePraca] = item;
                return;
            }

            const dataAtual = String(atual.DataPublicacao);
            const dataItem = String(item.DataPublicacao);

            /* O preço à vista ("disponível compra") vale mais que a
               média mensal do mesmo grão. */
            const prioridadeItem = prioridadeDoIndicador(nomeDoIndicador(item));
            const prioridadeAtual = prioridadeDoIndicador(nomeDoIndicador(atual));

            if (prioridadeItem !== prioridadeAtual) {
                if (prioridadeItem > prioridadeAtual) porPraca[chavePraca] = item;
                return;
            }

            if (dataItem > dataAtual) {
                porPraca[chavePraca] = item;
            } else if (dataItem === dataAtual && item.Valor > atual.Valor) {
                porPraca[chavePraca] = item;
            }
        });

        Object.keys(porPraca).forEach(chavePraca => {
            const item = porPraca[chavePraca];

            const unidade = String(item.UnidadeSigla).trim();
            const praca = textoValor(item.Localidade) || 'Mato Grosso';
            const dia = diaDePublicacao(item.DataPublicacao);
            const safra = textoValor(item.Safra);
            const indicador = nomeDoIndicador(item);

            const simbolo = 'imea_' + cadeia + '_' + item.IndicadorFinalId + '_' +
                (slug(praca) || 'praca') + '_' + (slug(unidade) || 'un');

            itens.push({
                fonte: 'imea',
                mercado: praca.indexOf(' - ') !== -1 ? 'regional' : 'spot',
                simbolo: simbolo,
                produto: nomeCadeia,
                produto_chave: classificacao.chaveProduto(nomeCadeia) || null,
                regiao: praca,
                uf: classificacao.chaveEstado('imea', praca) || null,
                preco: item.Valor,
                preco_max: null,
                preco_min: null,
                variacao: typeof item.Variacao === 'number' ? item.Variacao : null,
                variacao_abs: null,
                unidade: unidade,
                referencia: 'IMEA · ' + nomeCadeia +
                    (indicador ? ' · ' + indicador : '') +
                    (safra ? ' · safra ' + safra : '') +
                    (dia ? ' · ' + dia : ''),
                publicado: true
            });
        });

        if (DEBUG) {
            const porNome = {};

            Object.keys(porPraca).forEach(chavePraca => {
                const nome = nomeDoIndicador(porPraca[chavePraca]) || '(sem nome)';
                porNome[nome] = (porNome[nome] || 0) + 1;
            });

            console.log('  [debug] indicadores da cadeia ' + cadeia + ': ' +
                Object.keys(porNome).length);
            Object.keys(porNome).sort().forEach(nome => {
                console.log('    ' + porNome[nome] + 'x ' + nome);
            });
        }
    }

    return {
        fonte: 'imea',
        nome: 'IMEA',
        url: CONFIG.imeaBase + '/cadeias',
        itens: itens,
        parcial: mensagens.length > 0 && itens.length > 0,
        erro: itens.length ? null : (mensagens.join(' | ') || 'nenhuma cotacao reconhecida na resposta')
    };
}

/* ------------------------------------------------------------------
 * Grão Direto
 * ------------------------------------------------------------------
 * O site do Grão Direto é uma aplicação Next.js: os números ficam
 * dentro do <script id="__NEXT_DATA__"> da página, e não nas
 * tabelas do HTML. A leitura é feita dali:
 *
 *   props.pageProps.stockQuotations        -> mercado (Chicago, BM&F,
 *                                             dólar) com série de 7 dias
 *   props.pageProps.tableData.physicalMarket -> preço físico por praça
 *   props.pageProps.tableData.cepea          -> séries do CEPEA/ESALQ
 *
 * Cada item: { id, name, subtitle, description, value, unitOfMeasurement,
 * priceUnit, chartPoints[7], variation, updatedAt }
 * ------------------------------------------------------------------ */

const PRODUTOS_GD = {
    soy: { nome: 'Soja', pagina: 'soy' },
    corn: { nome: 'Milho', pagina: 'corn' },
    sorghum: { nome: 'Sorgo', pagina: 'sorghum' }
};

/* O bloco de dados do Next.js (JSON puro dentro da página). */
function extrairNextData(html) {
    const pagina = String(html || '');

    const inicio = pagina.indexOf('id="__NEXT_DATA__"');

    if (inicio === -1) return null;

    const abre = pagina.indexOf('>', inicio);
    const fecha = pagina.indexOf('</script>', abre);

    if (abre === -1 || fecha === -1) return null;

    try {
        return JSON.parse(pagina.slice(abre + 1, fecha));
    } catch (erro) {
        return null;
    }
}

/* Unidade de medida: o Grão Direto usa "priceUnit" (bushel, saca,
 * tonel) e, no dólar, apenas o "unitOfMeasurement". */
function unidadeGd(item) {
    const priceUnit = semAcento(item.priceUnit || '');

    if (priceUnit === 'bushel' || priceUnit === 'bu') return 'US$/bu';
    if (priceUnit === 'saca' || priceUnit === 'sc') return 'R$/sc';
    if (priceUnit === 'tonel' || priceUnit === 'ton' || priceUnit === 't') return 'R$/t';
    if (priceUnit === 'kg') return 'R$/kg';
    if (priceUnit === 'libra' || priceUnit === 'lb') return 'US$/lb';

    return 'R$';
}

/* Mercado de cada item: Chicago e BM&F são futuros, o dólar é FX e
 * o resto é preço físico regional. */
function mercadoGd(item) {
    const nome = semAcento(item.name || '');
    const texto = semAcento((item.description || '') + ' ' + (item.subtitle || '') + ' ' + nome);

    if (nome.indexOf('dolar') !== -1 || nome.indexOf('dólar') !== -1) return 'fx';
    if (texto.indexOf('chicago') !== -1 || texto.indexOf('cbot') !== -1) return 'futuros';
    if (texto.indexOf('bm&f') !== -1 || texto.indexOf('bolsa') !== -1) return 'b3';

    return 'regional';
}

/* Um item do Grão Direto vira uma cotação do Q GRAOS. */
function cotacaoGd(item, contexto) {
    const preco = arredondar(precoNumerico(item.value), 4);

    if (preco === null || preco <= 0) return null;

    const nome = textoValor(item.name) || contexto.nome;
    const titulo = textoValor(item.subtitle);
    const descricao = textoValor(item.description);
    const dia = textoValor(item.updatedAt);
    const mercado = mercadoGd(item);

    const pontos = Array.isArray(item.chartPoints) ? item.chartPoints : [];
    const serie = pontos.map(precoNumerico)
        .filter(valor => valor !== null && valor > 0)
        .map(valor => arredondar(valor, 6));

    let produto = nome;
    let regiao = descricao || titulo || contexto.nome;

    if (mercado === 'futuros' || mercado === 'b3') {
        /* Contrato: "Soja · Novembro 2026" na bolsa de Chicago. */
        produto = titulo ? (nome + ' · ' + titulo) : nome;
        regiao = descricao || (mercado === 'b3' ? 'B3' : 'Chicago');
    } else if (mercado === 'fx') {
        produto = nome;
        regiao = titulo || 'Spot';
    }

    const variacao = precoNumerico(item.variation);

    return {
        fonte: 'grao_direto',
        mercado: mercado,
        simbolo: 'gd_' + (item.id !== undefined && item.id !== null && item.id !== '' ?
            item.id : (slug(nome + ' ' + descricao) || 'cotacao')),
        produto: produto,
        produto_chave: classificacao.chaveProduto(produto) || null,
        regiao: regiao,
        uf: classificacao.chaveEstado('grao_direto', regiao) || null,
        preco: preco,
        preco_max: serie.length ? Math.max.apply(null, serie) : null,
        preco_min: serie.length ? Math.min.apply(null, serie) : null,
        variacao: variacao,
        variacao_abs: null,
        unidade: unidadeGd(item),
        referencia: 'Grão Direto · ' +
            (descricao ? descricao + ' · ' : '') +
            (dia ? dia : 'data não informada') +
            (serie.length ? ' · 7 dias' : ''),
        publicado: true
    };
}

async function coletarGraoDireto() {
    const itens = [];
    const mensagens = [];
    const vistos = {};

    for (const chave of CONFIG.graoDiretoProdutos) {
        const info = PRODUTOS_GD[chave];

        if (!info) {
            mensagens.push('produto desconhecido: ' + chave);
            continue;
        }

        const url = 'https://www.graodireto.com.br/quotations/' + info.pagina;

        try {
            const resposta = await buscarTexto(url);

            if (resposta.status < 200 || resposta.status >= 300) {
                mensagens.push(info.nome + ': HTTP ' + resposta.status);
                continue;
            }

            const dados = extrairNextData(resposta.texto);

            if (!dados || !dados.props || !dados.props.pageProps) {
                mensagens.push(info.nome + ': bloco de dados (__NEXT_DATA__) nao encontrado');
                continue;
            }

            const pageProps = dados.props.pageProps;
            const contexto = { chave: chave, nome: info.nome };
            const listas = [];

            if (Array.isArray(pageProps.stockQuotations)) {
                listas.push(pageProps.stockQuotations);
            }

            const tableData = pageProps.tableData || {};

            if (tableData.physicalMarket && Array.isArray(tableData.physicalMarket)) {
                listas.push(tableData.physicalMarket);
            }

            if (tableData.cepea && Array.isArray(tableData.cepea)) {
                listas.push(tableData.cepea);
            }

            let daPagina = 0;

            listas.forEach(lista => {
                lista.forEach(item => {
                    const cotacao = cotacaoGd(item, contexto);

                    if (!cotacao) return;

                    /* O mesmo item (dólar, por exemplo) aparece em
                     * mais de uma página: entra uma vez só. */
                    if (vistos[cotacao.simbolo]) return;

                    vistos[cotacao.simbolo] = true;
                    itens.push(cotacao);
                    daPagina++;
                });
            });

            if (DEBUG) {
                console.log('  [debug] Grão Direto ' + info.nome + ': ' +
                    daPagina + ' cotacao(oes) em ' + listas.length + ' lista(s)');
            }

            if (!daPagina) {
                mensagens.push(info.nome + ': nenhuma cotacao reconhecida nos dados da pagina');
            }
        } catch (erro) {
            mensagens.push(info.nome + ': ' + erro.message);
        }
    }

    return {
        fonte: 'grao_direto',
        nome: 'Grão Direto',
        url: 'https://www.graodireto.com.br/quotations/',
        itens: itens,
        parcial: mensagens.length > 0 && itens.length > 0,
        erro: itens.length ? null : (mensagens.join(' | ') || 'nenhuma cotacao reconhecida')
    };
}

/* ------------------------------------------------------------------
 * Investing.com
 * ------------------------------------------------------------------
 * O site bloqueia cliente HTTP comum (TLS de navegador). A coleta
 * usa o auxiliar Python (curl_cffi) e a leitura do JSON é feita
 * aqui, de forma tolerante.
 * ------------------------------------------------------------------ */

function lerFontesInvesting() {
    const arquivo = CONFIG.investingFontes;

    try {
        if (!fs.existsSync(arquivo)) {
            return { erro: 'arquivo de fontes nao encontrado: ' + arquivo };
        }

        const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
        const lista = Array.isArray(dados) ? dados : (dados.fontes || []);

        if (!Array.isArray(lista) || !lista.length) {
            return { erro: 'nenhum simbolo em ' + arquivo };
        }

        return { fontes: lista };
    } catch (erro) {
        return { erro: 'erro ao ler ' + arquivo + ': ' + erro.message };
    }
}

/* Procura o id do instrumento na busca do Investing (quando o JSON
 * de configuracao nao traz o id). */
function idDoResultado(resultado) {
    const id = primeiroValor(resultado, ['id', 'instrument_id', 'pair_ID']);
    return id === null ? null : id;
}

/* O endpoint pd-instruments entrega o preco dentro de "price".
 * Busca-o pelo nome exato do campo: os nomes parecidos ("last_close",
 * "change") podem ser de outra coisa. */
function precoDoInvesting(item) {
    const json = item.json || {};

    let bloco = json.price;

    if (Array.isArray(bloco)) bloco = bloco[0];

    if (!bloco || typeof bloco !== 'object') bloco = json;

    const preco = precoNumerico(primeiroValor(bloco, [
        'last', 'last_price', 'last_close', 'close'
    ]));

    return {
        preco: preco,
        variacao: precoNumerico(primeiroValor(bloco, [
            'change_percent', 'changePercent', 'percent_change'
        ])),
        variacao_abs: precoNumerico(primeiroValor(bloco, [
            'change', 'change_abs', 'absolute_change'
        ])),
        maximo: precoNumerico(primeiroValor(bloco, ['fifty_two_week_high'])),
        minimo: precoNumerico(primeiroValor(bloco, ['fifty_two_week_low']))
    };
}

/* Compara nomes de instrumento sem se preocupar com barra, espaço
 * ou acento ("USD/BRL" == "usd brl"). */
function chaveComparacao(texto) {
    return semAcento(texto).replace(/[^a-z0-9]+/g, '');
}

function textoDoInstrumento(candidato) {
    return [
        primeiroValor(candidato, ['symbol']) || '',
        primeiroValor(candidato, ['ticker']) || '',
        primeiroValor(candidato, ['short_name']) || '',
        primeiroValor(candidato, ['name']) || '',
        primeiroValor(candidato, ['description']) || ''
    ].join(' ');
}

async function coletarInvesting() {
    const configuracao = lerFontesInvesting();

    if (configuracao.erro) {
        return {
            fonte: 'investing',
            nome: 'Investing.com',
            url: 'https://www.investing.com',
            itens: [],
            erro: configuracao.erro
        };
    }

    const fontes = configuracao.fontes;
    const mensagens = [];

    /* ---------- fase 1: descobrir o id do instrumento ---------- */
    const ids = {};

    const precisaBusca = fontes.filter(fonte => !fonte.id && !fonte.url && fonte.busca);

    if (precisaBusca.length) {
        const requisicoesBusca = precisaBusca.map(fonte => ({
            chave: '__busca__' + (fonte.simbolo || fonte.chave || ''),
            url: 'https://api.investing.com/api/search/v2/search?q=' +
                encodeURIComponent(fonte.busca),
            metodo: 'GET',
            corpo: null,
            headers: { 'domain-id': 'www' }
        }));

        const busca = rodarPython(requisicoesBusca);

        if (busca.erro) {
            mensagens.push(busca.erro);
        } else {
            busca.itens.forEach(item => {
                if (!item.json) return;

                const lista = item.json.data || item.json.results || item.json;
                if (!Array.isArray(lista)) return;

                const chave = String(item.chave || '').replace('__busca__', '');
                const fonte = fontes.find(item2 => (item2.simbolo || item2.chave || '') === chave);
                if (!fonte) return;

                const achado = lista.find(candidato => {
                    const texto = chaveComparacao(textoDoInstrumento(candidato));
                    return texto.indexOf(chaveComparacao(fonte.busca)) !== -1;
                });

                if (!achado) return;

                const id = idDoResultado(achado);
                if (id !== null) ids[chave] = id;
            });
        }
    }

    /* ---------- fase 2: buscar o preco de cada simbolo ---------- */
    const requisicoes = [];

    fontes.forEach(fonte => {
        const chave = fonte.simbolo || fonte.chave || '';
        const id = fonte.id || ids[chave];

        let url = fonte.url || '';

        if (!url && id !== undefined && id !== null) {
            const modelo = fonte.modelo || CONFIG.investingModelo;
            url = modelo.replace('{id}', encodeURIComponent(id));
        }

        if (!url) {
            mensagens.push(chave + ': sem id e sem url (informe "id" ou "url" em tools/investing-fontes.json)');
            return;
        }

        requisicoes.push({
            chave: chave,
            url: url,
            metodo: fonte.metodo || 'GET',
            corpo: fonte.corpo || null,
            headers: Object.assign({ 'domain-id': 'www' }, fonte.headers || {})
        });
    });

    if (!requisicoes.length) {
        return {
            fonte: 'investing',
            nome: 'Investing.com',
            url: 'https://www.investing.com',
            itens: [],
            erro: mensagens.join(' | ') || 'nenhuma requisicao possivel'
        };
    }

    const resultado = rodarPython(requisicoes);

    if (resultado.erro) {
        return {
            fonte: 'investing',
            nome: 'Investing.com',
            url: 'https://www.investing.com',
            itens: [],
            erro: resultado.erro
        };
    }

    const porChave = {};
    resultado.itens.forEach(item => {
        porChave[item.chave] = item;
    });

    const itens = [];

    fontes.forEach(fonte => {
        const chave = fonte.simbolo || fonte.chave || '';
        const item = porChave[chave];

        if (!item) {
            mensagens.push(chave + ': sem resposta');
            return;
        }

        if (item.status < 200 || item.status >= 300) {
            mensagens.push(chave + ': HTTP ' + item.status +
                (item.erro ? ' (' + item.erro + ')' : ''));
            return;
        }

        if (!item.json) {
            mensagens.push(chave + ': resposta nao e JSON');
            return;
        }

        const encontrado = precoDoInvesting(item);
        const preco = arredondar(encontrado.preco, 4);

        if (preco === null || preco === 0) {
            mensagens.push(chave + ': nenhum preco reconhecido na resposta');
            return;
        }

        const faixa = (encontrado.minimo !== null && encontrado.maximo !== null)
            ? ' · 52 sem: ' + encontrado.minimo.toLocaleString('pt-BR') +
              '–' + encontrado.maximo.toLocaleString('pt-BR')
            : '';

        itens.push({
            fonte: 'investing',
            mercado: fonte.mercado || 'futuros',
            simbolo: 'inv_' + (slug(chave) || 'cotacao'),
            produto: fonte.produto || chave,
            produto_chave: classificacao.chaveProduto(fonte.produto || chave) || null,
            regiao: fonte.regiao || null,
            uf: classificacao.chaveEstado('investing', fonte.regiao || null) || null,
            preco: preco,
            preco_max: null,
            preco_min: null,
            variacao: encontrado.variacao,
            variacao_abs: encontrado.variacao_abs,
            unidade: fonte.unidade || 'US$',
            referencia: 'Investing.com · ' + (fonte.rotulo || chave) + faixa,
            publicado: true
        });
    });

    return {
        fonte: 'investing',
        nome: 'Investing.com',
        url: 'https://www.investing.com',
        itens: itens,
        parcial: mensagens.length > 0 && itens.length > 0,
        erro: itens.length ? null : (mensagens.join(' | ') || 'nenhuma cotacao reconhecida')
    };
}

function rodarPython(requisicoes) {
    const python = CONFIG.python;

    const executavel = (function () {
        const tentativa = spawnSync(python, ['--version'], { encoding: 'utf8' });

        if (tentativa.error && tentativa.error.code === 'ENOENT') {
            const alternativa = spawnSync('python3', ['--version'], { encoding: 'utf8' });

            if (!alternativa.error) return 'python3';

            return null;
        }

        return python;
    })();

    if (!executavel) {
        return {
            erro: 'Python nao encontrado (QG_PYTHON). A coleta do Investing.com precisa de Python com curl_cffi.',
            itens: []
        };
    }

    const processo = spawnSync(executavel, [path.join(__dirname, 'cotacoes-investing.py')], {
        input: JSON.stringify({ requisicoes: requisicoes }),
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024
    });

    if (processo.error) {
        return { erro: 'falha ao rodar o auxiliar Python: ' + processo.error.message, itens: [] };
    }

    let dados = null;
    try {
        dados = JSON.parse(processo.stdout || '{}');
    } catch (erro) {
        return {
            erro: 'saida invalida do auxiliar Python: ' + (processo.stderr || '').slice(0, 300),
            itens: []
        };
    }

    if (dados.erro) {
        return { erro: dados.erro, itens: [] };
    }

    return { erro: null, itens: dados.itens || [] };
}

/* ------------------------------------------------------------------
 * Gravação no Supabase
 * ------------------------------------------------------------------ */

async function tokenAdmin() {
    /* 1. Service role key: e o caminho preferido. Nao depende de
       senha, entao trocar a senha do painel nao quebra a coleta. */
    if (CONFIG.serviceRole) {
        return { token: CONFIG.serviceRole, apikey: CONFIG.serviceRole, tipo: 'service_role' };
    }

    /* 2. Reserva: login do administrador no painel. */
    const credenciais = credenciaisAdmin();

    if (!credenciais) {
        throw new Error(
            'Sem credenciais para gravar. Defina QG_SUPABASE_SERVICE_ROLE ' +
            '(recomendado) ou QG_ADMIN_EMAIL e QG_ADMIN_PASSWORD ' +
            '(ou crie o arquivo .qg-admin.json na raiz) e rode de novo.'
        );
    }

    const resposta = await fetch(CONFIG.url + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            apikey: CONFIG.anonKey
        },
        body: JSON.stringify(credenciais)
    });

    const dados = await resposta.json();

    if (!dados || !dados.access_token) {
        throw new Error('login do administrador falhou: ' +
            ((dados && (dados.msg || dados.error_description || dados.message)) || resposta.status));
    }

    return { token: dados.access_token, apikey: CONFIG.anonKey, tipo: 'admin' };
}

function cabecalhosAdmin(credencial, extra) {
    return Object.assign({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: credencial.apikey,
        Authorization: 'Bearer ' + credencial.token
    }, extra || {});
}

async function gravarCotacoes(credencial, itens) {
    if (!itens.length) return 0;

    const resposta = await fetch(
        CONFIG.url + '/rest/v1/cotacoes?on_conflict=fonte,simbolo',
        {
            method: 'POST',
            headers: cabecalhosAdmin(credencial, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
            body: JSON.stringify(itens)
        }
    );

    if (!resposta.ok) {
        const texto = await resposta.text();
        throw new Error('gravacao das cotacoes falhou: HTTP ' + resposta.status + ' ' + texto.slice(0, 300));
    }

    return itens.length;
}

async function contarPublicadas(credencial, fonte) {
    const resposta = await fetch(
        CONFIG.url + '/rest/v1/cotacoes?select=id&fonte=eq.' + encodeURIComponent(fonte) +
        '&publicado=eq.true&limit=1000',
        { headers: cabecalhosAdmin(credencial) }
    );

    if (!resposta.ok) return -1;

    const linhas = await resposta.json();

    return Array.isArray(linhas) ? linhas.length : -1;
}

async function despublicarAntigas(credencial, fonte, itens) {
    const existentes = await fetch(
        CONFIG.url + '/rest/v1/cotacoes?select=id,simbolo&fonte=eq.' + encodeURIComponent(fonte),
        { headers: cabecalhosAdmin(credencial) }
    );

    if (!existentes.ok) return 0;

    const linhas = await existentes.json();

    if (!Array.isArray(linhas)) return 0;

    const atuais = {};
    itens.forEach(item => { atuais[item.simbolo] = true; });

    const ids = linhas
        .filter(linha => !atuais[linha.simbolo])
        .map(linha => linha.id);

    if (!ids.length) return 0;

    const resposta = await fetch(
        CONFIG.url + '/rest/v1/cotacoes?id=in.(' + ids.join(',') + ')',
        {
            method: 'PATCH',
            headers: cabecalhosAdmin(credencial, { Prefer: 'return=minimal' }),
            body: JSON.stringify({ publicado: false })
        }
    );

    return resposta.ok ? ids.length : 0;
}

async function gravarFonte(credencial, resultado) {
    const linha = {
        fonte: resultado.fonte,
        nome: resultado.nome,
        url: resultado.url,
        status: resultado.erro ? 'erro' : 'ok',
        mensagem: resultado.mensagem || (resultado.erro ? String(resultado.erro).slice(0, 500) : null),
        itens: resultado.itens.length,
        coletado_em: new Date().toISOString()
    };

    const resposta = await fetch(
        CONFIG.url + '/rest/v1/cotacoes_fontes?on_conflict=fonte',
        {
            method: 'POST',
            headers: cabecalhosAdmin(credencial, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
            body: JSON.stringify([linha])
        }
    );

    if (!resposta.ok) {
        const texto = await resposta.text();
        throw new Error('gravacao do estado da fonte falhou: HTTP ' + resposta.status + ' ' +
            texto.slice(0, 300));
    }
}

/* ------------------------------------------------------------------
 * Execução
 * ------------------------------------------------------------------ */

/* Gera o INSERT pronto para o Supabase (quando nao ha credenciais de
 * administrador na maquina, o snapshot e publicado pelo painel do
 * projeto ou por este SQL).
 *
 * O SQL usa jsonb_to_recordset em vez de um VALUES com muitas linhas:
 * e o formato aceito pelo SQL Editor do Supabase e tambem pelas
 * ferramentas de migracao que nao entendem VALUES multi-linha. */
function gerarSql(itens, resultados) {
    function json(valor) {
        if (valor === null || valor === undefined) return 'null';
        if (typeof valor === 'number') return String(valor);
        if (typeof valor === 'boolean') return valor ? 'true' : 'false';

        return JSON.stringify(String(valor));
    }

    function objeto(chaves, item) {
        const partes = [];

        chaves.forEach(chave => {
            partes.push('"' + chave + '":' + json(item[chave]));
        });

        return '{' + partes.join(',') + '}';
    }

    const chavesCotacao = [
        'fonte', 'mercado', 'simbolo', 'produto', 'produto_chave', 'regiao', 'uf',
        'preco', 'preco_max', 'preco_min', 'variacao', 'variacao_abs', 'unidade', 'referencia'
    ];

    const tiposCotacao = 'fonte text, mercado text, simbolo text, produto text,' +
        ' produto_chave text, regiao text, uf text,' +
        ' preco numeric, preco_max numeric, preco_min numeric, variacao numeric,' +
        ' variacao_abs numeric, unidade text, referencia text';

    const chavesFonte = ['fonte', 'nome', 'url', 'status', 'mensagem', 'itens', 'coletado_em'];

    const linhas = itens.map(item => '    ' + objeto(chavesCotacao, item));

    const estado = resultados.map(resultado => {
        const linha = {
            fonte: resultado.fonte,
            nome: resultado.nome,
            url: resultado.url,
            status: resultado.erro ? 'erro' : 'ok',
            mensagem: resultado.mensagem ||
                (resultado.erro ? String(resultado.erro) : null),
            itens: resultado.itens.length,
            coletado_em: new Date().toISOString()
        };

        return '    ' + objeto(chavesFonte, linha);
    });

    return [
        '-- Gerado por tools/coletar-cotacoes.js em ' + new Date().toISOString(),
        'INSERT INTO public.cotacoes (' + chavesCotacao.join(', ') + ')',
        'SELECT * FROM jsonb_to_recordset($json$[',
        linhas.join(',\n'),
        ']$json$::jsonb) AS x(' + tiposCotacao + ')',
        'ON CONFLICT (fonte, simbolo) DO UPDATE SET',
        '    mercado = EXCLUDED.mercado, produto = EXCLUDED.produto,',
        '    produto_chave = EXCLUDED.produto_chave, regiao = EXCLUDED.regiao,',
        '    uf = EXCLUDED.uf,',
        '    preco = EXCLUDED.preco, preco_max = EXCLUDED.preco_max, preco_min = EXCLUDED.preco_min,',
        '    variacao = EXCLUDED.variacao, variacao_abs = EXCLUDED.variacao_abs,',
        '    unidade = EXCLUDED.unidade, referencia = EXCLUDED.referencia, publicado = true;',
        '',
        'INSERT INTO public.cotacoes_fontes (' + chavesFonte.join(', ') + ')',
        'SELECT * FROM jsonb_to_recordset($json$[',
        estado.join(',\n'),
        ']$json$::jsonb) AS x(fonte text, nome text, url text, status text, mensagem text, itens integer, coletado_em timestamptz)',
        'ON CONFLICT (fonte) DO UPDATE SET',
        '    nome = EXCLUDED.nome, url = EXCLUDED.url, status = EXCLUDED.status,',
        '    mensagem = EXCLUDED.mensagem, itens = EXCLUDED.itens,',
        '    coletado_em = EXCLUDED.coletado_em;'
    ].join('\n');
}

/* Resumo do que seria gravado (modo --dry-run). */
function imprimirResumo(itens) {
    const porFonte = {};

    itens.forEach(item => {
        if (!porFonte[item.fonte]) porFonte[item.fonte] = [];
        porFonte[item.fonte].push(item);
    });

    Object.keys(porFonte).forEach(fonte => {
        const lista = porFonte[fonte];

        const unidades = {};
        const mercados = {};
        const produtos = {};

        lista.forEach(item => {
            unidades[item.unidade] = (unidades[item.unidade] || 0) + 1;
            mercados[item.mercado] = (mercados[item.mercado] || 0) + 1;
            produtos[item.produto] = (produtos[item.produto] || 0) + 1;
        });

        console.log('\n  ' + fonte + ': ' + lista.length + ' cotacao(oes)');
        console.log('    unidades: ' + JSON.stringify(unidades));
        console.log('    mercados: ' + JSON.stringify(mercados));
        console.log('    produtos: ' + JSON.stringify(produtos));
        console.log('    exemplos:');

        lista.slice(0, 3).forEach(item => {
            console.log('      ' + item.produto + ' · ' + (item.regiao || '-') +
                ' · ' + item.preco + ' ' + item.unidade +
                ' (' + (item.variacao === null ? 'sem variação' : item.variacao + '%') + ')');
            console.log('        ' + item.referencia);
        });
    });
}

async function principal() {
    console.log('\n=== Coleta de cotacoes (Q GRAOS) ===\n');
    console.log('  Supabase: ' + CONFIG.url);

    if (DRY_RUN) console.log('  Modo: --dry-run (nada e gravado)');

    const resultados = [];

    if (fonteAtiva('imea')) {
        console.log('  [1/3] IMEA...');
        const resultado = await coletarImea();
        resultados.push(resultado);
        console.log('        ' + resultado.itens.length + ' cotacao(oes)' +
            (resultado.erro ? '  erro: ' + resultado.erro : ''));
    }

    if (fonteAtiva('grao_direto')) {
        console.log('  [2/3] Grao Direto...');
        const resultado = await coletarGraoDireto();
        resultados.push(resultado);
        console.log('        ' + resultado.itens.length + ' cotacao(oes)' +
            (resultado.erro ? '  erro: ' + resultado.erro : ''));
    }

    if (fonteAtiva('investing')) {
        console.log('  [3/3] Investing.com...');
        const resultado = await coletarInvesting();
        resultados.push(resultado);
        console.log('        ' + resultado.itens.length + ' cotacao(oes)' +
            (resultado.erro ? '  erro: ' + resultado.erro : ''));
    }

    const todas = [];
    resultados.forEach(resultado => todas.push.apply(todas, resultado.itens));

    console.log('\n  Total coletado: ' + todas.length + ' cotacao(oes).\n');

    if (DRY_RUN) {
        if (temArgumento('--sql')) {
            console.log(gerarSql(todas, resultados));
        } else if (temArgumento('--json')) {
            console.log(JSON.stringify(todas, null, 2));
        } else {
            imprimirResumo(todas);
        }

        console.log('\n  (dry-run: nada foi gravado)\n');
        return;
    }

    if (!todas.length) {
        console.log('  Nada para gravar. As fontes continuam com o que ja estava no ar.\n');
        return;
    }

    const credencial = await tokenAdmin();

    const gravadas = await gravarCotacoes(credencial, todas);
    console.log('  Gravadas no banco: ' + gravadas + ' cotacao(oes).');

    if (!MANTER_ANTIGAS) {
        for (const resultado of resultados) {
            if (resultado.erro) continue;

            /* Trava de lote parcial.
               *
               * Se a fonte respondeu com bem menos itens do que esta
               * publicado hoje, o desconfiado e a resposta truncada
               * (a fonte caiu no meio, veio paginada, o HTML mudou).
               * Nesse caso nada sai do ar: as cotacoes antigas ficam
               * com o horario delas ate a proxima coleta completa. */
            const publicadas = await contarPublicadas(credencial, resultado.fonte);
            const minimo = Math.floor(publicadas * FRAZAO_LOTE_PARCIAL);

            const loteParcial = publicados > 0 && resultado.itens.length < minimo;

            if (loteParcial || resultado.parcial) {
                const motivo = loteParcial
                    ? 'lote parcial (' + resultado.itens.length + ' de ' + publicadas + ' publicadas)'
                    : 'algumas respostas da fonte falharam';

                resultado.mensagem = 'Coleta com ' + motivo +
                    ': as cotacoes antigas foram mantidas no ar.';

                console.log('  ' + resultado.nome + ': ' + resultado.mensagem);
                continue;
            }

            const despublicadas = await despublicarAntigas(credencial, resultado.fonte, resultado.itens);

            if (despublicadas) {
                console.log('  ' + resultado.nome + ': ' + despublicadas +
                    ' cotacao(oes) antiga(s) tirada(s) do ar.');
            }
        }
    }

    for (const resultado of resultados) {
        await gravarFonte(credencial, resultado);
    }

    console.log('  Estado das fontes atualizado no painel.\n');
}

principal().catch(erro => {
    console.error('\n  [ERRO] ' + (erro && erro.message ? erro.message : erro));
    console.error('\n');
    process.exit(1);
});
