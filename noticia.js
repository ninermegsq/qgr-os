'use strict';

/* ------------------------------------------------------------------
 * Q GRÃOS — página da notícia (noticia.html)
 * ------------------------------------------------------------------
 * A matéria fica hospedada no site: o texto vem do banco (coluna
 * `conteudo`) e é escrito na tela com `textContent` — nunca com
 * `innerHTML`. O visitante não é levado para a página de origem: o
 * crédito da fonte aparece no fim do texto, em texto puro.
 * ------------------------------------------------------------------ */

(function () {
    const SUPABASE = (typeof window !== 'undefined' && window.QGSupabase) || null;
    const SUPABASE_ATIVO = Boolean(SUPABASE && SUPABASE.isConfigured());

    const SITE = (typeof window !== 'undefined' && window.QG_SITE) || {};
    const SITE_URL = String(SITE.siteUrl || 'https://qgraos.com.br/').replace(/\/+$/, '');

    /* Rótulos das categorias (mesmo mapa usado na listagem) */
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

    const MESES = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];

    const byId = id => document.getElementById(id);

    /* ---------- Utilidades ---------- */

    function urlSegura(valor) {
        const texto = String(valor || '').trim();
        if (!/^https?:\/\//i.test(texto)) return '';
        return texto;
    }

    function formatarData(iso) {
        if (!iso) return '';

        const data = new Date(iso);
        if (isNaN(data.getTime())) return '';

        const dia = String(data.getDate()).padStart(2, '0');
        const mes = String(data.getMonth() + 1).padStart(2, '0');

        return dia + '/' + mes + '/' + data.getFullYear();
    }

    function formatarDataLonga(iso) {
        if (!iso) return '';

        const data = new Date(iso);
        if (isNaN(data.getTime())) return '';

        return data.getDate() + ' de ' + MESES[data.getMonth()] + ' de ' + data.getFullYear();
    }

    function rotuloCategoria(valor) {
        return ROTULO_CATEGORIA[valor] || valor || 'Geral';
    }

    function limpar(elemento) {
        while (elemento.firstChild) elemento.removeChild(elemento.firstChild);
    }

    /* Tempo estimado de leitura (200 palavras por minuto) */
    function tempoLeitura(texto) {
        const palavras = String(texto || '').trim().split(/\s+/).filter(Boolean).length;
        const minutos = Math.max(1, Math.round(palavras / 200));

        return minutos + ' min de leitura';
    }

    /* ---------- Estado de erro (id inválido ou matéria fora do ar) ---------- */

    function mostrarErro(titulo, texto) {
        const erro = byId('noticiaErro');
        const conteudo = byId('noticiaConteudo');

        if (conteudo) conteudo.hidden = true;
        if (!erro) return;

        erro.hidden = false;

        const elementoTitulo = byId('noticiaErroTitulo');
        const elementoTexto = byId('noticiaErroTexto');

        if (elementoTitulo) elementoTitulo.textContent = titulo;
        if (elementoTexto) elementoTexto.textContent = texto;

        document.title = titulo + ' | Q GRÃOS';
    }

    /* ---------- SEO: canonical, Open Graph, Twitter Card e JSON-LD ---------- */

    function definirMeta(atributo, nome, conteudo) {
        const seletor = 'meta[' + atributo + '="' + nome + '"]';

        let meta = document.querySelector(seletor);

        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute(atributo, nome);
            document.head.appendChild(meta);
        }

        meta.setAttribute('content', conteudo);
    }

    function definirCanonical(url) {
        let link = document.querySelector('link[rel="canonical"]');

        if (!link) {
            link = document.createElement('link');
            link.setAttribute('rel', 'canonical');
            document.head.appendChild(link);
        }

        link.setAttribute('href', url);
    }

    function definirJsonLd(dados) {
        const bloco = byId('noticiaLdJson');
        if (!bloco) return;

        /* textContent, nunca innerHTML: o JSON-LD é gerado aqui e não
           pode injetar nada no documento */
        bloco.textContent = JSON.stringify(dados, null, 2);
    }

    /* Monta o SEO da matéria carregada: uma URL por notícia, com capa,
       data e autor — é o que o Google usa para mostrar o card rico. */
    function montarSeo(noticia) {
        const url = SITE_URL + '/noticia.html?id=' + encodeURIComponent(noticia.id);
        const titulo = noticia.titulo || 'Notícia do Agronegócio | Q GRÃOS';
        const resumo = noticia.resumo || '';
        const capa = urlSegura(noticia.imagem_url) || SITE_URL + '/assets/hero_bg.png';
        const publicacao = noticia.publicado_em || '';

        definirCanonical(url);

        definirMeta('property', 'og:type', 'article');
        definirMeta('property', 'og:locale', 'pt_BR');
        definirMeta('property', 'og:site_name', 'Q GRÃOS');
        definirMeta('property', 'og:url', url);
        definirMeta('property', 'og:title', titulo);
        definirMeta('property', 'og:description', resumo);
        definirMeta('property', 'og:image', capa);
        definirMeta('property', 'og:image:alt', titulo);

        definirMeta('name', 'twitter:card', 'summary_large_image');
        definirMeta('name', 'twitter:title', titulo);
        definirMeta('name', 'twitter:description', resumo);
        definirMeta('name', 'twitter:image', capa);

        if (publicacao) definirMeta('property', 'article:published_time', publicacao);

        document.title = titulo + ' | Q GRÃOS';

        definirJsonLd({
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            'headline': titulo,
            'description': resumo,
            'url': url,
            'inLanguage': 'pt-BR',
            'datePublished': publicacao,
            'dateModified': publicacao,
            'image': [capa],
            'articleSection': rotuloCategoria(noticia.categoria),
            'author': {
                '@type': 'Organization',
                'name': 'Q GRÃOS',
                'url': SITE_URL + '/'
            },
            'isPartOf': {
                '@type': 'WebSite',
                'name': 'Q GRÃOS',
                'url': SITE_URL + '/'
            },
            'publisher': {
                '@type': 'Organization',
                'name': 'Q GRÃOS',
                'url': SITE_URL + '/',
                'email': SITE.email || 'contato@qgraos.com.br',
                'telephone': SITE.phoneE164 || '+5566992281757',
                'vatID': SITE.cnpj || '62.793.851/0001-96'
            }
        });
    }

    /* ---------- Escrever a matéria ---------- */

    /* O texto vem do banco como um bloco. Cada parágrafo separado por
       linha em branco vira um <p>. Linhas com "## " viram subtítulo e
       linhas com "- " viram lista. Tudo com textContent. */
    function escreverTexto(noticia) {
        const corpo = byId('noticiaCorpo');
        if (!corpo) return;

        limpar(corpo);

        const texto = String(noticia.conteudo || '').trim();

        if (!texto) {
            const aviso = document.createElement('p');
            aviso.className = 'noticia-sem-texto';
            aviso.textContent = 'O texto completo desta notícia ainda está sendo publicado. ' +
                'Volte em instantes ou fale com a nossa equipe pelo WhatsApp.';
            corpo.appendChild(aviso);
            return;
        }

        const blocos = texto.split(/\n\s*\n+/);

        blocos.forEach(bloco => {
            const conteudo = bloco.trim();
            if (!conteudo) return;

            if (conteudo.indexOf('## ') === 0) {
                const subtitulo = document.createElement('h2');
                subtitulo.textContent = conteudo.slice(3).trim();
                corpo.appendChild(subtitulo);
                return;
            }

            const linhas = conteudo.split('\n')
                .map(linha => linha.trim())
                .filter(Boolean);

            // Várias linhas começando com "- " viram uma lista
            if (linhas.length > 1 && linhas.every(linha => linha.indexOf('- ') === 0)) {
                const lista = document.createElement('ul');

                linhas.forEach(linha => {
                    const item = document.createElement('li');
                    item.textContent = linha.slice(2).trim();
                    lista.appendChild(item);
                });

                corpo.appendChild(lista);
                return;
            }

            const paragrafo = document.createElement('p');
            paragrafo.textContent = linhas.join(' ');
            corpo.appendChild(paragrafo);
        });
    }

    /* Crédito da fonte original: texto puro, sem link — o visitante
       continua no site e não é levado para a página de origem. */
    function escreverCredito(noticia) {
        const credito = byId('noticiaCredito');
        if (!credito) return;

        const fonte = String(noticia.fonte || '').trim();

        if (!fonte) {
            credito.hidden = true;
            return;
        }

        credito.textContent = 'Conteúdo original: ' + fonte + '. Publicada pela Q GRÃOS.';
        credito.hidden = false;
    }

    function escreverCapa(noticia) {
        const figura = byId('noticiaCapa');
        if (!figura) return;

        limpar(figura);

        const capa = urlSegura(noticia.imagem_url);

        if (!capa) {
            figura.hidden = true;
            return;
        }

        const imagem = document.createElement('img');
        imagem.src = capa;
        imagem.alt = noticia.titulo || 'Notícia do agronegócio';
        imagem.loading = 'lazy';
        imagem.decoding = 'async';

        /* Se a imagem não carregar, a figura some — não fica um buraco
           quebrado no meio da matéria. */
        imagem.addEventListener('error', function () {
            figura.hidden = true;
            limpar(figura);
        });

        figura.appendChild(imagem);
        figura.hidden = false;
    }

    /* ---------- Contador de visualizações ---------- */

    /* Cada abertura da matéria conta uma visualização. O contador é
       interno (sem pixel de terceiro) e só vale para notícia publicada. */
    function registrarVisualizacao(noticia) {
        if (!SUPABASE_ATIVO || !noticia || !noticia.id) return;

        SUPABASE.rpc('registrar_visualizacao_noticia', { p_id: noticia.id })
            .catch(function (erro) {
                console.warn('Q GRAOS: não foi possível contar a visualização.', erro && erro.message);
            });
    }

    /* Botão de compartilhamento no WhatsApp */
    function montarCompartilhar(noticia) {
        const botao = byId('noticiaCompartilhar');
        if (!botao) return;

        const url = SITE_URL + '/noticia.html?id=' + encodeURIComponent(noticia.id);
        const texto = (noticia.titulo || 'Notícia do agronegócio') + ' — Q GRÃOS';

        botao.href = 'https://wa.me/?text=' + encodeURIComponent(texto + ' ' + url);
    }

    /* ---------- Chamada compacta: "O que você busca hoje?" ----------
       O visitante marca o que procura e o botão leva para a ficha
       de contato com a opção já escolhida e a mensagem com o
       contexto da matéria. O link é montado aqui (e refeito a cada
       mudança da opção) — o botão não é um link direto para o
       WhatsApp: o lead passa pela ficha e fica gravado no painel. */
    function montarLead(noticia) {
        const select = byId('noticiaBusca');
        const botao = byId('noticiaLeadBotao');

        if (!select || !botao) return;

        const id = encodeURIComponent(noticia.id || '');
        const titulo = encodeURIComponent(String(noticia.titulo || '').slice(0, 160));

        function atualizarLink() {
            const parametros = [];

            if (select.value) parametros.push('busca=' + encodeURIComponent(select.value));
            parametros.push('origem=noticia');

            if (noticia.id) parametros.push('materia=' + id);
            if (noticia.titulo) parametros.push('titulo=' + titulo);

            botao.href = 'index.html?' + parametros.join('&') + '#contact';
        }

        select.addEventListener('change', atualizarLink);

        atualizarLink();
    }

    /* ---------- Mais notícias ---------- */

    /* 3 da mesma categoria da matéria + 3 recentes (sem repetir a
       matéria que está aberta). */
    function carregarMaisNoticias(noticia) {
        const grade = byId('newsMaisGrid');
        if (!grade) return Promise.resolve([]);

        if (!SUPABASE_ATIVO) {
            limpar(grade);

            const aviso = document.createElement('p');
            aviso.className = 'news-empty';
            aviso.textContent = 'As notícias do agronegócio entram no ar em breve.';
            grade.appendChild(aviso);

            return Promise.resolve([]);
        }

        const campos = 'id,titulo,resumo,categoria,fonte,url,imagem_url,publicado_em,destaque';
        const id = encodeURIComponent(noticia.id);
        const categoria = encodeURIComponent(noticia.categoria || 'Geral');

        const daCategoria = SUPABASE.select('noticias',
            'select=' + campos + '&publicado=eq.true&id=neq.' + id +
            '&categoria=eq.' + categoria +
            '&order=publicado_em.desc&limit=3');

        const recentes = SUPABASE.select('noticias',
            'select=' + campos + '&publicado=eq.true&id=neq.' + id +
            '&order=publicado_em.desc&limit=6');

        return Promise.all([daCategoria, recentes])
            .then(function (respostas) {
                const listaCategoria = Array.isArray(respostas[0]) ? respostas[0] : [];
                const listaRecentes = Array.isArray(respostas[1]) ? respostas[1] : [];

                const vistos = {};
                vistos[noticia.id] = true;

                const escolhidas = [];

                listaCategoria.forEach(function (item) {
                    if (!item || vistos[item.id]) return;
                    vistos[item.id] = true;
                    escolhidas.push(item);
                });

                listaRecentes.forEach(function (item) {
                    if (escolhidas.length >= 6) return;
                    if (!item || vistos[item.id]) return;
                    vistos[item.id] = true;
                    escolhidas.push(item);
                });

                limpar(grade);

                if (!escolhidas.length) {
                    const aviso = document.createElement('p');
                    aviso.className = 'news-empty';
                    aviso.textContent = 'Nenhuma outra notícia publicada no momento.';
                    grade.appendChild(aviso);
                    return [];
                }

                if (typeof window.criarCardNoticia === 'function') {
                    escolhidas.forEach(function (item) {
                        grade.appendChild(window.criarCardNoticia(item));
                    });
                }

                return escolhidas;
            })
            .catch(function (erro) {
                console.warn('Q GRAOS: não foi possível carregar as outras notícias.', erro && erro.message);

                limpar(grade);

                const aviso = document.createElement('p');
                aviso.className = 'news-empty';
                aviso.textContent = 'Não foi possível carregar as outras notícias agora.';
                grade.appendChild(aviso);

                return [];
            });
    }

    /* ---------- Espaço patrocinado do fim da matéria ---------- */

    function carregarAnuncio() {
        const caixa = byId('noticiaAnuncio');
        if (!caixa || !SUPABASE_ATIVO) return;

        const motor = window.QGAnuncios;
        if (!motor || typeof motor.iniciar !== 'function') return;

        motor.iniciar('noticia')
            .then(function () {
                /* O espaço do fim da matéria não tem formato fixo: o anúncio
                   sai da fila e é desenhado no formato declarado por ele
                   (faixa ou card). */
                const proximo = motor.proximo('noticia');

                if (!proximo) return;

                caixa.appendChild(proximo.elemento);
                caixa.hidden = false;

                motor.observar(proximo.elemento);
            })
            .catch(function (erro) {
                console.warn('Q GRAOS: não foi possível carregar o anúncio.', erro && erro.message);
            });
    }

    /* ---------- Mostrar a matéria ---------- */

    function mostrarNoticia(noticia) {
        const conteudo = byId('noticiaConteudo');
        const erro = byId('noticiaErro');

        if (erro) erro.hidden = true;
        if (conteudo) conteudo.hidden = false;

        const titulo = byId('noticiaTitulo');
        if (titulo) titulo.textContent = noticia.titulo || '';

        const resumo = byId('noticiaResumo');
        if (resumo) {
            resumo.textContent = noticia.resumo || '';
            resumo.hidden = !noticia.resumo;
        }

        const rotulo = rotuloCategoria(noticia.categoria);

        const categoria = byId('noticiaCategoria');
        if (categoria) {
            categoria.textContent = rotulo;
            categoria.href = 'noticias.html?categoria=' + encodeURIComponent(noticia.categoria || 'Geral');
        }

        const trilha = byId('noticiaTrilhaCategoria');
        if (trilha) trilha.textContent = rotulo;

        const data = byId('noticiaData');
        if (data) {
            data.textContent = formatarDataLonga(noticia.publicado_em);
            if (noticia.publicado_em) data.setAttribute('datetime', noticia.publicado_em);
        }

        const leitura = byId('noticiaTempoLeitura');
        if (leitura) leitura.textContent = tempoLeitura(noticia.conteudo || noticia.resumo || '');

        escreverCapa(noticia);
        escreverTexto(noticia);
        escreverCredito(noticia);
        montarCompartilhar(noticia);
        montarLead(noticia);
        montarSeo(noticia);

        registrarVisualizacao(noticia);

        carregarMaisNoticias(noticia);
        carregarAnuncio();
    }

    /* ---------- Partida ---------- */

    function iniciar() {
        const parametros = new URLSearchParams(window.location.search);
        const id = (parametros.get('id') || '').trim();

        // Só aceitamos o formato de id do banco (uuid com traços)
        if (!id || !/^[a-fA-F0-9-]{8,64}$/.test(id)) {
            mostrarErro(
                'Notícia não encontrada',
                'O endereço acessado não aponta para uma notícia do site. Escolha uma das notícias mais recentes.'
            );
            return;
        }

        if (!SUPABASE_ATIVO) {
            mostrarErro(
                'Notícias em breve',
                'A área de notícias da Q GRÃOS está sendo preparada. Fale com a nossa equipe pelo WhatsApp enquanto isso.'
            );
            return;
        }

        const campos = 'id,titulo,resumo,conteudo,categoria,fonte,url,imagem_url,publicado_em';

        SUPABASE.select('noticias',
            'select=' + campos + '&publicado=eq.true&id=eq.' + encodeURIComponent(id))
            .then(function (linhas) {
                const lista = Array.isArray(linhas) ? linhas : [];

                if (!lista.length) {
                    mostrarErro(
                        'Notícia não encontrada',
                        'Esta notícia não existe ou já saiu do ar. Escolha uma das notícias mais recentes.'
                    );
                    return;
                }

                mostrarNoticia(lista[0]);
            })
            .catch(function (erro) {
                console.warn('Q GRAOS: não foi possível carregar a notícia.', erro && erro.message);

                mostrarErro(
                    'Não foi possível abrir a notícia',
                    'Houve um problema ao carregar esta notícia. Tente novamente em instantes ou volte para a listagem.'
                );
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
