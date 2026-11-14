/* Mede a distribuicao real entregue pelo motor de anuncios do Q GRAOS.
   O motor real (script.js) e extraido e executado em sandbox, sem
   navegador e sem rede. Compara: peso configurado x espaco entregue
   por anunciante. Serve tambem de teste de regressao do rodizio.

   Regras verificadas:
     R1. O peso vale no espaco entregue (proporcao por anunciante).
     R2. O mesmo anunciante nao ocupa dois espacos seguidos — so
         quando o peso dos concorrentes permite (com 3 vagas contra 1
         a repeticao e matematicamente inevitavel).
     R3. Dentro de um anunciante com mais de um anuncio, o mesmo
         anuncio nao se repete em dois espacos seguidos.

   Uso: node tools/audit-motor-anuncios.js
*/
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');

const MARCA_INICIO = 'function chaveEspacoAnuncio';
const MARCA_FIM = '/* Selo "Publicidade"';

const inicio = js.indexOf(MARCA_INICIO);
const fim = js.indexOf(MARCA_FIM, inicio);

if (inicio < 0 || fim < 0) {
    console.error('Nao consegui extrair o motor de anuncios do script.js');
    process.exit(1);
}

const helpers = `
var ANALYTICS = { visitorId: 'visitante-teste' };
var FUSO_QG = -4 * 60 * 60 * 1000;
function hojeEmQg() { return new Date(Date.now() + FUSO_QG).toISOString().slice(0, 10); }
function lerArmazenamento() { return null; }
function gravarArmazenamento() {}
`;

/* O estado do motor vive antes das funcoes: recorta o arquivo a
   partir dos "const anunciosPorPosicao" e volta no inicio do motor. */
const estado = js
    .slice(js.indexOf('const anunciosPorPosicao'), inicio)
    .replace(/const anunciosPorPosicao/g, 'var anunciosPorPosicao')
    .replace(/const ciclosAnuncio/g, 'var ciclosAnuncio');

const funcoes = js.slice(inicio, fim);

const sandbox = `
${helpers}
${estado}
${funcoes}
function __medir(definicoes, voltas) {
    var lista = definicoes.map(function (d, i) {
        return {
            id: 'id-' + d.empresa + '-' + i,
            titulo: 'Anuncio ' + i,
            empresa: d.empresa,
            texto: '',
            url: '',
            imagem_url: '',
            posicao: 'noticias',
            formato: d.formato || 'faixa',
            publicado: true,
            prioridade: d.prioridade || 0,
            peso: d.peso,
            inicio_em: null,
            fim_em: null
        };
    });

    ciclosAnuncio = {};
    anunciosPorPosicao = {};

    var porAnunciante = {};
    var porAnuncio = {};
    var ciclo = [];
    var cicloItens = [];

    for (var v = 0; v < voltas; v++) {
        for (var f = 0; f < formatos.length; f++) {
            var formato = formatos[f];
            var doFormato = lista.filter(function (a) { return a.formato === formato; });
            if (!doFormato.length) continue;

            anunciosPorPosicao['noticias'] = doFormato;

            var anuncio = proximoAnuncioEspaco('noticias', formato);
            if (!anuncio) continue;

            ciclo.push(anuncio.empresa);
            cicloItens.push({ empresa: anuncio.empresa, id: anuncio.id, formato: formato });
            porAnunciante[anuncio.empresa] = (porAnunciante[anuncio.empresa] || 0) + 1;
            porAnuncio[anuncio.id] = (porAnuncio[anuncio.id] || 0) + 1;
        }
    }

    return {
        porAnunciante: porAnunciante,
        porAnuncio: porAnuncio,
        ciclo: ciclo,
        cicloItens: cicloItens
    };
}
var formatos = ['faixa', 'card'];
`;

const contexto = { console, Date, Math, JSON, String, Number, Array, Object, Boolean };
vm.createContext(contexto);
vm.runInContext(sandbox, contexto);

if (typeof contexto.__medir !== 'function') {
    console.error('O motor nao foi extraido do script.js');
    process.exit(1);
}

/* Proporcao esperada por anunciante: o peso do anunciante e a SOMA dos
   pesos dos anuncios dele (dois anuncios da mesma empresa ocupam duas
   vezes o espaco de um so). */
