'use strict';

/* ------------------------------------------------------------------
 * Q GRAOS — painel administrativo (notícias, leads e visitas)
 * ------------------------------------------------------------------
 * Painel 100% estático: conversa com o Supabase pela API REST usando
 * o cliente local `supabase-api.js` (sem SDK, sem CDN).
 *
 * O acesso é controlado por três camadas:
 *   1. login no Supabase Auth (e-mail + senha);
 *   2. o usuário precisa estar na tabela `administradores`;
 *   3. a RLS do banco só libera leitura/escrita para administradores.
 * ------------------------------------------------------------------ */

(function () {
    const api = window.QGSupabase;

    const STATUS_LEAD = ['novo', 'em_andamento', 'convertido', 'descartado'];

    const ROTULO_TIPO = {
        pageview: 'Pageview',
        secao: 'Seção vista',
        clique_whatsapp: 'Clique no WhatsApp',
        clique_telefone: 'Clique no telefone',
        clique_email: 'Clique no e-mail',
        abrir_formulario: 'Abriu o formulário',
        lead_enviado: 'Lead enviado',
        clique_noticia: 'Clique na notícia'
    };

    const ROTULO_FORMATO = {
        faixa: 'Faixa (banner)',
        card: 'Card patrocinado'
    };

    const ROTULO_POSICAO = {
        noticias: 'Lista de notícias',
        noticia: 'Fim da matéria'
    };

    /* Como a fonte e o mercado aparecem no painel */
    const ROTULO_FONTE_COTACAO = {
        imea: 'IMEA',
        grao_direto: 'Grão Direto',
        investing: 'Investing.com'
    };

    const ROTULO_MERCADO_COTACAO = {
        spot: 'Preço físico (MT)',
        regional: 'Regional',
        futuros: 'Chicago (CBOT)',
        b3: 'B3',
        fx: 'Dólar',
        macro: 'Macro'
    };

    const ROTULO_STATUS_FONTE = {
        ok: 'Ok',
        erro: 'Erro',
        pendente: 'Pendente'
    };

    /* Limite do resumo: o banco recusa textos maiores (CHECK de 320) */
    const LIMITE_RESUMO = 320;

    const ROTULO_CATEGORIA = {
        Geral: 'Geral',
        Soja: 'Soja',
        Milho: 'Milho',
        Sorgo: 'Sorgo',
        Milheto: 'Milheto',
        Feijao: 'Feijão',
        Gergelim: 'Gergelim',
        Safra: 'Safra',
        Logistica: 'Logística',
        Mercado: 'Mercado',
        Exportacao: 'Exportação'
    };

    /* ---------- Atalhos de DOM ---------- */

    const byId = id => document.getElementById(id);

    // Separador entre dois botoes na mesma celula.
    // Precisa ser um no de texto: appendChild nao aceita string.
    const espaco = () => document.createTextNode(' ');

    function criar(tag, props, filhos) {
        const elemento = document.createElement(tag);

        Object.keys(props || {}).forEach(chave => {
            const valor = props[chave];

            if (chave === 'texto') {
                elemento.textContent = valor;
            } else if (chave === 'classe') {
                elemento.className = valor;
            } else if (chave === 'textoHtml') {
                // Só usado com texto fixo do próprio painel (nunca dado do usuário)
                elemento.innerHTML = valor;
            } else if (valor === true || valor === false) {
                if (valor) elemento.setAttribute(chave, '');
            } else {
                elemento.setAttribute(chave, valor);
            }
        });

        (filhos || []).forEach(filho => {
            if (filho) elemento.appendChild(filho);
        });

        return elemento;
    }

    function limpar(elemento) {
        while (elemento.firstChild) elemento.removeChild(elemento.firstChild);
    }

    function formatarData(iso) {
        if (!iso) return '—';
        const data = new Date(iso);
        if (isNaN(data.getTime())) return '—';

        const dia = String(data.getDate()).padStart(2, '0');
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const ano = data.getFullYear();
        const hora = String(data.getHours()).padStart(2, '0');
        const minuto = String(data.getMinutes()).padStart(2, '0');

        return dia + '/' + mes + '/' + ano + ' ' + hora + ':' + minuto;
    }

    function formatarDiaCurto(iso) {
        if (!iso) return '';
        const data = new Date(iso);
        if (isNaN(data.getTime())) return '';
        return String(data.getDate()).padStart(2, '0') + '/' + String(data.getMonth() + 1).padStart(2, '0');
    }

    function mostrarAlerta(elemento, mensagem, tipo) {
        if (!elemento) return;

        if (!mensagem) {
            elemento.hidden = true;
            elemento.textContent = '';
            elemento.className = 'alert';
            return;
        }

        elemento.hidden = false;
        elemento.textContent = mensagem;
        elemento.className = 'alert' + (tipo ? ' ' + tipo : '');
    }

    /* ---------- Estado ---------- */

    const estado = {
        leads: [],
        noticias: [],
        anuncios: [],
        cotacoes: [],
        cotacoesFontes: [],
        filtroLeads: ''
    };

    /* ---------- Login ---------- */

    function mostrarLogin() {
        byId('loginScreen').hidden = false;
        byId('app').hidden = true;
    }

    function mostrarApp() {
        byId('loginScreen').hidden = true;
        byId('app').hidden = false;

        const usuario = api.getUser();
        byId('userEmail').textContent = usuario && usuario.email ? usuario.email : '';
    }

    function verificarConfiguracao() {
        const alerta = byId('loginConfigAlert');

        if (!api) {
            mostrarAlerta(alerta, 'O arquivo ../supabase-api.js não foi carregado.', 'warning');
            byId('loginButton').disabled = true;
            return;
        }

        if (!api.isConfigured()) {
            mostrarAlerta(
                alerta,
                'Supabase não configurado: preencha "supabase.anonKey" em site.config.js.',
                'warning'
            );
            byId('loginButton').disabled = true;
        }
    }

    async function entrar(evento) {
        evento.preventDefault();

        const alerta = byId('loginAlert');
        const botao = byId('loginButton');

        mostrarAlerta(alerta, '');
        botao.disabled = true;
        botao.textContent = 'Entrando...';

        try {
            const email = byId('loginEmail').value.trim();
            const senha = byId('loginPassword').value;

            await api.signIn(email, senha);

            const admin = await verificarAdministrador();

            if (!admin) {
                api.signOut();
                mostrarAlerta(
                    alerta,
                    'Este usuário não está cadastrado como administrador da Q GRÃOS.',
                    'warning'
                );
                return;
            }

            byId('loginPassword').value = '';
            mostrarApp();
            await carregarTudo();
        } catch (erro) {
            mostrarAlerta(alerta, mensagemDeErro(erro));
        } finally {
            botao.disabled = false;
            botao.textContent = 'Entrar';
        }
    }

    function mensagemDeErro(erro) {
        const texto = (erro && erro.message) ? erro.message : 'Erro inesperado.';

        if (/invalid login credentials/i.test(texto)) {
            return 'E-mail ou senha inválidos.';
        }
        if (/Failed to fetch|NetworkError|load failed/i.test(texto)) {
            return 'Não foi possível falar com o Supabase. Verifique a URL, a chave e a sua conexão.';
        }

        return texto;
    }

    async function verificarAdministrador() {
        const usuario = api.getUser();

        if (!usuario || !usuario.id) return false;

        const linhas = await api.select(
            'administradores',
            'user_id=eq.' + encodeURIComponent(usuario.id) + '&select=user_id,email,nome,ativo&limit=1'
        );

        return Array.isArray(linhas) && linhas.length > 0 && linhas[0].ativo !== false;
    }

    function sair() {
        api.signOut();
        mostrarLogin();
    }

    /* ---------- Abas ---------- */

    function ativarAba(nome) {
        document.querySelectorAll('.tab').forEach(botao => {
            const ativo = botao.getAttribute('data-tab') === nome;
            botao.classList.toggle('active', ativo);
            botao.setAttribute('aria-selected', ativo ? 'true' : 'false');
        });

        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.hidden = panel.id !== 'tab-' + nome;
        });

        if (nome === 'noticias') carregarNoticias();
        if (nome === 'leads') carregarLeads();
        if (nome === 'visitas') carregarVisitas();
        if (nome === 'anuncios') carregarAnuncios();
        if (nome === 'cotacoes') carregarCotacoes();
        if (nome === 'resumo') carregarResumo();
    }

    /* ---------- Resumo ---------- */

    function cartao(valor, rotulo, destaque) {
        return criar('div', { classe: 'stat' + (destaque ? ' gold' : '') }, [
            criar('div', { classe: 'value', texto: String(valor) }),
            criar('div', { classe: 'label', texto: rotulo })
        ]);
    }

    async function carregarResumo() {
        const cartoes = byId('cardsResumo');

        try {
            const linhas = await api.select('vw_painel_resumo', 'limit=1');
            const resumo = (linhas && linhas[0]) || {};

            limpar(cartoes);
            cartoes.appendChild(cartao(resumo.total_leads || 0, 'Leads no total'));
            cartoes.appendChild(cartao(resumo.leads_novos || 0, 'Leads novos', true));
            cartoes.appendChild(cartao(resumo.leads_30d || 0, 'Leads (30 dias)'));
            cartoes.appendChild(cartao(resumo.total_pageviews || 0, 'Visitas ao site'));
            cartoes.appendChild(cartao(resumo.pageviews_30d || 0, 'Visitas (30 dias)'));
            cartoes.appendChild(cartao(resumo.visitantes || 0, 'Visitantes únicos'));
            cartoes.appendChild(cartao(resumo.noticias_publicadas || 0, 'Notícias publicadas'));

            const porDia = await api.select('vw_leads_por_dia', 'order=dia.desc&limit=14');
            const visitasPorDia = await api.select('vw_visitas_por_dia', 'order=dia.desc&limit=14');

            montarGrafico(byId('chartLeads'), (porDia || []).slice().reverse(), 'leads');
            montarGrafico(byId('chartVisitas'), (visitasPorDia || []).slice().reverse(), 'pageviews');
        } catch (erro) {
            limpar(cartoes);
            cartoes.appendChild(criar('div', { classe: 'stat', texto: 'Não foi possível carregar o resumo: ' + mensagemDeErro(erro) }));
        }
    }

    function montarGrafico(container, linhas, campo) {
        limpar(container);

        if (!linhas || !linhas.length) {
            container.appendChild(criar('p', { classe: 'empty', texto: 'Sem dados no período.' }));
            return;
        }

        const maximo = linhas.reduce((maior, linha) => Math.max(maior, Number(linha[campo]) || 0), 0) || 1;

        linhas.forEach(linha => {
            const valor = Number(linha[campo]) || 0;
            const altura = Math.round((valor / maximo) * 100);
            const coluna = criar('div', { classe: 'bar-col' }, [
                criar('span', { classe: 'bar-value', texto: String(valor) }),
                criar('div', {
                    classe: 'bar' + (campo === 'pageviews' ? ' alt' : ''),
                    style: 'height:' + Math.max(altura, 2) + '%'
                }),
                criar('span', { classe: 'bar-label', texto: formatarDiaCurto(linha.dia) })
            ]);

            container.appendChild(coluna);
        });
    }

    /* ---------- Notícias ---------- */

    async function carregarNoticias() {
        const corpo = byId('newsTableBody');
        const vazio = byId('newsEmpty');

        try {
            const linhas = await api.select(
                'noticias',
                'select=id,titulo,resumo,conteudo,categoria,fonte,url,imagem_url,publicado,destaque,cliques,visualizacoes,publicado_em&order=publicado_em.desc,criado_em.desc&limit=200'
            );

            estado.noticias = linhas || [];
            limpar(corpo);

            if (!estado.noticias.length) {
                vazio.hidden = false;
                return;
            }

            vazio.hidden = true;

            estado.noticias.forEach(noticia => {
                const acaoEditar = criar('button', {
                    type: 'button',
                    classe: 'btn ghost small',
                    texto: 'Editar',
                    'aria-label': 'Editar ' + noticia.titulo
                });
                acaoEditar.addEventListener('click', () => preencherFormularioNoticia(noticia));

                const acaoExcluir = criar('button', {
                    type: 'button',
                    classe: 'btn danger',
                    texto: 'Excluir'
                });
                acaoExcluir.addEventListener('click', () => excluirNoticia(noticia));

                corpo.appendChild(criar('tr', {}, [
                    criar('td', { classe: 'wrap' }, [
                        criar('strong', { texto: noticia.titulo }),
                        noticia.fonte ? criar('div', { texto: noticia.fonte, style: 'color:#6B6B6B;font-size:0.82rem' }) : null,
                        criar('div', {
                            texto: noticia.conteudo ? 'Texto completo publicado' : 'Sem texto completo (só resumo)',
                            style: 'color:#6B6B6B;font-size:0.82rem'
                        })
                    ]),
                    criar('td', {}, [criar('span', {
                        classe: 'pill',
                        texto: ROTULO_CATEGORIA[noticia.categoria] || noticia.categoria
                    })]),
                    criar('td', { texto: formatarData(noticia.publicado_em) }),
                    criar('td', { texto: String(noticia.visualizacoes || 0) }),
                    criar('td', { texto: String(noticia.cliques || 0) }),
                    criar('td', {}, [acaoEditar, espaco(), acaoExcluir])
                ]));
            });
        } catch (erro) {
            limpar(corpo);
            corpo.appendChild(criar('tr', {}, [
                criar('td', { colSpan: '6', texto: 'Erro ao carregar: ' + mensagemDeErro(erro) })
            ]));
        }
    }

    function preencherFormularioNoticia(noticia) {
        byId('newsId').value = noticia.id;
        byId('newsTitle').value = noticia.titulo || '';
        byId('newsSummary').value = noticia.resumo || '';
        byId('newsContent').value = noticia.conteudo || '';
        byId('newsCategory').value = noticia.categoria || 'Geral';
        byId('newsSource').value = noticia.fonte || '';
        byId('newsUrl').value = noticia.url || '';
        byId('newsImage').value = noticia.imagem_url || '';
        byId('newsPublished').checked = noticia.publicado === true;
        byId('newsFeatured').checked = noticia.destaque === true;

        byId('newsFormTitle').textContent = 'Editar notícia';
        byId('newsSubmit').textContent = 'Salvar alterações';
        byId('newsResetButton').hidden = false;
        mostrarAlerta(byId('newsAlert'), '');
        atualizarContadorResumo();

        byId('newsTitle').focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function limparFormularioNoticia() {
        byId('newsForm').reset();
        byId('newsId').value = '';
        byId('newsPublished').checked = true;
        byId('newsFormTitle').textContent = 'Publicar notícia';
        byId('newsSubmit').textContent = 'Publicar notícia';
        byId('newsResetButton').hidden = true;
        mostrarAlerta(byId('newsAlert'), '');
        atualizarContadorResumo();
    }

    /* ---------- Contador do resumo ---------- */

    function atualizarContadorResumo() {
        const campo = byId('newsSummary');
        const contador = byId('newsSummaryCount');

        if (!campo || !contador) return;

        const tamanho = campo.value.trim().length;

        contador.textContent = tamanho + ' de ' + LIMITE_RESUMO + ' caracteres';
        contador.className = 'field-hint';

        if (tamanho > LIMITE_RESUMO) {
            contador.className = 'field-hint erro';
            contador.textContent = tamanho + ' de ' + LIMITE_RESUMO +
                ' caracteres: passou do limite do card. Encurte antes de publicar.';
        } else if (tamanho > LIMITE_RESUMO - 40) {
            contador.className = 'field-hint aviso';
        }
    }

    async function salvarNoticia(evento) {
        evento.preventDefault();

        const alerta = byId('newsAlert');
        const botao = byId('newsSubmit');

        mostrarAlerta(alerta, '');
        botao.disabled = true;

        const id = byId('newsId').value.trim();

        const dados = {
            titulo: byId('newsTitle').value.trim(),
            resumo: byId('newsSummary').value.trim(),
            conteudo: byId('newsContent').value.trim(),
            categoria: byId('newsCategory').value,
            fonte: byId('newsSource').value.trim(),
            url: byId('newsUrl').value.trim(),
            imagem_url: byId('newsImage').value.trim(),
            publicado: byId('newsPublished').checked,
            destaque: byId('newsFeatured').checked
        };

        if (dados.titulo.length < 3) {
            mostrarAlerta(alerta, 'O título precisa de pelo menos 3 caracteres.');
            botao.disabled = false;
            return;
        }

        if (dados.resumo.length > LIMITE_RESUMO) {
            mostrarAlerta(alerta,
                'O resumo tem ' + dados.resumo.length + ' caracteres. O card aceita até ' +
                LIMITE_RESUMO + '.');
            botao.disabled = false;
            return;
        }

        try {
            if (id) {
                await api.update('noticias', 'id=eq.' + encodeURIComponent(id), dados);
                mostrarAlerta(alerta, 'Notícia atualizada.', 'ok');
            } else {
                await api.insert('noticias', dados);
                mostrarAlerta(alerta, 'Notícia publicada.', 'ok');
            }

            limparFormularioNoticia();
            await carregarNoticias();
            await carregarResumo();
        } catch (erro) {
            mostrarAlerta(alerta, 'Erro ao salvar: ' + mensagemDeErro(erro));
        } finally {
            botao.disabled = false;
        }
    }

    async function excluirNoticia(noticia) {
        if (!window.confirm('Excluir a notícia "' + noticia.titulo + '"? Esta ação não pode ser desfeita.')) {
            return;
        }

        try {
            await api.remove('noticias', 'id=eq.' + encodeURIComponent(noticia.id));
            await carregarNoticias();
            await carregarResumo();
        } catch (erro) {
            window.alert('Erro ao excluir: ' + mensagemDeErro(erro));
        }
    }

    /* ---------- Anúncios ---------- */

    /* Número do formulário: vazio vira null (sem cota) */
    function numeroOuNulo(valor) {
        const texto = String(valor === null || valor === undefined ? '' : valor).trim();
        if (!texto) return null;

        const numero = Number(texto);
        if (isNaN(numero) || numero < 0) return null;

        return Math.floor(numero);
    }

    function dataParaCampo(iso) {
        if (!iso) return '';

        const data = new Date(iso);
        if (isNaN(data.getTime())) return '';

        const dia = String(data.getDate()).padStart(2, '0');
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const ano = data.getFullYear();

        return ano + '-' + mes + '-' + dia;
    }

    function inicioParaIso(valor) {
        if (!valor) return null;

        const data = new Date(valor + 'T00:00:00');
        if (isNaN(data.getTime())) return null;

        return data.toISOString();
    }

    function fimParaIso(valor) {
        if (!valor) return null;

        const data = new Date(valor + 'T23:59:59');
        if (isNaN(data.getTime())) return null;

        return data.toISOString();
    }

    function anuncioNoPrazo(anuncio) {
        const agora = Date.now();
        const inicio = anuncio.inicio_em ? new Date(anuncio.inicio_em).getTime() : null;
        const fim = anuncio.fim_em ? new Date(anuncio.fim_em).getTime() : null;

        if (inicio !== null && agora < inicio) return false;
        if (fim !== null && agora > fim) return false;

        return true;
    }

    async function carregarAnuncios() {
        const corpo = byId('adTableBody');
        const vazio = byId('adEmpty');

        /* A visao de desempenho traz as impressões de hoje e a cota
           restante. As consultas abaixo sao reservas: se o banco ainda
           nao tiver a visao (ou as colunas novas), o painel continua
           funcionando com o que existe. */
        const tentativas = [
            ['vw_anuncios_desempenho',
                'select=id,titulo,empresa,texto,url,imagem_url,posicao,formato,publicado,prioridade,peso,' +
                'impressoes,impressoes_hoje,cliques,autorizacao,inicio_em,fim_em,limite_impressoes,' +
                'limite_impressoes_dia,cota_esgotada,criado_em&order=prioridade.desc,criado_em.desc&limit=200'],
            ['anuncios',
                'select=id,titulo,empresa,texto,url,imagem_url,posicao,formato,publicado,prioridade,peso,' +
                'impressoes,cliques,autorizacao,inicio_em,fim_em,limite_impressoes,limite_impressoes_dia,' +
                'criado_em&order=prioridade.desc,criado_em.desc&limit=200'],
            ['anuncios',
                'select=id,titulo,empresa,texto,url,imagem_url,posicao,formato,publicado,prioridade,' +
                'impressoes,cliques,autorizacao,inicio_em,fim_em,criado_em&order=prioridade.desc,criado_em.desc&limit=200']
        ];

        let linhas = null;
        let ultimoErro = null;

        for (const tentativa of tentativas) {
            try {
                const resultado = await api.select(tentativa[0], tentativa[1]);
                linhas = resultado || [];
                break;
            } catch (erro) {
                ultimoErro = erro;
            }
        }

        if (linhas === null) {
            limpar(corpo);
            estado.anuncios = [];
            vazio.hidden = true;
            corpo.appendChild(criar('tr', {}, [
                criar('td', { colSpan: '10', texto: 'Erro ao carregar: ' + mensagemDeErro(ultimoErro) })
            ]));
            return;
        }

        estado.anuncios = linhas.map(anuncio => Object.assign({}, anuncio, {
            impressoes_hoje: Number(anuncio.impressoes_hoje || 0),
            cota_esgotada: anuncio.cota_esgotada === true
        }));

        desenharAnuncios();
    }

    /* Texto "12 / 50": contador e cota (ou só o contador, se não há cota) */
    function textoContador(valor, cota) {
        if (cota === null || cota === undefined) return String(valor);
        return String(valor) + ' / ' + String(cota);
    }

    /* A cota acabou? (total e diária) */
    function cotaEsgotada(anuncio) {
        const impressoes = Number(anuncio.impressoes || 0);
        const hoje = Number(anuncio.impressoes_hoje || 0);

        const total = anuncio.limite_impressoes;
        const dia = anuncio.limite_impressoes_dia;

        if (total !== null && total !== undefined && impressoes >= Number(total)) return true;
        if (dia !== null && dia !== undefined && hoje >= Number(dia)) return true;

        return false;
    }

    function desenharAnuncios() {
        const corpo = byId('adTableBody');
        const vazio = byId('adEmpty');

        limpar(corpo);
        vazio.hidden = estado.anuncios.length > 0;

        estado.anuncios.forEach(anuncio => {
            const impressoes = Number(anuncio.impressoes || 0);
            const cliques = Number(anuncio.cliques || 0);
            const hoje = Number(anuncio.impressoes_hoje || 0);
            const ctr = impressoes > 0 ? (cliques / impressoes * 100).toFixed(1) + '%' : '—';

            const noPrazo = anuncioNoPrazo(anuncio);
            const semCota = anuncio.cota_esgotada === true || cotaEsgotada(anuncio);

            const status = anuncio.publicado === true
                ? (noPrazo ? (semCota ? 'esgotado' : 'publicado') : 'pausado')
                : 'rascunho';

            const rotuloStatus = {
                publicado: 'No ar',
                pausado: 'Fora do prazo',
                esgotado: 'Cota esgotada',
                rascunho: 'Rascunho'
            }[status];

            const acaoEditar = criar('button', {
                type: 'button',
                classe: 'btn ghost small',
                texto: 'Editar',
                'aria-label': 'Editar anúncio de ' + (anuncio.empresa || '')
            });
            acaoEditar.addEventListener('click', () => preencherFormularioAnuncio(anuncio));

            const acaoPublicar = criar('button', {
                type: 'button',
                classe: 'btn ghost small',
                texto: anuncio.publicado === true ? 'Pausar' : 'Publicar'
            });
            acaoPublicar.addEventListener('click', () => alternarPublicacaoAnuncio(anuncio));

            const acaoExcluir = criar('button', {
                type: 'button',
                classe: 'btn danger',
                texto: 'Excluir'
            });
            acaoExcluir.addEventListener('click', () => excluirAnuncio(anuncio));

            corpo.appendChild(criar('tr', {}, [
                criar('td', { classe: 'wrap' }, [
                    criar('strong', { texto: anuncio.empresa || '—' }),
                    criar('div', { texto: anuncio.titulo || '', style: 'color:#6B6B6B;font-size:0.82rem' }),
                    anuncio.autorizacao
                        ? criar('div', { texto: 'Autorizado por: ' + anuncio.autorizacao, style: 'color:#6B6B6B;font-size:0.78rem' })
                        : null
                ]),
                criar('td', { texto: ROTULO_FORMATO[anuncio.formato] || anuncio.formato || '—' }),
                criar('td', { texto: ROTULO_POSICAO[anuncio.posicao] || anuncio.posicao || '—' }),
                criar('td', { texto: String(Number(anuncio.peso || 1)) }),
                criar('td', { texto: textoContador(impressoes, anuncio.limite_impressoes) }),
                criar('td', { texto: textoContador(hoje, anuncio.limite_impressoes_dia) }),
                criar('td', { texto: String(cliques) }),
                criar('td', { texto: ctr }),
                criar('td', {}, [criar('span', { classe: 'pill ' + status, texto: rotuloStatus })]),
                criar('td', {}, [acaoEditar, espaco(), acaoPublicar, espaco(), acaoExcluir])
            ]));
        });
    }

    /* ---------- Cotações ---------- */

    /* Dispara a coleta no servidor (GitHub Actions) pelo botao.
       O token do GitHub fica na Edge Function: aqui so vai a sessao
       do painel. */
    async function atualizarCotacoesAgora() {
        const botao = byId('cotAtualizarButton');
        const aviso = byId('cotAtualizarAviso');

        if (!botao) return;

        botao.disabled = true;
        botao.textContent = 'Disparando...';

        if (aviso) {
            aviso.hidden = false;
            aviso.textContent = 'Disparando a coleta. Os numeros novos aparecem no site em poucos minutos.';
        }

        try {
            const sessao = await api.ensureSession();

            if (!sessao) {
                throw new Error('Sessao expirada. Entre novamente no painel.');
            }

            const resposta = await api.invokeFunction('cotacoes-trigger', { origem: 'painel-admin' });

            if (aviso) {
                aviso.textContent = (resposta && resposta.mensagem) ||
                    'Coleta disparada. Os numeros novos aparecem no site em poucos minutos.';
            }

            await carregarCotacoes();
        } catch (erro) {
            if (aviso) {
                aviso.textContent = 'Nao foi possivel disparar a coleta: ' + mensagemDeErro(erro);
            }
        } finally {
            botao.disabled = false;
            botao.textContent = 'Atualizar cotações agora';
        }
    }

    async function carregarCotacoes() {
        const corpo = byId('cotTableBody');
        const vazio = byId('cotEmpty');
        const corpoFontes = byId('cotFontesBody');
        const vazioFontes = byId('cotFontesEmpty');

        try {
            const linhas = await api.select(
                'cotacoes',
                'select=id,fonte,mercado,simbolo,produto,regiao,preco,preco_max,preco_min,' +
                'variacao,variacao_abs,unidade,referencia,publicado,atualizado_em,criado_em' +
                '&order=mercado.asc,produto.asc&limit=500'
            );

            estado.cotacoes = linhas || [];
            desenharCotacoes();

            /* As fontes ficam em outra tabela (privada: so o painel ve). */
            try {
                const fontes = await api.select(
                    'cotacoes_fontes',
                    'select=fonte,nome,url,status,mensagem,itens,coletado_em&order=fonte.asc&limit=50'
                );

                estado.cotacoesFontes = fontes || [];
            } catch (erro) {
                estado.cotacoesFontes = [];
            }

            desenharFontesCotacao();
        } catch (erro) {
            limpar(corpo);
            vazio.hidden = true;
            corpo.appendChild(criar('tr', {}, [
                criar('td', { colSpan: '9', texto: 'Erro ao carregar: ' + mensagemDeErro(erro) })
            ]));

            limpar(corpoFontes);
            vazioFontes.hidden = true;
        }
    }

    function formatarPrecoCotacao(valor, unidade) {
        if (valor === null || valor === undefined || valor === '') return '—';

        const numero = Number(valor);
        if (isNaN(numero)) return '—';

        const texto = numero.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4
        });

        const u = String(unidade || '');

        if (u.indexOf('US$') === 0) return 'US$ ' + texto;
        if (u.indexOf('¢') === 0) return '¢ ' + texto;
        if (u.indexOf('R$') === 0 || u.indexOf('BRL') === 0) return 'R$ ' + texto;

        return texto;
    }

    function desenharCotacoes() {
        const corpo = byId('cotTableBody');
        const vazio = byId('cotEmpty');

        limpar(corpo);
        vazio.hidden = estado.cotacoes.length > 0;

        estado.cotacoes.forEach(cotacao => {
            const variacao = cotacao.variacao === null || cotacao.variacao === undefined
                ? null
                : Number(cotacao.variacao);

            const variacaoTexto = variacao === null || isNaN(variacao)
                ? (cotacao.variacao_abs === null || cotacao.variacao_abs === undefined
                    ? '—'
                    : (Number(cotacao.variacao_abs) > 0 ? '+' : '') + String(cotacao.variacao_abs))
                : (variacao > 0 ? '+' : '') + variacao.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }) + '%';

            const acaoPublicar = criar('button', {
                type: 'button',
                classe: 'btn ghost small',
                texto: cotacao.publicado === true ? 'Tirar do ar' : 'Publicar'
            });
            acaoPublicar.addEventListener('click', () => alternarPublicacaoCotacao(cotacao));

            const acaoExcluir = criar('button', {
                type: 'button',
                classe: 'btn danger',
                texto: 'Excluir'
            });
            acaoExcluir.addEventListener('click', () => excluirCotacao(cotacao));

            corpo.appendChild(criar('tr', {}, [
                criar('td', { classe: 'wrap' }, [
                    criar('strong', { texto: cotacao.produto || cotacao.simbolo || '—' }),
                    criar('div', { texto: cotacao.simbolo || '', style: 'color:#6B6B6B;font-size:0.82rem' })
                ]),
                criar('td', { texto: ROTULO_MERCADO_COTACAO[cotacao.mercado] || cotacao.mercado || '—' }),
                criar('td', { texto: ROTULO_FONTE_COTACAO[cotacao.fonte] || cotacao.fonte || '—' }),
                criar('td', { texto: formatarPrecoCotacao(cotacao.preco, cotacao.unidade) }),
                criar('td', { texto: variacaoTexto }),
                criar('td', { texto: cotacao.regiao || '—' }),
                criar('td', { texto: formatarData(cotacao.atualizado_em) }),
                criar('td', {}, [criar('span', {
                    classe: 'pill ' + (cotacao.publicado === true ? 'publicado' : 'rascunho'),
                    texto: cotacao.publicado === true ? 'No ar' : 'Fora do ar'
                })]),
                criar('td', {}, [acaoPublicar, espaco(), acaoExcluir])
            ]));
        });
    }

    function desenharFontesCotacao() {
        const corpo = byId('cotFontesBody');
        const vazio = byId('cotFontesEmpty');

        limpar(corpo);
        vazio.hidden = estado.cotacoesFontes.length > 0;

        estado.cotacoesFontes.forEach(fonte => {
            corpo.appendChild(criar('tr', {}, [
                criar('td', { classe: 'wrap' }, [
                    criar('strong', { texto: ROTULO_FONTE_COTACAO[fonte.fonte] || fonte.nome || fonte.fonte }),
                    fonte.url
                        ? criar('div', { texto: fonte.url, style: 'color:#6B6B6B;font-size:0.78rem;word-break:break-all' })
                        : null
                ]),
                criar('td', {}, [criar('span', {
                    classe: 'pill ' + (fonte.status === 'ok' ? 'publicado' : (fonte.status === 'erro' ? 'pausado' : 'rascunho')),
                    texto: ROTULO_STATUS_FONTE[fonte.status] || fonte.status || 'Pendente'
                })]),
                criar('td', { texto: String(fonte.itens === null || fonte.itens === undefined ? 0 : fonte.itens) }),
                criar('td', { texto: formatarData(fonte.coletado_em) }),
                criar('td', { classe: 'wrap', texto: fonte.mensagem || '—' })
            ]));
        });
    }

    async function alternarPublicacaoCotacao(cotacao) {
        try {
            await api.update('cotacoes', 'id=eq.' + encodeURIComponent(cotacao.id), {
                publicado: cotacao.publicado !== true
            });

            await carregarCotacoes();
        } catch (erro) {
            window.alert('Erro ao mudar a cotação: ' + mensagemDeErro(erro));
        }
    }

    async function excluirCotacao(cotacao) {
        const nome = cotacao.produto || cotacao.simbolo || 'esta cotação';

        if (!window.confirm('Excluir a cotação "' + nome + '"? Esta ação não pode ser desfeita.')) {
            return;
        }

        try {
            await api.remove('cotacoes', 'id=eq.' + encodeURIComponent(cotacao.id));
            await carregarCotacoes();
        } catch (erro) {
            window.alert('Erro ao excluir a cotação: ' + mensagemDeErro(erro));
        }
    }

    function preencherFormularioAnuncio(anuncio) {
        byId('adId').value = anuncio.id;
        byId('adCompany').value = anuncio.empresa || '';
        byId('adTitle').value = anuncio.titulo || '';
        byId('adText').value = anuncio.texto || '';
        byId('adUrl').value = anuncio.url || '';
        byId('adImage').value = anuncio.imagem_url || '';
        byId('adPosition').value = anuncio.posicao || 'noticias';
        byId('adFormat').value = anuncio.formato || 'faixa';
        byId('adAuth').value = anuncio.autorizacao || '';
        byId('adStart').value = dataParaCampo(anuncio.inicio_em);
        byId('adEnd').value = dataParaCampo(anuncio.fim_em);
        byId('adPriority').value = String(anuncio.prioridade || 0);
        byId('adPeso').value = String(Number(anuncio.peso || 1));
        byId('adLimiteTotal').value = anuncio.limite_impressoes === null || anuncio.limite_impressoes === undefined
            ? '' : String(anuncio.limite_impressoes);
        byId('adLimiteDia').value = anuncio.limite_impressoes_dia === null || anuncio.limite_impressoes_dia === undefined
            ? '' : String(anuncio.limite_impressoes_dia);
        byId('adPublished').checked = anuncio.publicado === true;

        byId('adFormTitle').textContent = 'Editar anúncio';
        byId('adSubmit').textContent = 'Salvar alterações';
        byId('adResetButton').hidden = false;
        mostrarAlerta(byId('adAlert'), '');

        byId('adCompany').focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function limparFormularioAnuncio() {
        byId('adForm').reset();
        byId('adId').value = '';
        byId('adPublished').checked = true;
        byId('adPriority').value = '0';
        byId('adPeso').value = '1';
        byId('adLimiteTotal').value = '';
        byId('adLimiteDia').value = '';
        byId('adPosition').value = 'noticias';
        byId('adFormat').value = 'faixa';
        byId('adFormTitle').textContent = 'Publicar anúncio';
        byId('adSubmit').textContent = 'Publicar anúncio';
        byId('adResetButton').hidden = true;
        mostrarAlerta(byId('adAlert'), '');
    }

    async function salvarAnuncio(evento) {
        evento.preventDefault();

        const alerta = byId('adAlert');
        const botao = byId('adSubmit');

        mostrarAlerta(alerta, '');
        botao.disabled = true;

        const id = byId('adId').value.trim();

        const dados = {
            empresa: byId('adCompany').value.trim(),
            titulo: byId('adTitle').value.trim(),
            texto: byId('adText').value.trim(),
            url: byId('adUrl').value.trim(),
            imagem_url: byId('adImage').value.trim(),
            posicao: byId('adPosition').value,
            formato: byId('adFormat').value,
            autorizacao: byId('adAuth').value.trim(),
            inicio_em: inicioParaIso(byId('adStart').value),
            fim_em: fimParaIso(byId('adEnd').value),
            publicado: byId('adPublished').checked,
            prioridade: Number(byId('adPriority').value || 0),
            peso: Math.min(10, Math.max(1, Number(byId('adPeso').value || 1))),
            limite_impressoes: numeroOuNulo(byId('adLimiteTotal').value),
            limite_impressoes_dia: numeroOuNulo(byId('adLimiteDia').value)
        };

        if (dados.empresa.length < 2) {
            mostrarAlerta(alerta, 'Informe a empresa anunciante.');
            botao.disabled = false;
            return;
        }

        if (dados.titulo.length < 3) {
            mostrarAlerta(alerta, 'O título do anúncio precisa de pelo menos 3 caracteres.');
            botao.disabled = false;
            return;
        }

        /* Prova de autorização do anunciante (Lei 9.279/1996, art. 37) */
        if (!dados.autorizacao) {
            mostrarAlerta(alerta,
                'Informe quem autorizou a publicação (nome e contato). Sem isso o anúncio não pode ir ao ar.',
                'warning');
            botao.disabled = false;
            return;
        }

        /* Cota zerada deixaria o anúncio fora da fila para sempre */
        if (dados.limite_impressoes !== null && dados.limite_impressoes < 1) {
            mostrarAlerta(alerta,
                'A cota total precisa ser 1 ou mais. Deixe em branco para deixar ilimitado.',
                'warning');
            botao.disabled = false;
            return;
        }

        if (dados.limite_impressoes_dia !== null && dados.limite_impressoes_dia < 1) {
            mostrarAlerta(alerta,
                'A cota por dia precisa ser 1 ou mais. Deixe em branco para deixar ilimitado.',
                'warning');
            botao.disabled = false;
            return;
        }

        try {
            if (id) {
                await api.update('anuncios', 'id=eq.' + encodeURIComponent(id), dados);
                mostrarAlerta(alerta, 'Anúncio atualizado.', 'ok');
            } else {
                await api.insert('anuncios', dados);
                mostrarAlerta(alerta, 'Anúncio publicado.', 'ok');
            }

            limparFormularioAnuncio();
            await carregarAnuncios();
        } catch (erro) {
            mostrarAlerta(alerta, 'Erro ao salvar: ' + mensagemDeErro(erro));
        } finally {
            botao.disabled = false;
        }
    }

    async function alternarPublicacaoAnuncio(anuncio) {
        try {
            await api.update('anuncios', 'id=eq.' + encodeURIComponent(anuncio.id), {
                publicado: anuncio.publicado !== true
            });
            await carregarAnuncios();
        } catch (erro) {
            window.alert('Erro ao mudar o status: ' + mensagemDeErro(erro));
        }
    }

    async function excluirAnuncio(anuncio) {
        if (!window.confirm('Excluir o anúncio de "' + (anuncio.empresa || '') + '"? Esta ação não pode ser desfeita.')) {
            return;
        }

        try {
            await api.remove('anuncios', 'id=eq.' + encodeURIComponent(anuncio.id));
            await carregarAnuncios();
        } catch (erro) {
            window.alert('Erro ao excluir: ' + mensagemDeErro(erro));
        }
    }

    /* ---------- Leads ---------- */

    async function carregarLeads() {
        const corpo = byId('leadTableBody');
        const vazio = byId('leadEmpty');

        try {
            const linhas = await api.select(
                'leads',
                'select=id,nome,email,telefone,perfil,busca,mensagem,origem_url,referrer,utm_source,utm_medium,utm_campaign,status,criado_em&order=criado_em.desc&limit=300'
            );

            estado.leads = linhas || [];
            desenharLeads();
        } catch (erro) {
            limpar(corpo);
            corpo.appendChild(criar('tr', {}, [
                criar('td', { colSpan: '8', texto: 'Erro ao carregar: ' + mensagemDeErro(erro) })
            ]));
        }
    }

    function desenharLeads() {
        const corpo = byId('leadTableBody');
        const vazio = byId('leadEmpty');

        limpar(corpo);

        const termo = estado.filtroLeads.trim().toLowerCase();
        const lista = termo
            ? estado.leads.filter(lead => {
                const alvo = [lead.nome, lead.email, lead.telefone, lead.perfil, lead.busca]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return alvo.indexOf(termo) !== -1;
            })
            : estado.leads;

        vazio.hidden = lista.length > 0;

        lista.forEach(lead => {
            const seletorStatus = criar('select', { classe: 'pill ' + lead.status });
            STATUS_LEAD.forEach(status => {
                seletorStatus.appendChild(criar('option', {
                    value: status,
                    texto: status.replace('_', ' '),
                    selected: status === lead.status
                }));
            });

            seletorStatus.addEventListener('change', () => {
                atualizarStatusLead(lead, seletorStatus.value, seletorStatus);
            });

            const botaoWhatsapp = criar('button', {
                type: 'button',
                classe: 'btn ghost small',
                texto: 'WhatsApp'
            });

            const digitos = String(lead.telefone || '').replace(/\D/g, '');
            botaoWhatsapp.addEventListener('click', () => {
                if (!digitos) return;
                window.open('https://wa.me/55' + digitos, '_blank', 'noopener');
            });

            const botaoExcluir = criar('button', {
                type: 'button',
                classe: 'btn danger',
                texto: 'Excluir'
            });
            botaoExcluir.addEventListener('click', () => excluirLead(lead));

            corpo.appendChild(criar('tr', {}, [
                criar('td', { texto: formatarData(lead.criado_em) }),
                criar('td', { classe: 'wrap' }, [
                    criar('strong', { texto: lead.nome }),
                    criar('div', { texto: lead.email, style: 'color:#6B6B6B;font-size:0.82rem' })
                ]),
                criar('td', { texto: lead.telefone }),
                criar('td', { texto: lead.perfil || '—' }),
                criar('td', { texto: lead.busca || '—' }),
                criar('td', { classe: 'wrap', texto: lead.mensagem || '—' }),
                criar('td', {}, [seletorStatus]),
                criar('td', {}, [botaoWhatsapp, espaco(), botaoExcluir])
            ]));
        });
    }

    async function atualizarStatusLead(lead, status, seletor) {
        try {
            await api.update('leads', 'id=eq.' + encodeURIComponent(lead.id), { status: status });
            lead.status = status;
            seletor.className = 'pill ' + status;
        } catch (erro) {
            window.alert('Erro ao atualizar o status: ' + mensagemDeErro(erro));
            seletor.value = lead.status;
        }
    }

    async function excluirLead(lead) {
        if (!window.confirm('Excluir o lead "' + lead.nome + '"? Esta ação não pode ser desfeita.')) {
            return;
        }

        try {
            await api.remove('leads', 'id=eq.' + encodeURIComponent(lead.id));
            await carregarLeads();
            await carregarResumo();
        } catch (erro) {
            window.alert('Erro ao excluir: ' + mensagemDeErro(erro));
        }
    }

    function exportarLeadsCsv() {
        if (!estado.leads.length) {
            window.alert('Não há leads para exportar.');
            return;
        }

        const cabecalho = [
            'Recebido em', 'Nome', 'E-mail', 'Telefone', 'Perfil', 'O que busca',
            'Mensagem', 'Origem', 'Referrer', 'UTM source', 'UTM medium',
            'UTM campaign', 'Status'
        ];

        const linhas = estado.leads.map(lead => [
            formatarData(lead.criado_em),
            lead.nome,
            lead.email,
            lead.telefone,
            lead.perfil,
            lead.busca,
            lead.mensagem,
            lead.origem_url,
            lead.referrer,
            lead.utm_source,
            lead.utm_medium,
            lead.utm_campaign,
            lead.status
        ]);

        function celula(valor) {
            const texto = valor === null || valor === undefined ? '' : String(valor);
            return '"' + texto.replace(/"/g, '""') + '"';
        }

        const csv = [cabecalho.map(celula).join(';')]
            .concat(linhas.map(linha => linha.map(celula).join(';')))
            .join('\r\n');

        // BOM para o Excel abrir os acentos corretamente
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'leads-qgraos-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /* ---------- Visitas ---------- */

    async function carregarVisitas() {
        const cartoes = byId('cardsVisitas');
        const corpoTipos = byId('visitasTipoBody');
        const corpo = byId('visitasBody');

        try {
            const resumo = await api.select('vw_painel_resumo', 'limit=1');
            const dados = (resumo && resumo[0]) || {};

            limpar(cartoes);
            cartoes.appendChild(cartao(dados.total_pageviews || 0, 'Visitas ao site'));
            cartoes.appendChild(cartao(dados.pageviews_30d || 0, 'Visitas (30 dias)'));
            cartoes.appendChild(cartao(dados.visitantes || 0, 'Visitantes únicos'));

            const porTipo = await api.select('vw_visitas_por_tipo');
            limpar(corpoTipos);

            (porTipo || []).forEach(item => {
                corpoTipos.appendChild(criar('tr', {}, [
                    criar('td', { texto: ROTULO_TIPO[item.tipo] || item.tipo }),
                    criar('td', { texto: String(item.total) })
                ]));
            });

            if (!(porTipo || []).length) {
                corpoTipos.appendChild(criar('tr', {}, [
                    criar('td', { colSpan: '2', texto: 'Nenhuma visita registrada ainda.' })
                ]));
            }

            const ultimas = await api.select(
                'visitas',
                'select=id,tipo,path,referrer,dispositivo,secao,criado_em&order=criado_em.desc&limit=150'
            );

            limpar(corpo);

            (ultimas || []).forEach(visita => {
                corpo.appendChild(criar('tr', {}, [
                    criar('td', { texto: formatarData(visita.criado_em) }),
                    criar('td', {}, [criar('span', {
                        classe: 'pill',
                        texto: ROTULO_TIPO[visita.tipo] || visita.tipo
                    })]),
                    criar('td', { texto: visita.path || '—' }),
                    criar('td', { classe: 'wrap', texto: visita.referrer || visita.secao || '—' })
                ]));
            });

            if (!(ultimas || []).length) {
                corpo.appendChild(criar('tr', {}, [
                    criar('td', { colSpan: '4', texto: 'Nenhuma interação registrada ainda.' })
                ]));
            }
        } catch (erro) {
            limpar(cartoes);
            cartoes.appendChild(criar('div', { classe: 'stat', texto: 'Erro ao carregar: ' + mensagemDeErro(erro) }));
        }
    }

    /* ---------- Boot ---------- */

    async function carregarTudo() {
        await carregarResumo();
    }

    function registrarEventos() {
        byId('loginForm').addEventListener('submit', entrar);
        byId('logoutButton').addEventListener('click', sair);
        byId('newsForm').addEventListener('submit', salvarNoticia);
        byId('newsResetButton').addEventListener('click', limparFormularioNoticia);
        byId('newsSummary').addEventListener('input', atualizarContadorResumo);
        byId('adForm').addEventListener('submit', salvarAnuncio);
        byId('adResetButton').addEventListener('click', limparFormularioAnuncio);
        byId('leadExport').addEventListener('click', exportarLeadsCsv);

        byId('leadSearch').addEventListener('input', evento => {
            estado.filtroLeads = evento.target.value || '';
            desenharLeads();
        });

        byId('cotAtualizarButton').addEventListener('click', atualizarCotacoesAgora);

        document.querySelectorAll('.tab').forEach(botao => {
            botao.addEventListener('click', () => ativarAba(botao.getAttribute('data-tab')));
        });
    }

    async function iniciar() {
        registrarEventos();
        verificarConfiguracao();
        atualizarContadorResumo();

        if (!api) {
            mostrarLogin();
            return;
        }

        api.restoreSession();

        if (api.getSession()) {
            const sessao = await api.ensureSession();

            if (sessao) {
                try {
                    const admin = await verificarAdministrador();

                    if (admin) {
                        mostrarApp();
                        await carregarTudo();
                        return;
                    }

                    api.signOut();
                } catch (erro) {
                    api.signOut();
                }
            } else {
                api.signOut();
            }
        }

        mostrarLogin();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
