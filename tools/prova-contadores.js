/* Prova de ponta a ponta dos contadores publicos (somente leitura
   no estado: conta uma visualizacao de verdade numa noticia publicada
   e confere que o contador subiu). */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const conteudo = fs.readFileSync(path.join(ROOT, 'site.config.js'), 'utf8');
const url = (conteudo.match(/url:\s*'([^']+)'/) || [])[1];
const anonKey = (conteudo.match(/anonKey:\s*'([^']*)'/) || [])[1];

const H = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    apikey: anonKey
};

async function p(method, caminho, corpo) {
    const opcoes = { method: method, headers: H, cache: 'no-store' };
    if (corpo !== undefined) opcoes.body = JSON.stringify(corpo);

    const r = await fetch(url + caminho, opcoes);
    const t = await r.text();

    let d = null;
    try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }

    return { status: r.status, dados: d };
}

async function principal() {
    /* 1. A visao com a sessao (caminho novo, exige a migration 180000) */
    const comSessao = await p('POST', '/rest/v1/rpc/registrar_visualizacao_noticia', {
        p_id: '00000000-0000-4000-8000-000000000000',
        p_sessao_id: 'sonda-prova'
    });

    console.log('com p_sessao_id    -> HTTP ' + comSessao.status +
        ' (' + ((comSessao.dados && comSessao.dados.code) || 'sem PGRST') + ')');

    /* 2. O caminho de recuo (sem sessao): precisa funcionar */
    const semSessao = await p('POST', '/rest/v1/rpc/registrar_visualizacao_noticia', {
        p_id: '00000000-0000-4000-8000-000000000000'
    });

    console.log('sem p_sessao_id    -> HTTP ' + semSessao.status);

    /* 3. Prova real: conta uma visualizacao numa noticia publicada */
    const lista = await p('GET', '/rest/v1/noticias?select=id,titulo,visualizacoes,cliques&publicado=eq.true&order=publicado_em.desc&limit=1');

    if (!Array.isArray(lista.dados) || !lista.dados.length) {
        console.log('\nSem noticia publicada para provar o contador.');
        return;
    }

    const noticia = lista.dados[0];

    console.log('\nnoticia: "' + String(noticia.titulo).slice(0, 60) + '"');
    console.log('  antes  -> visualizacoes=' + noticia.visualizacoes + ' cliques=' + noticia.cliques);

    const chamada = await p('POST', '/rest/v1/rpc/registrar_visualizacao_noticia', { p_id: noticia.id });
    const clique = await p('POST', '/rest/v1/rpc/clicar_noticia', { p_id: noticia.id });

    console.log('  rpc registrar_visualizacao_noticia -> HTTP ' + chamada.status);
    console.log('  rpc clicar_noticia                 -> HTTP ' + clique.status);

    const depois = await p('GET', '/rest/v1/noticias?select=id,visualizacoes,cliques&publicado=eq.true&order=publicado_em.desc&limit=1');
    const linha = Array.isArray(depois.dados) ? depois.dados[0] : null;

    console.log('  depois -> visualizacoes=' + (linha ? linha.visualizacoes : '?') +
        ' cliques=' + (linha ? linha.cliques : '?'));

    const subiuVisualizacao = linha && Number(linha.visualizacoes) === Number(noticia.visualizacoes) + 1;
    const subiuClique = linha && Number(linha.cliques) === Number(noticia.cliques) + 1;

    console.log('\n  visualizacoes +1: ' + (subiuVisualizacao ? 'SIM' : 'NAO'));
    console.log('  cliques      +1: ' + (subiuClique ? 'SIM' : 'NAO'));
}

principal().catch(e => { console.error(e); process.exit(1); });
