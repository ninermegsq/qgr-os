'use strict';

/* ------------------------------------------------------------------
 * Teste da classificacao das cotacoes (classificacao-cotacoes.js).
 *
 * A regra e a mesma que o site usa e que o coletor grava no banco.
 * Aqui ela e testada com os nomes que as fontes publicam de verdade
 * (IMEA, Grao Direto e Investing), copiados do public.cotacoes.
 *
 * Roda: npm run test:classificacao
 * ------------------------------------------------------------------ */

const classificacao = require('../classificacao-cotacoes.js');

const failures = [];
const checks = [];

/* O ponto medio das datas do grao (U+00B7). Escrito pelo codigo para
   nao depender de como o arquivo e salvo. */
const PONTO = String.fromCharCode(183);

function expect(label, actual, wanted) {
    if (actual === wanted) {
        checks.push(label + '  ->  ' + JSON.stringify(wanted));
    } else {
        failures.push(label + '  ->  ' + JSON.stringify(actual) +
            ' (esperava ' + JSON.stringify(wanted) + ')');
    }
}

/* ---------- Produto ---------- */

const produtos = [
    ['Soja', 'soja'],
    ['Soja ' + PONTO + ' Janeiro 2027', 'soja'],
    ['Soja ' + PONTO + ' Mar' + String.fromCharCode(0xE7) + 'o 2027', 'soja'],
    ['Soja (Chicago)', 'soja'],
    ['Milho', 'milho'],
    ['Milho ' + PONTO + ' Maio 2027', 'milho'],
    ['Milho (Chicago)', 'milho'],
    ['Algod' + String.fromCharCode(0xE3) + 'o', 'algodao'],
    ['Algod' + String.fromCharCode(0xE3) + 'o (Chicago)', 'algodao'],
    ['Sorgo', 'sorgo'],
    ['Farelo de soja (Chicago)', 'farelo_soja'],
    ['Caf' + String.fromCharCode(0xE9) + ' (Chicago)', 'cafe'],
    ['D' + String.fromCharCode(0xF3) + 'lar', 'dolar'],
    ['D' + String.fromCharCode(0xF3) + 'lar/Real', 'dolar'],
    ['Ibovespa', 'ibovespa'],
    ['Ouro', 'ouro'],
    ['Petr' + String.fromCharCode(0xF3) + 'leo Brent', 'petroleo'],
    ['Petr' + String.fromCharCode(0xF3) + 'leo WTI', 'petroleo'],
    /* O nome completo tambem cai na chave do grao */
    ['Milho Futuro Continuo', 'milho'],
    ['', '']
];

produtos.forEach(item => {
    expect('chaveProduto(' + JSON.stringify(item[0]) + ')',
        classificacao.chaveProduto(item[0]), item[1]);
});

/* ---------- Estado ---------- */

const estados = [
    /* IMEA: o indice e de Mato Grosso, seja qual for a praca */
    ['imea', 'Sorriso', 'MT'],
    ['imea', 'Campo Verde', 'MT'],
    ['imea', 'Mato Grosso', 'MT'],
    ['imea', null, 'MT'],

    /* Grao Direto: a praca diz o estado */
    ['grao_direto', 'Campinas', 'SP'],
    ['grao_direto', 'Itapetininga SP', 'SP'],
    ['grao_direto', 'Assis SP', 'SP'],
    ['grao_direto', 'Ribeir' + String.fromCharCode(0xE3) + 'o Preto', 'SP'],
    ['grao_direto', 'Extremo Oeste Baiano', 'BA'],
    ['grao_direto', 'Leste Goiano', 'GO'],
    ['grao_direto', 'Sul Goiano', 'GO'],
    ['grao_direto', 'Leste MS', 'MS'],
    ['grao_direto', 'Sudoeste de Mato Grosso do Sul', 'MS'],
    ['grao_direto', 'Noroeste de Minas', 'MG'],
    ['grao_direto', 'Tri' + String.fromCharCode(0xE2) + 'ngulo Mineiro', 'MG'],
    ['grao_direto', 'Tri' + String.fromCharCode(0xE2) +
        'ngulo Mineiro/Alto Parana' + String.fromCharCode(0xED) + 'ba', 'MG'],
    ['grao_direto', 'Centro Oriental Paranaense', 'PR'],
    ['grao_direto', 'Norte Central Paranaense', 'PR'],
    ['grao_direto', 'Centro Ocidental Rio-grandense', 'RS'],
    ['grao_direto', 'Norte Mato-grossense', 'MT'],
    ['grao_direto', 'Sudoeste Mato-grossense', 'MT'],
    ['grao_direto', 'Nordeste MT', 'MT'],
    ['grao_direto', 'Sudeste MT', 'MT'],

    /* Sem estado: bolsa, dolar e macro */
    ['grao_direto', 'Chicago', ''],
    ['grao_direto', 'BM&F', ''],
    ['grao_direto', 'Spot', ''],
    ['investing', 'Chicago', ''],
    ['investing', 'B3', ''],
    ['investing', 'Spot', ''],
    ['grao_direto', null, '']
];

estados.forEach(item => {
    expect('chaveEstado(' + JSON.stringify(item[0]) + ', ' + JSON.stringify(item[1]) + ')',
        classificacao.chaveEstado(item[0], item[1]), item[2]);
});

/* ---------- Rotulos ---------- */

expect('rotuloProduto(soja)', classificacao.rotuloProduto('soja'), 'Soja');
expect('rotuloProduto(algodao)', classificacao.rotuloProduto('algodao'), 'Algod' + String.fromCharCode(0xE3) + 'o');
expect('rotuloEstado(MT)', classificacao.rotuloEstado('MT'), 'Mato Grosso');
expect('rotuloEstado(mt)', classificacao.rotuloEstado('mt'), 'Mato Grosso');

/* ---------- Tabelas do filtro ---------- */

expect('PRODUTOS tem soja', classificacao.PRODUTOS.some(p => p.valor === 'soja'), true);
expect('PRODUTOS tem milho', classificacao.PRODUTOS.some(p => p.valor === 'milho'), true);
expect('PRODUTOS tem algodao', classificacao.PRODUTOS.some(p => p.valor === 'algodao'), true);
expect('PRODUTOS sem chave repetida',
    new Set(classificacao.PRODUTOS.map(p => p.valor)).size, classificacao.PRODUTOS.length);
expect('ESTADOS tem 27 unidades', classificacao.ESTADOS.length, 27);
expect('ESTADOS sem sigla repetida',
    new Set(classificacao.ESTADOS.map(e => e.valor)).size, classificacao.ESTADOS.length);
expect('ESTADOS tem MT', classificacao.ESTADOS.some(e => e.valor === 'MT'), true);

/* ---------- Relatorio ---------- */

console.log('');
console.log('=== Teste da classificacao (classificacao-cotacoes.js) ===');
console.log('');

checks.forEach(check => console.log('  [ok]    ' + check));

if (failures.length) {
    console.log('');
    failures.forEach(failure => console.log('  [ERRO]  ' + failure));
    console.log('');
    console.log('Resultado: ' + failures.length + ' falha(s).');
    console.log('');
    process.exit(1);
}

console.log('');
console.log('Resultado: ' + checks.length + ' verificacao(oes) sem falha.');
console.log('');
