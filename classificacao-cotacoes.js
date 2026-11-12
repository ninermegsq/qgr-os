'use strict';

/* ------------------------------------------------------------------
 * Q GRAOS — classificação das cotações (produto e estado)
 * ------------------------------------------------------------------
 * O mesmo grão aparece com nomes diferentes conforme a fonte:
 * "Soja", "Soja · Janeiro 2027", "Soja (Chicago)". Para o filtro do
 * site (e para a coluna do banco) todas essas formas caem na mesma
 * chave: "soja".
 *
 * O mesmo vale para o estado: a praça do Grão Direto ("Campinas",
 * "Triângulo Mineiro") é de um estado; Chicago, B3 e o dólar não são
 * de estado nenhum — ficam sem UF.
 *
 * Este arquivo é a regra única:
 *   - o site usa como reserva, quando o banco ainda não tem as
 *     colunas produto_chave e uf;
 *   - o coletor grava as duas colunas em public.cotacoes.
 *
 * Nada aqui estima preço: é só classificação de nome.
 * ------------------------------------------------------------------ */

(function () {
    'use strict';

    /* Os produtos que o filtro oferece (na ordem em que aparecem) */
    const PRODUTOS = [
        { valor: 'soja', rotulo: 'Soja' },
        { valor: 'milho', rotulo: 'Milho' },
        { valor: 'algodao', rotulo: 'Algodão' },
        { valor: 'sorgo', rotulo: 'Sorgo' },
        { valor: 'farelo_soja', rotulo: 'Farelo de soja' },
        { valor: 'cafe', rotulo: 'Café' },
        { valor: 'dolar', rotulo: 'Dólar' },
        { valor: 'ibovespa', rotulo: 'Ibovespa' },
        { valor: 'ouro', rotulo: 'Ouro' },
        { valor: 'petroleo', rotulo: 'Petróleo' }
    ];

    /* Os estados do Brasil: a sigla é a chave, o nome é o rótulo */
    const ESTADOS = [
        { valor: 'AC', rotulo: 'Acre' },
        { valor: 'AL', rotulo: 'Alagoas' },
        { valor: 'AP', rotulo: 'Amapá' },
        { valor: 'AM', rotulo: 'Amazonas' },
        { valor: 'BA', rotulo: 'Bahia' },
        { valor: 'CE', rotulo: 'Ceará' },
        { valor: 'DF', rotulo: 'Distrito Federal' },
        { valor: 'ES', rotulo: 'Espírito Santo' },
        { valor: 'GO', rotulo: 'Goiás' },
        { valor: 'MA', rotulo: 'Maranhão' },
        { valor: 'MT', rotulo: 'Mato Grosso' },
        { valor: 'MS', rotulo: 'Mato Grosso do Sul' },
        { valor: 'MG', rotulo: 'Minas Gerais' },
        { valor: 'PA', rotulo: 'Pará' },
        { valor: 'PB', rotulo: 'Paraíba' },
        { valor: 'PR', rotulo: 'Paraná' },
        { valor: 'PE', rotulo: 'Pernambuco' },
        { valor: 'PI', rotulo: 'Piauí' },
        { valor: 'RJ', rotulo: 'Rio de Janeiro' },
        { valor: 'RN', rotulo: 'Rio Grande do Norte' },
        { valor: 'RS', rotulo: 'Rio Grande do Sul' },
        { valor: 'RO', rotulo: 'Rondônia' },
        { valor: 'RR', rotulo: 'Roraima' },
        { valor: 'SC', rotulo: 'Santa Catarina' },
        { valor: 'SP', rotulo: 'São Paulo' },
        { valor: 'SE', rotulo: 'Sergipe' },
        { valor: 'TO', rotulo: 'Tocantins' }
    ];

    /* Texto sem acento e em minúsculas, para comparar nomes */
    function semAcento(texto) {
        return String(texto === null || texto === undefined ? '' : texto)
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .trim();
    }

    /* A chave do produto a partir do nome que a fonte publicou.
       "Soja · Janeiro 2027" e "Soja (Chicago)" viram "soja". */
    function chaveProduto(produto) {
        const nome = semAcento(String(produto || '')
            .split('·')[0]
            .split('(')[0]
            .split('/')[0]);

        if (!nome) return '';

        if (nome.indexOf('farelo de soja') === 0) return 'farelo_soja';
        if (nome.indexOf('soja') === 0) return 'soja';
        if (nome.indexOf('milho') === 0) return 'milho';
        if (nome.indexOf('algod') === 0) return 'algodao';
        if (nome.indexOf('sorgo') === 0) return 'sorgo';
        if (nome.indexOf('cafe') === 0) return 'cafe';
        if (nome.indexOf('dolar') === 0) return 'dolar';
        if (nome.indexOf('ibovespa') === 0) return 'ibovespa';
        if (nome.indexOf('ouro') === 0) return 'ouro';
        if (nome.indexOf('petroleo') === 0) return 'petroleo';

        return '';
    }

    /* Praça -> estado. A primeira regra que casar vale.
       O IMEA é o índice de Mato Grosso: tudo MT. */
    const REGRAS_ESTADO = [
        { uf: 'SP', igual: 'campinas' },
        { uf: 'SP', contem: 'itapetininga sp' },
        { uf: 'SP', contem: 'assis sp' },
        { uf: 'SP', contem: 'ribeirao preto' },
        { uf: 'BA', contem: 'baiano' },
        { uf: 'GO', contem: 'goiano' },
        { uf: 'MS', contem: 'mato grosso do sul' },
        { uf: 'MS', contem: ' ms' },
        { uf: 'MG', contem: 'minas' },
        { uf: 'MG', contem: 'mineiro' },
        { uf: 'PR', contem: 'paranaense' },
        { uf: 'RS', contem: 'rio-grandense' },
        { uf: 'MT', contem: 'mato-grossense' },
        { uf: 'MT', igual: 'nordeste mt' },
        { uf: 'MT', igual: 'sudeste mt' }
    ];

    /* A sigla do estado da cotação (vazio = cotação sem estado:
       Chicago, B3, dólar e indicadores de macro) */
    function chaveEstado(fonte, regiao) {
        if (semAcento(fonte) === 'imea') return 'MT';

        const nome = semAcento(regiao);
        if (!nome) return '';

        for (let i = 0; i < REGRAS_ESTADO.length; i++) {
            const regra = REGRAS_ESTADO[i];

            if (regra.igual && nome === regra.igual) return regra.uf;
            if (regra.contem && nome.indexOf(regra.contem) !== -1) return regra.uf;
        }

        return '';
    }

    function rotuloProduto(chave) {
        const achado = PRODUTOS.find(item => item.valor === chave);
        return achado ? achado.rotulo : (chave || '');
    }

    function rotuloEstado(uf) {
        const sigla = String(uf || '').toUpperCase();
        const achado = ESTADOS.find(item => item.valor === sigla);

        return achado ? achado.rotulo : (uf || '');
    }

    const modulo = {
        PRODUTOS: PRODUTOS,
        ESTADOS: ESTADOS,
        chaveProduto: chaveProduto,
        chaveEstado: chaveEstado,
        rotuloProduto: rotuloProduto,
        rotuloEstado: rotuloEstado
    };

    /* No navegador (a pagina de cotacoes) */
    if (typeof window !== 'undefined') {
        window.QGClassificacao = modulo;
    }

    /* No Node (o coletor) */
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = modulo;
    }
})();
