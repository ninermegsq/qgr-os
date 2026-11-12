'use strict';

/* ------------------------------------------------------------------
 * Q GRAOS — Area de cotacoes (cotacoes.html)
 * ------------------------------------------------------------------
 * Le a tabela public.cotacoes (Supabase) e desenha o painel de precos.
 * Tudo e escrito com textContent: nenhum HTML vem do banco.
 *
 * O que a pagina mostra:
 *   - a linha de status (quando os numeros foram atualizados);
 *   - o filtro por mercado (com a contagem de cada um);
 *   - o card de cada cotacao (preco, variacao, unidade, regiao,
 *     fonte e hora da coleta);
 *   - o aviso honesto quando ainda nao existe nenhuma cotacao.
 *
 * A escolha do filtro fica no endereco (?mercado=spot), para a pagina
 * poder ser linkada e compartilhada.
 * ------------------------------------------------------------------ */

(function () {
    /* Deslocamento fixo de Mato Grosso em relacao ao UTC (em ms) */
    const FUSO_QG = -4 * 60 * 60 * 1000;

    /* Ordem fixa dos mercados e o rotulo que o leitor ve */
    const MERCADOS = [
        { valor: 'spot', rotulo: 'Preco fisico (MT)' },
        { valor: 'regional', rotulo: 'Regional' },
        { valor: 'futuros', rotulo: 'Chicago (CBOT)' },
        { valor: 'b3', rotulo: 'B3' },
        { valor: 'fx', rotulo: 'Dolar' },
        { valor: 'macro', rotulo: 'Macro' }
    ];

    /* Como o nome da fonte aparece no card */
    const ROTULO_FONTE = {
        imea: 'IMEA',
        grao_direto: 'Grao Direto',
        investing: 'Investing.com'
    };

    /* Mercado escolhido pelo leitor (vazio = todos) */
    let mercadoSelecionado = '';

    /* Todas as cotacoes publicadas (a memoria da pagina) */
    let cotacoes = [];

    /* Quantas cotacoes aparecem antes de pedir "carregar mais" */
    const COTACOES_POR_PAGINA = 24;

    /* Quantas cotacoes ja estao na tela */
    let cotacoesVisiveis = 0;

    /* --------------------------------------------------------------
     * Utilidades
     * -------------------------------------------------------------- */

    function elemento(tag, classe, texto) {
        const node = document.createElement(tag);
        if (classe) node.className = classe;
        if (texto !== undefined && texto !== null) node.textContent = texto;
        return node;
    }

    function icone(id) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'ic');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');

        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#' + id);

        svg.appendChild(use);
        return svg;
    }

    function limpar(node) {
        while (node && node.firstChild) node.removeChild(node.firstChild);
    }

    function numero(valor) {
        if (valor === null || valor === undefined || valor === '') return null;
        const n = Number(valor);
        return isNaN(n) ? null : n;
    }

    /* Data e hora no fuso de Mato Grosso: "12/11/2026 as 08:30" */
    function formatarDataHora(iso) {
        if (!iso) return '';
        const data = new Date(iso);
        if (isNaN(data.getTime())) return '';

        const local = new Date(data.getTime() + FUSO_QG);

        const dia = String(local.getUTCDate()).padStart(2, '0');
        const mes = String(local.getUTCMonth() + 1).padStart(2, '0');
        const ano = local.getUTCFullYear();
        const hora = String(local.getUTCHours()).padStart(2, '0');
        const minuto = String(local.getUTCMinutes()).padStart(2, '0');

        return dia + '/' + mes + '/' + ano + ' as ' + hora + ':' + minuto;
    }

    /* O preco, com o simbolo da moeda */
    function formatarPreco(valor, unidade) {
        const n = numero(valor);
        if (n === null) return '--';

        const texto = n.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4
        });

        const u = String(unidade || '');

        if (u.indexOf('US$') === 0) return 'US$ ' + texto;
        if (u.indexOf('¢') === 0) return '¢ ' + texto;
        if (u.indexOf('R$') === 0 || u.indexOf('BRL') === 0) return 'R$ ' + texto;

        return texto;
    }

    /* A unidade sem o simbolo da moeda (o preco ja traz a moeda) */
    function rotuloUnidade(unidade) {
        const u = String(unidade || '').trim();
        if (!u) return '';
        return u.replace(/^(R\$|US\$|BRL|¢)\s*/, '').trim();
    }

    function rotuloMercado(valor) {
        const achado = MERCADOS.find(item => item.valor === valor);
        return achado ? achado.rotulo : (valor || 'Cotacao');
    }

    /* --------------------------------------------------------------
     * Status (quando os numeros foram atualizados)
     * -------------------------------------------------------------- */

    function escreverStatus(texto) {
        const linha = document.getElementById('cotStatusTexto');
        if (linha) linha.textContent = texto;
    }

    function atualizarStatus(lista) {
        if (!lista.length) {
            escreverStatus('Nenhuma cotacao publicada ate agora.');
            return;
        }

        let maisRecente = '';
        const fontes = {};

        lista.forEach(item => {
            if (item.atualizado_em && item.atualizado_em > maisRecente) {
                maisRecente = item.atualizado_em;
            }
            if (item.fonte) fontes[item.fonte] = true;
        });

        const totalFontes = Object.keys(fontes).length;
        const quando = formatarDataHora(maisRecente);

        const texto = lista.length + (lista.length === 1 ? ' cotacao' : ' cotacoes') +
            ' de ' + totalFontes + (totalFontes === 1 ? ' fonte' : ' fontes') +
            (quando ? ' - atualizada' + (lista.length === 1 ? '' : 's') + ' em ' + quando : '');

        escreverStatus(texto + '.');
    }

    function atualizarResumoHero(lista) {
        const total = document.getElementById('cotHeroTotal');
        const fontes = document.getElementById('cotHeroFontes');
        const quando = document.getElementById('cotHeroAtualizado');

        const nomes = {};
        let maisRecente = '';

        lista.forEach(item => {
            if (item.fonte) nomes[item.fonte] = true;
            if (item.atualizado_em && item.atualizado_em > maisRecente) {
                maisRecente = item.atualizado_em;
            }
        });

        if (total) total.textContent = String(lista.length);
        if (fontes) fontes.textContent = String(Object.keys(nomes).length);
        if (quando) quando.textContent = maisRecente ? formatarDataHora(maisRecente) : '--';
    }

    /* --------------------------------------------------------------
     * Card de cotacao
     * -------------------------------------------------------------- */

    function criarCardCotacao(cotacao) {
        const card = elemento('article', 'cot-card');
        card.setAttribute('data-mercado', cotacao.mercado || '');

        /* Topo: mercado + fonte */
        const topo = elemento('header', 'cot-card-topo');
        topo.appendChild(elemento('span', 'cot-mercado', rotuloMercado(cotacao.mercado)));
        topo.appendChild(elemento('span', 'cot-fonte', ROTULO_FONTE[cotacao.fonte] || cotacao.fonte || ''));
        card.appendChild(topo);

        /* Produto e regiao */
        card.appendChild(elemento('h3', 'cot-produto', cotacao.produto || cotacao.simbolo || ''));

        if (cotacao.regiao) {
            card.appendChild(elemento('p', 'cot-regiao', cotacao.regiao));
        }

        /* Preco + unidade */
        const valor = elemento('p', 'cot-valor');
        valor.appendChild(elemento('span', 'cot-preco', formatarPreco(cotacao.preco, cotacao.unidade)));

        const unidade = rotuloUnidade(cotacao.unidade);
        if (unidade) valor.appendChild(elemento('span', 'cot-unidade', unidade));

        card.appendChild(valor);

        /* Variacao */
        const variacao = numero(cotacao.variacao);

        if (variacao !== null) {
            const caixa = elemento('div', 'cot-variacao');

            if (variacao > 0) {
                caixa.classList.add('cot-variacao-alta');
                caixa.appendChild(icone('ic-trend-up'));
            } else if (variacao < 0) {
                caixa.classList.add('cot-variacao-baixa');
                caixa.appendChild(icone('ic-trend-down'));
            } else {
                caixa.classList.add('cot-variacao-neutra');
                caixa.appendChild(icone('ic-chart'));
            }

            const texto = (variacao > 0 ? '+' : '') +
                variacao.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }) + '%';

            caixa.appendChild(elemento('span', 'cot-variacao-valor', texto));
            card.appendChild(caixa);
        } else {
            const absoluto = numero(cotacao.variacao_abs);

            if (absoluto !== null) {
                const caixa = elemento('div', 'cot-variacao cot-variacao-neutra');
                caixa.appendChild(icone('ic-chart'));
                caixa.appendChild(elemento('span', 'cot-variacao-valor',
                    (absoluto > 0 ? '+' : '') +
                    absoluto.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4
                    }) + (rotuloUnidade(cotacao.unidade) || '')));
                card.appendChild(caixa);
            }
        }

        /* Faixa de minimo/maximo (quando a fonte publica) */
        const minimo = numero(cotacao.preco_min);
        const maximo = numero(cotacao.preco_max);

        if (minimo !== null || maximo !== null) {
            const faixa = elemento('p', 'cot-faixa');

            if (minimo !== null) {
                faixa.appendChild(elemento('span', 'cot-faixa-item', 'Min ' +
                    formatarPreco(minimo, cotacao.unidade)));
            }

            if (maximo !== null) {
                faixa.appendChild(elemento('span', 'cot-faixa-item', 'Max ' +
                    formatarPreco(maximo, cotacao.unidade)));
            }

            card.appendChild(faixa);
        }

        /* Rodape: referencia + hora da coleta */
        const rodape = elemento('footer', 'cot-card-rodape');

        if (cotacao.referencia) {
            rodape.appendChild(elemento('span', 'cot-referencia', cotacao.referencia));
        }

        const horario = elemento('span', 'cot-atualizado');
        horario.appendChild(icone('ic-clock'));
        horario.appendChild(document.createTextNode(
            formatarDataHora(cotacao.atualizado_em) || 'sem data'
        ));
        rodape.appendChild(horario);

        card.appendChild(rodape);

        return card;
    }

    /* --------------------------------------------------------------
     * Filtro por mercado
     * -------------------------------------------------------------- */

    function lerMercadoDaUrl() {
        const parametros = new URLSearchParams(window.location.search);
        const bruto = (parametros.get('mercado') || '').trim();

        const achado = MERCADOS.find(item => item.valor === bruto);
        return achado ? achado.valor : '';
    }

    function escreverMercadoNaUrl() {
        const parametros = new URLSearchParams(window.location.search);

        if (mercadoSelecionado) parametros.set('mercado', mercadoSelecionado);
        else parametros.delete('mercado');

        const consulta = parametros.toString();
        const novaUrl = window.location.pathname +
            (consulta ? '?' + consulta : '') +
            window.location.hash;

        window.history.replaceState(null, '', novaUrl);
    }

    function criarChipMercado(valor, rotulo, total, selecionado) {
        const botao = elemento('button', 'filtro-chip');
        botao.type = 'button';
        botao.setAttribute('data-mercado', valor);
        botao.setAttribute('aria-pressed', selecionado ? 'true' : 'false');

        botao.appendChild(document.createTextNode(rotulo));
        botao.appendChild(elemento('span', 'filtro-chip-count', String(total)));

        return botao;
    }

    function montarChipsMercado() {
        const caixa = document.getElementById('cotChips');
        const bloco = document.getElementById('cotFiltro');

        if (!caixa) return;

        const contagem = {};

        cotacoes.forEach(item => {
            const chave = item.mercado || '';
            contagem[chave] = (contagem[chave] || 0) + 1;
        });

        limpar(caixa);

        caixa.appendChild(criarChipMercado(
            '',
            'Todas',
            cotacoes.length,
            !mercadoSelecionado
        ));

        MERCADOS.forEach(mercado => {
            const total = contagem[mercado.valor] || 0;
            const selecionado = mercadoSelecionado === mercado.valor;

            /* So entram os mercados que tem cotacao. O escolhido
               aparece sempre: sem o chip nao haveria como desmarcar. */
            if (!total && !selecionado) return;

            caixa.appendChild(criarChipMercado(
                mercado.valor,
                mercado.rotulo,
                total,
                selecionado
            ));
        });

        if (bloco) bloco.hidden = false;
    }

    function alternarMercado(valor) {
        mercadoSelecionado = (mercadoSelecionado === valor) ? '' : valor;

        montarChipsMercado();
        escreverMercadoNaUrl();
        desenharGrade();
    }

    function prepararFiltroMercado() {
        const caixa = document.getElementById('cotChips');
        if (!caixa) return;

        caixa.addEventListener('click', evento => {
            const botao = evento.target.closest('button[data-mercado]');
            if (!botao) return;

            alternarMercado(botao.getAttribute('data-mercado'));
        });

        caixa.addEventListener('keydown', evento => {
            if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return;

            const chips = Array.prototype.slice.call(
                caixa.querySelectorAll('button[data-mercado]')
            );

            const atual = chips.indexOf(document.activeElement);
            if (atual === -1) return;

            evento.preventDefault();

            const proximo = evento.key === 'ArrowRight'
                ? (atual + 1) % chips.length
                : (atual - 1 + chips.length) % chips.length;

            chips[proximo].focus();
        });
    }

    /* --------------------------------------------------------------
     * Grade
     * -------------------------------------------------------------- */

    function mostrarAviso(texto) {
        const grade = document.getElementById('cotGrid');
        if (!grade) return;

        limpar(grade);
        grade.appendChild(elemento('p', 'news-empty', texto));
    }

    function desenharGrade() {
        const grade = document.getElementById('cotGrid');
        if (!grade) return;

        const lista = mercadoSelecionado
            ? cotacoes.filter(item => item.mercado === mercadoSelecionado)
            : cotacoes;

        if (!lista.length) {
            cotacoesVisiveis = 0;
            mostrarAviso(cotacoes.length
                ? 'Nenhuma cotacao no filtro escolhido.'
                : 'Ainda nao publicamos cotacoes. Assim que a coleta do dia rodar, elas aparecem aqui.');
            atualizarBotaoMais(lista);
            return;
        }

        limpar(grade);

        /* A grade comeca com um bloco: o resto vem no "carregar mais" */
        const mostrar = Math.min(COTACOES_POR_PAGINA, lista.length);

        for (let i = 0; i < mostrar; i++) {
            grade.appendChild(criarCardCotacao(lista[i]));
        }

        cotacoesVisiveis = mostrar;
        atualizarBotaoMais(lista);
    }

    /* O botao so aparece quando ainda ha cotacao para carregar */
    function atualizarBotaoMais(lista) {
        const botao = document.getElementById('cotMais');
        if (!botao) return;

        const total = (lista || []).length;

        botao.hidden = total <= cotacoesVisiveis;
        botao.disabled = false;
        botao.textContent = 'Carregar mais cotações';
    }

    /* Acrescenta mais um bloco de cotacoes ao fim da grade */
    function carregarMaisCotacoes() {
        const grade = document.getElementById('cotGrid');
        if (!grade) return;

        const lista = mercadoSelecionado
            ? cotacoes.filter(item => item.mercado === mercadoSelecionado)
            : cotacoes;

        if (cotacoesVisiveis >= lista.length) return;

        const fim = Math.min(cotacoesVisiveis + COTACOES_POR_PAGINA, lista.length);

        for (let i = cotacoesVisiveis; i < fim; i++) {
            grade.appendChild(criarCardCotacao(lista[i]));
        }

        cotacoesVisiveis = fim;
        atualizarBotaoMais(lista);
    }

    function prepararBotaoMais() {
        const botao = document.getElementById('cotMais');
        if (!botao) return;

        botao.addEventListener('click', carregarMaisCotacoes);
    }

    /* --------------------------------------------------------------
     * SEO: o filtro muda o endereco, nao a pagina
     * -------------------------------------------------------------- */

    function atualizarSeo(temResultados) {
        const canonical = document.querySelector('link[rel="canonical"]');
        const robots = document.querySelector('meta[name="robots"]');

        const base = 'https://qgraos.com.br/cotacoes.html';
        const filtrada = mercadoSelecionado
            ? base + '?mercado=' + encodeURIComponent(mercadoSelecionado)
            : base;

        const semResultado = Boolean(mercadoSelecionado) && !temResultados;

        if (canonical) canonical.setAttribute('href', semResultado ? base : filtrada);
        if (robots) robots.setAttribute('content', semResultado ? 'noindex, follow' : 'index, follow');
    }

    /* --------------------------------------------------------------
     * Carga
     * -------------------------------------------------------------- */

    function carregarCotacoes() {
        const cliente = window.QGSupabase;

        if (!cliente || !cliente.isConfigured || !cliente.isConfigured()) {
            mostrarAviso('As cotacoes entram no ar em breve.');
            escreverStatus('As cotacoes entram no ar em breve.');
            return Promise.resolve([]);
        }

        const campos = 'fonte,mercado,simbolo,produto,regiao,preco,preco_max,preco_min,' +
            'variacao,variacao_abs,unidade,referencia,atualizado_em';

        const consulta = 'select=' + campos +
            '&publicado=eq.true' +
            '&order=mercado.asc,produto.asc' +
            '&limit=500';

        return cliente.select('cotacoes', consulta)
            .then(linhas => {
                cotacoes = Array.isArray(linhas) ? linhas : [];

                atualizarStatus(cotacoes);
                atualizarResumoHero(cotacoes);
                montarChipsMercado();
                desenharGrade();
                atualizarSeo(cotacoes.length > 0);

                return cotacoes;
            })
            .catch(erro => {
                console.warn('Q GRAOS: nao foi possivel carregar as cotacoes.', erro && erro.message);

                mostrarAviso('Nao foi possivel carregar as cotacoes agora.');
                escreverStatus('Nao foi possivel carregar as cotacoes agora.');
                atualizarSeo(false);

                return [];
            });
    }

    /* --------------------------------------------------------------
     * Inicio
     * -------------------------------------------------------------- */

    function iniciar() {
        if (!document.getElementById('cotGrid')) return;

        mercadoSelecionado = lerMercadoDaUrl();

        prepararFiltroMercado();
        prepararBotaoMais();
        carregarCotacoes();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