function pesoEsperado(definicoes) {
    const total = definicoes.reduce((s, d) => s + d.peso, 0);
    const soma = {};

    definicoes.forEach(d => {
        soma[d.empresa] = (soma[d.empresa] || 0) + d.peso;
    });

    const mapa = {};

    Object.keys(soma).forEach(empresa => {
        mapa[empresa] = soma[empresa] / total;
    });

    return mapa;
}

/* Quais empresas tem mais de um anuncio no cenario (para a regra R3) */
function empresasComVariosAnuncios(definicoes) {
    const contagem = {};

    definicoes.forEach(d => {
        contagem[d.empresa] = (contagem[d.empresa] || 0) + 1;
    });

    return Object.keys(contagem).filter(empresa => contagem[empresa] > 1);
}

/* Cada espaco (faixa / card) tem o seu proprio ciclo: a sequencia
   observada em cada formato e analisada separado. */
function sequenciaDoFormato(cicloItens, formato) {
    return cicloItens.filter(item => item.formato === formato);
}

function tabela(titulo, definicoes, voltas) {
    const r = contexto.__medir(definicoes, voltas);
    const esperado = pesoEsperado(definicoes);
    const total = Object.keys(r.porAnunciante).reduce((a, k) => a + r.porAnunciante[k], 0);

    console.log('');
    console.log('### ' + titulo);
    console.log('   ciclo entregue : ' + r.ciclo.slice(0, 14).join(',') + (r.ciclo.length > 14 ? ',...' : ''));
    console.log('   espacos contados: ' + total);
    console.log('   anunciante | entregue | esperado | delta');
    Object.keys(esperado).forEach(empresa => {
        const entregue = (r.porAnunciante[empresa] || 0) / total * 100;
        const exp = esperado[empresa] * 100;
        console.log('   ' + String(empresa).padEnd(8) + ' | ' + ((entregue.toFixed(1) + '%').padStart(8)) +
            ' | ' + ((exp.toFixed(1) + '%').padStart(8)) + ' | ' + ((entregue - exp).toFixed(1) + 'pp').padStart(9));
    });

    return { r, esperado, total };
}

console.log('=== Motor de anuncios: peso configurado x espaco entregue ===');

const cenarios = [
    ['A peso 3 x B peso 1 (mesmo formato)', [
        { empresa: 'A', peso: 3 },
        { empresa: 'B', peso: 1 }
    ]],
    ['A peso 10 x B peso 1', [
        { empresa: 'A', peso: 10 },
        { empresa: 'B', peso: 1 }
    ]],
    ['A peso 3 x B peso 1 x C peso 1', [
        { empresa: 'A', peso: 3 },
        { empresa: 'B', peso: 1 },
        { empresa: 'C', peso: 1 }
    ]],
    ['A peso 2 x B peso 2 x C peso 2 x D peso 2', [
        { empresa: 'A', peso: 2 },
        { empresa: 'B', peso: 2 },
        { empresa: 'C', peso: 2 },
        { empresa: 'D', peso: 2 }
    ]],
    ['Mesma empresa (ALFA) com 2 anuncios, peso 1 cada', [
        { empresa: 'ALFA', peso: 1 },
        { empresa: 'ALFA', peso: 1 }
    ]],
    ['ALFA (2 anuncios, peso 1) x BETA (1 anuncio, peso 1)', [
        { empresa: 'ALFA', peso: 1 },
        { empresa: 'ALFA', peso: 1 },
        { empresa: 'BETA', peso: 1 }
    ]],
    ['ALFA (2 anuncios, peso 3 cada) x BETA (1 anuncio, peso 1)', [
        { empresa: 'ALFA', peso: 3 },
        { empresa: 'ALFA', peso: 3 },
        { empresa: 'BETA', peso: 1 }
    ]],
    ['A peso 1 x B peso 1', [
        { empresa: 'A', peso: 1 },
        { empresa: 'B', peso: 1 }
    ]],
    ['A peso 2 x B peso 1 x C peso 1', [
        { empresa: 'A', peso: 2 },
        { empresa: 'B', peso: 1 },
        { empresa: 'C', peso: 1 }
    ]],
    ['ALFA (2 anuncios, peso 1) x BETA (1 anuncio, peso 2)', [
        { empresa: 'ALFA', peso: 1 },
        { empresa: 'ALFA', peso: 1 },
        { empresa: 'BETA', peso: 2 }
    ]]
];

