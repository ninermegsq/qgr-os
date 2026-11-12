'use strict';

/* ------------------------------------------------------------------
 * Q GRAOS — Area de cotacoes (cotacoes.html)
 * ------------------------------------------------------------------
 * Le a tabela public.cotacoes (Supabase) e desenha o painel de precos.
 * Tudo e escrito com textContent: nenhum HTML vem do banco.
 *
 * O que a pagina mostra:
 *   - a linha de status (quando os numeros foram atualizados);
 *   - os filtros por mercado, por produto e por estado (com a
 *     contagem de cada opcao);
 *   - o card de cada cotacao (preco, variacao, unidade, regiao,
 *     fonte e hora da coleta);
 *   - o aviso honesto quando ainda nao existe nenhuma cotacao.
 *
 * A escolha dos filtros fica no endereco (?mercado=spot&produto=soja
 * &uf=MT), para a pagina poder ser linkada e compartilhada. Os tres
 * filtros se combinam: mercado + produto + estado.
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

    /* A regra de classificacao (produto e estado) vem do arquivo
       classificacao-cotacoes.js: e a mesma que o coletor grava no
       banco. Sem ele, os filtros de produto e estado nao aparecem. */
    const CLASSIFICACAO = window.QGClassificacao || null;

    /* Produtos e estados que o filtro oferece */
    const PRODUTOS = CLASSIFICACAO ? CLASSIFICACAO.PRODUTOS : [];
    const ESTADOS = CLASSIFICACAO ? CLASSIFICACAO.ESTADOS : [];

    /* Como o nome da fonte aparece no card */
    const ROTULO_FONTE = {
        imea: 'IMEA',
        grao_direto: 'Grao Direto',
        investing: 'Investing.com'
    };

    /* Mercado escolhido pelo leitor (vazio = todos) */
    let mercadoSelecionado = '';

    /* Produto escolhido pelo leitor (vazio = todos) */
    let produtoSelecionado = '';

    /* Estado escolhido pelo leitor (vazio = todos) */
    let estadoSelecionado = '';

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

    function rotuloProduto(valor) {
        if (!valor) return '';

        return CLASSIFICACAO ? CLASSIFICACAO.rotuloProduto(valor) : valor;
    }

    function rotuloEstado(valor) {
        if (!valor) return '';

        return CLASSIFICACAO ? CLASSIFICACAO.rotuloEstado(valor) : valor;
    }

    /* --------------------------------------------------------------
     * Status (quando os numeros foram atualizados)
     * -------------------------------------------------------------- */

    function escreverStatus(texto) {
        const linha = document.getElementById('cotStatusTexto');
        if (linha) linha.textContent = texto;
    }

    /* A linha de status: quantas cotações estão na tela, de quantas
       fontes e de quando são. Com filtro ligado, ela mostra também
       o que o leitor escolheu. */
    function atualizarStatus(lista, totalGeral) {
        if (!lista.length) {
            escreverStatus(cotacoes.length
                ? 'Nenhuma cotacao no filtro escolhido.'
                : 'Nenhuma cotacao publicada ate agora.');
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
        const descricao = descricaoFiltros();

        const partes = [];

        if (totalGeral && lista.length !== totalGeral) {
            partes.push('Mostrando ' + lista.length + ' de ' + totalGeral +
                (totalGeral === 1 ? ' cotacao' : ' cotacoes'));
        } else {
            partes.push(lista.length + (lista.length === 1 ? ' cotacao' : ' cotacoes'));
        }

        partes.push(totalFontes + (totalFontes === 1 ? ' fonte' : ' fontes'));

        if (descricao) partes.push(descricao);

        if (quando) {
            partes.push('atualizada' + (lista.length === 1 ? '' : 's') + ' em ' + quando);
        }

        escreverStatus(partes.join(' · ') + '.');
    }

    /* O que está escolhido no filtro (mercado, produto e estado) */
    function descricaoFiltros() {
        const partes = [];

        if (mercadoSelecionado) partes.push('mercado: ' + rotuloMercado(mercadoSelecionado));
        if (produtoSelecionado) partes.push('produto: ' + rotuloProduto(produtoSelecionado));
        if (estadoSelecionado) partes.push('estado: ' + rotuloEstado(estadoSelecionado));

        return partes.join(' · ');
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
        card.setAttribute('data-produto', cotacao.produtoChave || '');
        card.setAttribute('data-uf', cotacao.uf || '');

        /* Topo: mercado + fonte */
        const topo = elemento('header', 'cot-card-topo');
        topo.appendChild(elemento('span', 'cot-mercado', rotuloMercado(cotacao.mercado)));
        topo.appendChild(elemento('span', 'cot-fonte', ROTULO_FONTE[cotacao.fonte] || cotacao.fonte || ''));
        card.appendChild(topo);

        /* Produto e regiao */
        card.appendChild(elemento('h3', 'cot-produto', cotacao.produto || cotacao.simbolo || ''));

        /* Região e (quando existe) a sigla do estado */
        if (cotacao.regiao || cotacao.uf) {
            const regiao = elemento('p', 'cot-regiao');

            if (cotacao.regiao) regiao.appendChild(document.createTextNode(cotacao.regiao));
            if (cotacao.uf) regiao.appendChild(elemento('span', 'cot-uf', cotacao.uf));

            card.appendChild(regiao);
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
     * Filtros: mercado, produto e estado
     * --------------------------------------------------------------
     * Os tres filtros andam juntos: o leitor pode pedir "soja" e
     * "Mato Grosso" ao mesmo tempo. Cada chip mostra quantas cotacoes
     * continuam depois dos outros filtros — e por isso que a contagem
     * muda quando o leitor escolhe outra coisa.
     *
     * A escolha fica no endereco (?mercado=spot&produto=soja&uf=MT),
     * para a pagina poder ser linkada e compartilhada.
     * -------------------------------------------------------------- */

    function lerFiltrosDaUrl() {
        const parametros = new URLSearchParams(window.location.search);

        const mercado = (parametros.get('mercado') || '').trim();
        const produto = (parametros.get('produto') || '').trim();
        const uf = (parametros.get('uf') || '').trim().toUpperCase();

        return {
            mercado: MERCADOS.some(item => item.valor === mercado) ? mercado : '',
            produto: PRODUTOS.some(item => item.valor === produto) ? produto : '',
            uf: ESTADOS.some(item => item.valor === uf) ? uf : ''
        };
    }

    function escreverFiltrosNaUrl() {
        const parametros = new URLSearchParams(window.location.search);

        if (mercadoSelecionado) parametros.set('mercado', mercadoSelecionado);
        else parametros.delete('mercado');

        if (produtoSelecionado) parametros.set('produto', produtoSelecionado);
        else parametros.delete('produto');

        if (estadoSelecionado) parametros.set('uf', estadoSelecionado);
        else parametros.delete('uf');

        const consulta = parametros.toString();
        const novaUrl = window.location.pathname +
            (consulta ? '?' + consulta : '') +
            window.location.hash;

        window.history.replaceState(null, '', novaUrl);
    }

    /* O valor de cada dimensao (serve para contar e para filtrar) */
    function valorDaDimensao(cotacao, dimensao) {
        if (dimensao === 'mercado') return cotacao.mercado || '';
        if (dimensao === 'produto') return cotacao.produtoChave || '';

        return cotacao.uf || '';
    }

    /* A cotacao passa pelo filtro? "ignorar" deixa uma dimensao de
       fora da conta — e assim que se conta as opcoes de cada chip. */
    function combina(cotacao, filtros, ignorar) {
        if (ignorar !== 'mercado' && filtros.mercado &&
            cotacao.mercado !== filtros.mercado) return false;

        if (ignorar !== 'produto' && filtros.produto &&
            (cotacao.produtoChave || '') !== filtros.produto) return false;

        if (ignorar !== 'uf' && filtros.uf &&
            (cotacao.uf || '') !== filtros.uf) return false;

        return true;
    }

    function dimensoes() {
        return {
            mercado: mercadoSelecionado,
            produto: produtoSelecionado,
            uf: estadoSelecionado
        };
    }

    /* A lista que o leitor esta vendo agora */
    function cotacoesFiltradas() {
        const filtros = dimensoes();

        return cotacoes.filter(item => combina(item, filtros, ''));
    }

    /* Quantas cotacoes cada opcao mostra (contando so as que passam
       pelos outros filtros) */
    function contarPor(dimensao) {
        const filtros = dimensoes();
        const contagem = {};

        cotacoes.forEach(item => {
            if (!combina(item, filtros, dimensao)) return;

            const chave = valorDaDimensao(item, dimensao);
            contagem[chave] = (contagem[chave] || 0) + 1;
        });

        return contagem;
    }

    function totalDaDimensao(dimensao) {
        const filtros = dimensoes();

        return cotacoes.filter(item => combina(item, filtros, dimensao)).length;
    }

    function criarChip(dimensao, valor, rotulo, total, selecionado) {
        const botao = elemento('button', 'filtro-chip');
        botao.type = 'button';
        botao.setAttribute('data-' + dimensao, valor);
        botao.setAttribute('aria-pressed', selecionado ? 'true' : 'false');

        botao.appendChild(document.createTextNode(rotulo));
        botao.appendChild(elemento('span', 'filtro-chip-count', String(total)));

        return botao;
    }

    function montarChipsMercado() {
        const caixa = document.getElementById('cotChips');
        const bloco = document.getElementById('cotFiltro');

        if (!caixa) return;

        const contagem = contarPor('mercado');

        limpar(caixa);

        caixa.appendChild(criarChip(
            'mercado',
            '',
            'Todas',
            totalDaDimensao('mercado'),
            !mercadoSelecionado
        ));

        MERCADOS.forEach(mercado => {
            const total = contagem[mercado.valor] || 0;
            const selecionado = mercadoSelecionado === mercado.valor;

            /* So entram os mercados que tem cotacao. O escolhido
               aparece sempre: sem o chip nao haveria como desmarcar. */
            if (!total && !selecionado) return;

            caixa.appendChild(criarChip(
                'mercado',
                mercado.valor,
                mercado.rotulo,
                total,
                selecionado
            ));
        });

        if (bloco) bloco.hidden = false;
    }

    function montarChipsProduto() {
        const caixa = document.getElementById('cotChipsProduto');
        const bloco = document.getElementById('cotFiltroProduto');

        if (!caixa || !PRODUTOS.length) return;

        const contagem = contarPor('produto');

        limpar(caixa);

        caixa.appendChild(criarChip(
            'produto',
            '',
            'Todos',
            totalDaDimensao('produto'),
            !produtoSelecionado
        ));

        let quantos = 0;

        PRODUTOS.forEach(produto => {
            const total = contagem[produto.valor] || 0;
            const selecionado = produtoSelecionado === produto.valor;

            if (!total && !selecionado) return;

            quantos++;

            caixa.appendChild(criarChip(
                'produto',
                produto.valor,
                produto.rotulo,
                total,
                selecionado
            ));
        });

        /* Sem produto nenhum, o bloco fica escondido */
        if (bloco) bloco.hidden = quantos === 0;
    }

    function montarChipsEstado() {
        const caixa = document.getElementById('cotChipsEstado');
        const bloco = document.getElementById('cotFiltroEstado');

        if (!caixa || !ESTADOS.length) return;

        const contagem = contarPor('uf');

        limpar(caixa);

        caixa.appendChild(criarChip(
            'uf',
            '',
            'Todos',
            totalDaDimensao('uf'),
            !estadoSelecionado
        ));

        let quantos = 0;

        ESTADOS.forEach(estado => {
            const total = contagem[estado.valor] || 0;
            const selecionado = estadoSelecionado === estado.valor;

            if (!total && !selecionado) return;

            quantos++;

            caixa.appendChild(criarChip(
                'uf',
                estado.valor,
                estado.rotulo,
                total,
                selecionado
            ));
        });

        if (bloco) bloco.hidden = quantos === 0;
    }

    function montarChips() {
        montarChipsMercado();
        montarChipsProduto();
        montarChipsEstado();
    }

    function alternarFiltro(dimensao, valor) {
        if (dimensao === 'mercado') {
            mercadoSelecionado = (mercadoSelecionado === valor) ? '' : valor;
        } else if (dimensao === 'produto') {
            produtoSelecionado = (produtoSelecionado === valor) ? '' : valor;
        } else {
            estadoSelecionado = (estadoSelecionado === valor) ? '' : valor;
        }

        montarChips();
        escreverFiltrosNaUrl();
        desenharGrade();
    }

    function prepararFiltro(idCaixa, dimensao) {
        const caixa = document.getElementById(idCaixa);
        if (!caixa) return;

        const seletor = 'button[data-' + dimensao + ']';

        caixa.addEventListener('click', evento => {
            const alvo = evento.target;
            if (!alvo || !alvo.closest) return;

            const botao = alvo.closest(seletor);
            if (!botao) return;

            alternarFiltro(dimensao, botao.getAttribute('data-' + dimensao));
        });

        caixa.addEventListener('keydown', evento => {
            if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return;

            const chips = Array.prototype.slice.call(caixa.querySelectorAll(seletor));

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

        const lista = cotacoesFiltradas();

        if (!lista.length) {
            cotacoesVisiveis = 0;
            mostrarAviso(cotacoes.length
                ? 'Nenhuma cotacao no filtro escolhido.'
                : 'Ainda nao publicamos cotacoes. Assim que a coleta do dia rodar, elas aparecem aqui.');
            atualizarBotaoMais(lista);
            atualizarStatus(lista, cotacoes.length);
            atualizarSeo(lista.length > 0);
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
        atualizarStatus(lista, cotacoes.length);
        atualizarSeo(true);
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

        const lista = cotacoesFiltradas();

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
        const parametros = [];

        if (mercadoSelecionado) parametros.push('mercado=' + encodeURIComponent(mercadoSelecionado));
        if (produtoSelecionado) parametros.push('produto=' + encodeURIComponent(produtoSelecionado));
        if (estadoSelecionado) parametros.push('uf=' + encodeURIComponent(estadoSelecionado));

        const filtrada = parametros.length ? base + '?' + parametros.join('&') : base;
        const temFiltro = parametros.length > 0;
        const semResultado = temFiltro && !temResultados;

        if (canonical) canonical.setAttribute('href', semResultado ? base : filtrada);
        if (robots) {
            robots.setAttribute('content', semResultado
                ? 'noindex, follow'
                : 'index, follow, max-image-preview:large');
        }
    }

    /* --------------------------------------------------------------
     * Carga
     * -------------------------------------------------------------- */

    /* As colunas do banco. As duas do filtro (produto_chave e uf) so
       existem depois da migration; se o banco ainda nao tiver, a
       pagina usa a regra local (classificacao-cotacoes.js). */
    const CAMPOS = 'fonte,mercado,simbolo,produto,produto_chave,uf,regiao,preco,preco_max,preco_min,' +
        'variacao,variacao_abs,unidade,referencia,atualizado_em';

    const CAMPOS_SEM_CLASSIFICACAO = 'fonte,mercado,simbolo,produto,regiao,preco,preco_max,preco_min,' +
        'variacao,variacao_abs,unidade,referencia,atualizado_em';

    /* Cada linha ganha a chave do produto e a sigla do estado: o
       banco e a fonte; a regra local e a reserva. */
    function classificar(linhas) {
        return linhas.map(linha => {
            linha.produtoChave = linha.produto_chave ||
                (CLASSIFICACAO ? CLASSIFICACAO.chaveProduto(linha.produto) : '');

            linha.uf = linha.uf ||
                (CLASSIFICACAO ? CLASSIFICACAO.chaveEstado(linha.fonte, linha.regiao) : '');

            return linha;
        });
    }

    function carregarCotacoes() {
        const cliente = window.QGSupabase;

        if (!cliente || !cliente.isConfigured || !cliente.isConfigured()) {
            mostrarAviso('As cotacoes entram no ar em breve.');
            escreverStatus('As cotacoes entram no ar em breve.');
            return Promise.resolve([]);
        }

        const consulta = campos => 'select=' + campos +
            '&publicado=eq.true' +
            '&order=mercado.asc,produto.asc' +
            '&limit=500';

        return cliente.select('cotacoes', consulta(CAMPOS))
            .catch(erro => {
                /* Banco sem as colunas do filtro: a pagina continua
                   funcionando, classificando o nome aqui. */
                const mensagem = String((erro && erro.message) || '');

                if (!/produto_chave|\bcoluna\b|\bcolumn\b/i.test(mensagem)) throw erro;

                console.warn('Q GRAOS: o banco ainda nao tem produto_chave/uf; usando a regra local.');

                return cliente.select('cotacoes', consulta(CAMPOS_SEM_CLASSIFICACAO));
            })
            .then(linhas => {
                cotacoes = classificar(Array.isArray(linhas) ? linhas : []);

                /* Nada mudou desde a ultima vez: nao redesenha a
                   grade (o leitor nao perde o que ja estava
                   carregando). */
                const assinatura = assinaturaDasCotacoes(cotacoes);

                if (assinatura && assinatura === assinaturaAtual) return cotacoes;

                assinaturaAtual = assinatura;

                /* Quantas cotacoes estavam na tela: ao redesenhar, a
                   grade volta para o primeiro bloco. */
                const visiveisAntes = cotacoesVisiveis;

                atualizarResumoHero(cotacoes);
                montarChips();
                desenharGrade();

                /* Devolve o leitor ao bloco em que ele estava (o
                   "carregar mais" continua valendo depois da
                   atualizacao). */
                const alvo = Math.min(visiveisAntes, cotacoesFiltradas().length);

                while (cotacoesVisiveis < alvo) {
                    carregarMaisCotacoes();
                }

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
     * Atualizacao automatica
     * --------------------------------------------------------------
     * A coleta roda no servidor (GitHub Actions). A pagina so le o
     * banco: de tempos em tempos ela pergunta de novo para o leitor
     * ver o preco novo sem precisar recarregar a pagina.
     *
     * De quanto em quanto: 5 minutos. E o mesmo intervalo do painel
     * do GitHub: se o preco mudou no servidor, a aba aberta mostra
     * em poucos minutos.
     *
     * A aba parada (escondida) nao gasta consulta: o relogio so
     * roda quando a aba esta a vista. */

    const INTERVALO_ATUALIZACAO_MS = 5 * 60 * 1000;

    /* Assinatura do que esta na tela: serve para saber se algo
       mudou de verdade antes de redesenhar a grade. */
    let assinaturaAtual = '';

    function assinaturaDasCotacoes(lista) {
        return (lista || []).map(item => [
            item.simbolo || '',
            item.preco === null || item.preco === undefined ? '' : item.preco,
            item.atualizado_em || ''
        ].join(':')).join('|');
    }

    function iniciarAtualizacaoAutomatica() {
        if (typeof window.setInterval !== 'function') return;

        window.setInterval(() => {
            if (document.hidden) return;

            carregarCotacoes();
        }, INTERVALO_ATUALIZACAO_MS);

        /* Volta para a aba: confere se ha preco novo na hora. */
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) return;

            carregarCotacoes();
        });
    }

    /* --------------------------------------------------------------
     * Inicio
     * -------------------------------------------------------------- */

    function iniciar() {
        if (!document.getElementById('cotGrid')) return;

        const filtros = lerFiltrosDaUrl();

        mercadoSelecionado = filtros.mercado;
        produtoSelecionado = filtros.produto;
        estadoSelecionado = filtros.uf;

        prepararFiltro('cotChips', 'mercado');
        prepararFiltro('cotChipsProduto', 'produto');
        prepararFiltro('cotChipsEstado', 'uf');
        prepararBotaoMais();
        carregarCotacoes();
        iniciarAtualizacaoAutomatica();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