const resultados = cenarios.map(c => tabela(c[0], c[1], 400));

/* ------------------------------------------------------------------
 * Veredito
 * ------------------------------------------------------------------ */
console.log('');
console.log('=== Veredito ===');

let falhas = 0;

/* R1: o peso vale no espaco entregue */
resultados.forEach((res, indice) => {
    const { r, esperado, total } = res;
    let maiorDelta = 0;
    let problema = '';

    Object.keys(esperado).forEach(empresa => {
        const entregue = (r.porAnunciante[empresa] || 0) / total * 100;
        const delta = Math.abs(entregue - esperado[empresa] * 100);

        if (delta > maiorDelta) {
            maiorDelta = delta;
            problema = empresa;
        }
    });

    const ok = maiorDelta <= 2;

    if (!ok) falhas++;

    console.log('  ' + (ok ? '[ok]    ' : '[FALHA] ') + 'R1 peso respeitado: ' + cenarios[indice][0] +
        ' | maior desvio ' + maiorDelta.toFixed(1) + 'pp (tolerancia 2pp)' +
        (ok ? '' : ' | empresa: ' + problema));
});

/* R2: o mesmo anunciante nao ocupa dois espacos seguidos.
   Exigivel apenas quando o anunciante mais pesado nao supera a soma
   dos concorrentes — senao a repeticao e matematicamente inevitavel. */
cenarios.forEach((cenario, indice) => {
    const porEmpresa = {};

    cenario[1].forEach(d => {
        porEmpresa[d.empresa] = (porEmpresa[d.empresa] || 0) + d.peso;
    });

    const pesos = Object.keys(porEmpresa).map(k => porEmpresa[k]);
    const total = pesos.reduce((a, b) => a + b, 0);
    const maisPesado = Math.max.apply(null, pesos);
    const concorrentes = total - maisPesado;

    if (maisPesado > concorrentes) return;

    let repeticoes = 0;

    ['faixa', 'card'].forEach(formato => {
        const seq = sequenciaDoFormato(resultados[indice].r.cicloItens, formato);

        for (let i = 1; i < seq.length; i++) {
            if (seq[i].empresa === seq[i - 1].empresa) repeticoes++;
        }
    });

    const ok = repeticoes === 0;

    if (!ok) falhas++;

    console.log('  ' + (ok ? '[ok]    ' : '[FALHA] ') + 'R2 anunciante nao repete: ' + cenario[0] +
        (ok ? '' : ' | repetiu ' + repeticoes + 'x'));
});

/* R3: dentro de um anunciante com mais de um anuncio, o mesmo anuncio
   nao se repete em dois espacos seguidos. */
cenarios.forEach((cenario, indice) => {
    const multiplos = empresasComVariosAnuncios(cenario[1]);

    if (!multiplos.length) return;

    let repeticoes = 0;
    let empresaProblema = '';

    ['faixa', 'card'].forEach(formato => {
        const seq = sequenciaDoFormato(resultados[indice].r.cicloItens, formato);

        for (let i = 1; i < seq.length; i++) {
            if (!multiplos.includes(seq[i].empresa)) continue;
            if (seq[i].id !== seq[i - 1].id) continue;

            repeticoes++;
            empresaProblema = seq[i].empresa;
        }
    });

    const ok = repeticoes === 0;

    if (!ok) falhas++;

    console.log('  ' + (ok ? '[ok]    ' : '[FALHA] ') + 'R3 anuncio nao repete dentro do anunciante: ' + cenario[0] +
        (ok ? '' : ' | repetiu ' + repeticoes + 'x (' + empresaProblema + ')'));
});

console.log('');
console.log(falhas ? 'Resultado: ' + falhas + ' problema(s) no rodizio.' : 'Resultado: o rodizio respeita o peso.');
process.exit(falhas ? 1 : 0);
