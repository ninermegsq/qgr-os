'use strict';

/* ------------------------------------------------------------------
 * Verificacao visual automatica (headless Chrome)
 * ------------------------------------------------------------------
 * Sobe o servidor local, abre o site no Chrome de verdade e mede o
 * que so aparece na tela:
 *   - rolagem horizontal (overflow) e elementos que estouram a viewport
 *   - se cada icone do sprite SVG realmente desenha alguma coisa
 *   - se as imagens carregaram
 *   - se todo o conteudo com reveal apareceu depois de rolar a pagina
 *   - contraste de texto (WCAG AA) em pontos chave
 *   - menu hamburguer no mobile, tilt 3D no desktop (e desligado no touch)
 *   - envio do formulario gerando o link certo do WhatsApp
 *   - screenshots em tools/shots/*.png
 *
 * Roda: npm run visual
 * Nao precisa baixar navegador: usa o Chrome ja instalado na maquina.
 * ------------------------------------------------------------------ */

const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS_DIR = path.join(__dirname, 'shots');
const REPORT_PATH = path.join(__dirname, 'visual-report.json');
const PORT = Number(process.env.VISUAL_PORT) || 8098;
const HOST = '127.0.0.1';

const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
];

const VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900, isMobile: false },
    { name: 'mobile', width: 390, height: 844, isMobile: true },
    { name: 'mobile-small', width: 360, height: 740, isMobile: true }
];

const PAGES = [
    { name: 'home', url: '/' },
    { name: 'noticias', url: '/noticias.html' },
    { name: 'noticia', url: '/noticia.html' },
    { name: 'publicidade', url: '/publicidade.html' },
    { name: '404', url: '/404.html' },
    { name: 'admin', url: '/admin/' }
];

const problems = [];
const notes = [];

/* Identificadores de visitante gerados pelo navegador de teste.
 * Todas as visitas com esses ids sao apagadas no fim da verificacao,
 * para o painel nao virar lixo de teste. */
const VISITANTES_TESTE = new Set();

/* Endereco do backend Supabase. Falha de rede aqui e problema do
 * servidor, nao do site: o site precisa funcionar sem o banco. */
const HOST_SUPABASE = /https:\/\/[a-z0-9-]+\.supabase\.co/i;

function ehRotaDoSupabase(url) {
    return HOST_SUPABASE.test(String(url || ''));
}

function findChrome() {
    for (const candidate of CHROME_CANDIDATES) {
        if (candidate && fs.existsSync(candidate)) return candidate;
    }
    return null;
}

function waitForServer() {
    return new Promise(resolve => {
        let attempts = 0;

        const tryAgain = () => {
            const request = http.get(
                { host: HOST, port: PORT, path: '/', timeout: 2000 },
                response => {
                    response.resume();
                    if (response.statusCode === 200) return resolve(true);
                    retry();
                }
            );

            request.on('error', retry);
            request.on('timeout', () => { request.destroy(); retry(); });

            function retry() {
                attempts += 1;
                if (attempts > 50) return resolve(false);
                setTimeout(tryAgain, 200);
            }
        };

        tryAgain();
    });
}

/* ------------------------------------------------------------------
 * Auditoria do DOM (roda dentro do navegador)
 * ------------------------------------------------------------------ */
function auditDom() {
    const result = {};
    const viewportWidth = window.innerWidth;

    result.viewport = { width: viewportWidth, height: window.innerHeight };
    result.scroll = {
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        hasHorizontalScroll:
            document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 ||
            document.body.scrollWidth > document.body.clientWidth + 1
    };

    // Elementos que passam da borda da tela (podem estar cortados pelo overflow hidden)
    const offenders = [];

    /* Faixa que rola na horizontal (ex.: os chips de filtro no celular):
       o que sobra da tela ali e de proposito, o visitante arrasta com o
       dedo. Quando um ancestral rola na horizontal, o item nao vaza:
       o problema real (a pagina inteira rolando) e medido em
       result.scroll.hasHorizontalScroll. */
    function dentroDeFaixaQueRola(element) {
        let node = element.parentElement;

        while (node && node !== document.body) {
            const estilo = getComputedStyle(node);
            const rola = ['auto', 'scroll'].indexOf(estilo.overflowX) !== -1;
            if (rola && node.scrollWidth > node.clientWidth + 1) return true;
            node = node.parentElement;
        }

        return false;
    }

    document.querySelectorAll('body *').forEach(element => {
        if (element.closest('svg[aria-hidden="true"]')) return;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        const rect = element.getBoundingClientRect();
        if (!rect.width && !rect.height) return;
        if (rect.right > viewportWidth + 1 || rect.left < -1) {
            if (dentroDeFaixaQueRola(element)) return;
            const className = typeof element.className === 'string'
                ? element.className
                : (element.className.baseVal || '');
            offenders.push({
                tag: element.tagName.toLowerCase(),
                class: className.slice(0, 60),
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width)
            });
        }
    });
    result.overflowOffenders = offenders.slice(0, 20);

    /* ---------- Sprite de icones ---------- */
    const symbols = Array.from(document.querySelectorAll('svg symbol')).map(symbol => symbol.id);
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    probe.setAttribute('width', '24');
    probe.setAttribute('height', '24');
    probe.setAttribute('viewBox', '0 0 24 24');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:24px;height:24px;';
    document.body.appendChild(probe);

    const sprite = {};

    symbols.forEach(id => {
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#' + id);
        use.setAttribute('width', '24');
        use.setAttribute('height', '24');
        probe.appendChild(use);

        let box = null;
        let error = null;

        try {
            const bbox = use.getBBox();
            box = {
                x: Math.round(bbox.x * 100) / 100,
                y: Math.round(bbox.y * 100) / 100,
                width: Math.round(bbox.width * 100) / 100,
                height: Math.round(bbox.height * 100) / 100
            };
        } catch (bboxError) {
            error = bboxError.message;
        }

        sprite[id] = {
            bbox: box,
            error,
            draws: !!(box && (box.width >= 0.5 || box.height >= 0.5))
        };

        probe.removeChild(use);
    });

    probe.remove();
    result.sprite = sprite;

    result.brokenIconRefs = [];
    const usedIds = new Set();

    document.querySelectorAll('use').forEach(use => {
        const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
        if (!href.startsWith('#')) return;
        usedIds.add(href.slice(1));
        if (!document.querySelector('symbol' + href)) {
            result.brokenIconRefs.push(href.slice(1));
        }
    });

    result.unusedSymbols = symbols.filter(id => !usedIds.has(id));

    /* ---------- Imagens ---------- */
    result.images = Array.from(document.images).map(image => ({
        src: image.getAttribute('src'),
        /* Imagem sem src e um espaco reservado que o JS preenche
           (a capa da materia, por exemplo): nao conta como falha. */
        hasSrc: image.hasAttribute('src') && !!image.getAttribute('src'),
        alt: image.getAttribute('alt'),
        loaded: image.complete && image.naturalWidth > 0,
        natural: image.naturalWidth + 'x' + image.naturalHeight,
        hasAlt: image.hasAttribute('alt')
    }));

    /* ---------- Reveal (animacao ao rolar) ---------- */
    const revealItems = Array.from(document.querySelectorAll('[data-aos]'));
    result.reveal = { total: revealItems.length, visible: 0, hidden: [] };

    revealItems.forEach(element => {
        const style = getComputedStyle(element);
        const opacity = parseFloat(style.opacity);
        const isVisible = element.classList.contains('is-visible') && opacity > 0.98;
        if (isVisible) {
            result.reveal.visible += 1;
        } else {
            result.reveal.hidden.push({
                tag: element.tagName.toLowerCase(),
                class: (typeof element.className === 'string' ? element.className : '').slice(0, 60),
                opacity: style.opacity,
                hasIsVisible: element.classList.contains('is-visible')
            });
        }
    });

    /* ---------- Contraste (WCAG AA) ---------- */
    function parseColor(value) {
        if (!value) return null;

        const hex = value.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
        if (hex) {
            let digits = hex[1];
            if (digits.length === 3) {
                digits = digits[0] + digits[0] + digits[1] + digits[1] + digits[2] + digits[2];
            }
            return {
                r: parseInt(digits.slice(0, 2), 16),
                g: parseInt(digits.slice(2, 4), 16),
                b: parseInt(digits.slice(4, 6), 16),
                a: 1
            };
        }

        const match = value.match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
        if (parts.length < 3) return null;
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }

    function parseColorStops(value) {
        const stops = [];
        const regex = /rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/g;
        let match;
        while ((match = regex.exec(value)) !== null) {
            const color = parseColor(match[0]);
            if (color) stops.push(color);
        }
        return stops;
    }

    function composite(foreground, background) {
        const alpha = foreground.a === undefined ? 1 : foreground.a;
        return {
            r: foreground.r * alpha + background.r * (1 - alpha),
            g: foreground.g * alpha + background.g * (1 - alpha),
            b: foreground.b * alpha + background.b * (1 - alpha),
            a: 1
        };
    }

    function luminance(color) {
        const channel = value => {
            const c = value / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    }

    function contrastRatio(foreground, background) {
        const light = luminance(foreground);
        const dark = luminance(background);
        return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
    }

    // Fundo real atras do texto: gradientes contam como candidatos,
    // fotos (url) ficam como "nao determinavel".
    function effectiveBackgrounds(element) {
        const chain = [];
        let node = element;
        while (node && node.nodeType === 1) {
            chain.push(node);
            node = node.parentElement;
        }

        let backdrop = { r: 255, g: 255, b: 255, a: 1 };
        let found = null;

        chain.reverse().forEach(elementInChain => {
            const style = getComputedStyle(elementInChain);
            const backgroundImage = style.backgroundImage;
            const backgroundColor = parseColor(style.backgroundColor);

            let local = backdrop;
            if (backgroundColor && backgroundColor.a >= 1) local = backgroundColor;
            else if (backgroundColor && backgroundColor.a > 0) local = composite(backgroundColor, backdrop);

            let nextBackdrop = local;

            if (backgroundImage && backgroundImage !== 'none') {
                if (/url\(/i.test(backgroundImage)) {
                    // Imagem de fundo: so da para medir quando existe uma cor
                    // opaca por baixo (ex.: a seta do <select> desenhada sobre
                    // o campo branco). Sem cor opaca, o fundo e indeterminado.
                    found = {
                        candidates: [local],
                        indeterminate: !(backgroundColor && backgroundColor.a >= 1)
                    };
                } else {
                    const stops = parseColorStops(backgroundImage).map(stop => composite(stop, local));
                    if (stops.length) {
                        found = { candidates: stops, indeterminate: false };
                        // O gradiente tambem vira o fundo dos filhos
                        nextBackdrop = { r: 0, g: 0, b: 0, a: 1 };
                        stops.forEach(stop => {
                            nextBackdrop.r += stop.r / stops.length;
                            nextBackdrop.g += stop.g / stops.length;
                            nextBackdrop.b += stop.b / stops.length;
                        });
                    } else {
                        found = { candidates: [local], indeterminate: false };
                    }
                }
            } else if (backgroundColor && backgroundColor.a > 0) {
                found = { candidates: [local], indeterminate: false };
            }

            backdrop = nextBackdrop;
        });

        return found || { candidates: [{ r: 255, g: 255, b: 255, a: 1 }], indeterminate: false };
    }

    // Opacidade acumulada do elemento (texto com opacity < 1 fica mais fraco)
    function accumulatedOpacity(element) {
        let total = 1;
        let node = element;
        while (node && node.nodeType === 1) {
            const style = getComputedStyle(node);
            total *= parseFloat(style.opacity);
            node = node.parentElement;
        }
        return total;
    }

    function toHex(color) {
        const part = value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');
        return '#' + part(color.r) + part(color.g) + part(color.b);
    }

    const CONTRAST_TARGETS = [
        '.hero p',
        '.hero-tag',
        '.section-tag',
        '.highlight',
        '.nav-links a',
        '.service-card p',
        '.product-info p',
        '.info-item h4',
        '.info-item p',
        '.info-item a',
        '.form-note',
        '.form-group label',
        '.form-group input',
        '.form-group textarea',
        '.form-group select',
        '.form-group option',
        '.footer-bottom p',
        '.footer-col p',
        '.footer-col ul li a',
        '.badge',
        '.cta-box p',
        '.products-footer p',
        '.stat-item h3',
        '.news-category',
        '.news-date',
        '.news-card h3',
        '.news-card p',
        '.news-empty',
        '.check-label'
    ];

    result.contrast = [];

    CONTRAST_TARGETS.forEach(selector => {
        Array.from(document.querySelectorAll(selector)).forEach((element, index) => {
            const style = getComputedStyle(element);
            const foreground = parseColor(style.color);
            if (!foreground) return;

            const backgrounds = effectiveBackgrounds(element);
            const opacity = accumulatedOpacity(element);
            const effectiveForeground = composite(
                { r: foreground.r, g: foreground.g, b: foreground.b, a: foreground.a * opacity },
                backgrounds.candidates[0]
            );

            // pior caso: o contraste menor entre o texto e os fundos candidatos
            let ratio = Infinity;
            backgrounds.candidates.forEach(candidate => {
                ratio = Math.min(ratio, contrastRatio(effectiveForeground, candidate));
            });

            const fontSize = parseFloat(style.fontSize);
            const bold = parseInt(style.fontWeight, 10) >= 700;
            const large = fontSize >= 24 || (fontSize >= 18.66 && bold);
            const minimum = large ? 3 : 4.5;

            const where = element.closest('section, footer, nav, header')
                ? element.closest('section, footer, nav, header').id || element.closest('section, footer, nav, header').tagName.toLowerCase()
                : 'body';

            result.contrast.push({
                selector: selector + (index ? '[' + index + ']' : ''),
                where,
                ratio: Math.round(ratio * 100) / 100,
                minimum,
                fontSize: style.fontSize,
                color: style.color,
                foreground: toHex(effectiveForeground),
                background: backgrounds.candidates.map(toHex).join(' | '),
                passes: ratio >= minimum,
                indeterminate: backgrounds.indeterminate
            });
        });
    });

    /* ---------- Hero: conteudo cortado? ---------- */
    const hero = document.querySelector('.hero');
    const heroContent = document.querySelector('.hero-content');

    if (hero && heroContent) {
        const heroRect = hero.getBoundingClientRect();
        const contentRect = heroContent.getBoundingClientRect();
        const heroStyle = getComputedStyle(hero);

        const clippedChildren = [];
        Array.from(heroContent.children).forEach(child => {
            const rect = child.getBoundingClientRect();
            if (rect.bottom > heroRect.bottom + 1 || rect.top < heroRect.top - 1) {
                clippedChildren.push({
                    tag: child.tagName.toLowerCase(),
                    class: (typeof child.className === 'string' ? child.className : '').slice(0, 40),
                    bottom: Math.round(rect.bottom),
                    heroBottom: Math.round(heroRect.bottom)
                });
            }
        });

        result.hero = {
            heroHeight: Math.round(heroRect.height),
            contentHeight: Math.round(contentRect.height),
            overflow: Math.round(contentRect.height - heroRect.height),
            overflowHidden: heroStyle.overflow === 'hidden',
            clippedChildren
        };
    }

    /* ---------- Secao de noticias e botao de WhatsApp da navegacao ---------- */
    const newsGrid = document.getElementById('newsGrid');
    const navWhatsapp = document.querySelector('.nav-whatsapp');
    const newsEmpty = newsGrid ? newsGrid.querySelector('.news-empty') : null;
    const botaoMais = document.getElementById('newsMais');
    const linkNoticias = document.querySelector('a[href="noticias.html"]');

    result.news = {
        sectionExists: !!document.getElementById('noticias'),
        gridExists: !!newsGrid,
        cards: newsGrid ? newsGrid.querySelectorAll('.news-card').length : 0,
        /* O card da manchete precisa ter a classe que o contador de clique
           do script.js reconhece e o id da noticia: sem os dois a metrica
           de cliques nao e alimentada. */
        cardsSemClasse: newsGrid ? newsGrid.querySelectorAll('.news-card:not(.news-card-link)').length : 0,
        cardsSemId: newsGrid ? newsGrid.querySelectorAll('.news-card:not([data-noticia-id])').length : 0,
        cardsParaFora: newsGrid ? newsGrid.querySelectorAll('.news-card:not([href^="noticia.html?id="])').length : 0,
        emptyMessage: newsEmpty ? (newsEmpty.textContent || '').trim().slice(0, 80) : '',
        navWhatsappExists: !!navWhatsapp,
        navWhatsappVisible: navWhatsapp ? navWhatsapp.getBoundingClientRect().width > 0 : false,
        navWhatsappHref: navWhatsapp ? (navWhatsapp.getAttribute('href') || '') : '',
        linkParaPaginaDeNoticias: !!linkNoticias,
        botaoMaisExiste: !!botaoMais,
        botaoMaisVisivel: botaoMais ? botaoMais.getBoundingClientRect().width > 0 : false
    };

    /* ---------- Pagina da materia hospedada ---------- */
    const corpo = document.getElementById('noticiaCorpo');
    const estadoErro = document.getElementById('noticiaErro');
    const conteudo = document.getElementById('noticiaConteudo');
    const blocoAnuncio = document.getElementById('noticiaAnuncio');
    const maisNoticias = document.getElementById('maisNoticias');
    const gradeMais = document.getElementById('newsMaisGrid');

    const linkCanonical = document.querySelector('link[rel="canonical"]');
    const blocoLd = document.getElementById('noticiaLdJson');

    let tipoLd = '';
    try {
        tipoLd = JSON.parse((blocoLd && blocoLd.textContent) || '{}')['@type'] || '';
    } catch (erro) {
        tipoLd = '';
    }

    const metaOg = document.querySelector('meta[property="og:title"]');
    const metaTwitter = document.querySelector('meta[name="twitter:card"]');

    result.noticia = {
        corpoExiste: !!corpo,
        erroExiste: !!estadoErro,
        erroVisivel: estadoErro ? !estadoErro.hidden : false,
        conteudoVisivel: conteudo ? !conteudo.hidden : false,
        titulo: (document.getElementById('noticiaTitulo') || { textContent: '' }).textContent.trim().slice(0, 80),
        paragrafos: corpo ? corpo.querySelectorAll('p, h2, ul').length : 0,
        canonical: linkCanonical ? (linkCanonical.getAttribute('href') || '') : '',
        jsonLdTipo: tipoLd,
        ogTitle: metaOg ? (metaOg.getAttribute('content') || '') : '',
        twitterCard: metaTwitter ? (metaTwitter.getAttribute('content') || '') : '',
        blocosAnuncio: blocoAnuncio ? blocoAnuncio.querySelectorAll('[data-anuncio-id]').length : 0,
        seloVisivel: blocoAnuncio ? blocoAnuncio.querySelectorAll('.anuncio-selo').length : 0,
        avisoAnuncio: blocoAnuncio ? blocoAnuncio.querySelectorAll('.anuncio-aviso').length : 0,
        maisNoticiasExiste: !!maisNoticias,
        maisNoticiasCards: gradeMais ? gradeMais.querySelectorAll('.news-card').length : 0,
        maisNoticiasSemClasse: gradeMais ? gradeMais.querySelectorAll('.news-card:not(.news-card-link)').length : 0,
        maisNoticiasSemId: gradeMais ? gradeMais.querySelectorAll('.news-card:not([data-noticia-id])').length : 0
    };

    /* ---------- Filtro por categoria ---------- */
    const filtro = document.getElementById('filtroCategorias');
    const chips = document.getElementById('filtroChips');

    result.filtro = {
        containerExiste: !!filtro,
        chipsExiste: !!chips,
        chips: chips ? chips.querySelectorAll('button[aria-pressed]').length : 0,
        chipsPressionados: chips ? chips.querySelectorAll('button[aria-pressed="true"]').length : 0,
        urlTemCategoria: window.location.search.indexOf('categoria=') !== -1,
        canonical: (document.querySelector('link[rel="canonical"]') || { getAttribute: () => '' })
            .getAttribute('href') || '',
        robots: (document.querySelector('meta[name="robots"]') || { getAttribute: () => '' })
            .getAttribute('content') || '',
        cards: (document.getElementById('newsGrid') || { querySelectorAll: () => [] })
            .querySelectorAll('.news-card').length
    };

    /* ---------- Anuncios e selo de publicidade ---------- */
    const selos = document.querySelectorAll('.anuncio-selo');

    /* So conta como bloco o elemento que carrega o formato pedido pelo
       anunciante. Dentro do bloco, o botao "Saiba mais" tambem leva o id
       do anuncio, mas ele e o link, nao um bloco na tela. */
    const blocosAnuncio = Array.from(document.querySelectorAll('[data-anuncio-formato]'));

    /* O bloco precisa combinar com o formato pedido pelo anunciante:
       faixa = .anuncio-faixa, card = .anuncio-card. */
    const formatosIncorretos = blocosAnuncio.filter(bloco => {
        const formato = bloco.getAttribute('data-anuncio-formato') || '';
        if (formato === 'faixa') return !bloco.classList.contains('anuncio-faixa');
        if (formato === 'card') return !bloco.classList.contains('anuncio-card');
        return true;
    }).length;

    const idsAnuncio = blocosAnuncio
        .map(bloco => bloco.getAttribute('data-anuncio-id'))
        .filter(Boolean);

    result.ad = {
        selos: selos.length,
        linksSponsored: document.querySelectorAll('a[rel*="sponsored"]').length,
        linksSemNoFollow: Array.from(document.querySelectorAll('a[rel*="sponsored"]'))
            .filter(link => (link.getAttribute('rel') || '').indexOf('nofollow') === -1).length,
        /* Rodizio: o que o site colocou na tela de verdade */
        blocos: blocosAnuncio.length,
        formatosIncorretos: formatosIncorretos,
        semFormato: blocosAnuncio.filter(bloco => !bloco.getAttribute('data-anuncio-formato')).length,
        /* O mesmo anunciante nao pode aparecer duas vezes na mesma tela */
        idsDuplicados: idsAnuncio.length - new Set(idsAnuncio).size,
        /* Todo bloco patrocinado precisa do selo visivel de Publicidade */
        blocosSemSelo: blocosAnuncio.filter(bloco => !bloco.querySelector('.anuncio-selo')).length,
        motorPresente: typeof window.QGAnuncios === 'object' && window.QGAnuncios !== null,
        cicloMontado: typeof window.QGAnuncios === 'object' && window.QGAnuncios !== null
            ? Object.keys(window.QGAnuncios).length > 0
            : false
    };

    /* ---------- Foco visivel no teclado ---------- */
    const focusTarget = document.querySelector('.nav-links a, .btn-primary');
    if (focusTarget) {
        focusTarget.focus();
        const focusStyle = getComputedStyle(focusTarget);
        const hasOutline = focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) > 0;
        const hasShadow = focusStyle.boxShadow && focusStyle.boxShadow !== 'none';
        result.focusVisible = { selector: focusTarget.tagName.toLowerCase(), hasOutline, hasShadow };
        focusTarget.blur();
    }

    return result;
}

/* ------------------------------------------------------------------
 * Conteudo de verdade (noticia e anuncio publicados)
 * ------------------------------------------------------------------ */

/* Le a url e a chave publica do site */
function configuracaoSite() {
    try {
        const conteudo = fs.readFileSync(path.join(ROOT, 'site.config.js'), 'utf8');
        const url = (conteudo.match(/url:\s*'([^']+)'/) || [])[1] || '';
        const chave = (conteudo.match(/anonKey:\s*'([^']*)'/) || [])[1] || '';

        return { url: url.trim(), chave: chave.trim() };
    } catch (erro) {
        return { url: '', chave: '' };
    }
}

/* Consulta o Supabase (somente leitura, chave publica) e devolve uma
 * noticia publicada de verdade. Sem noticia publicada a pagina da
 * materia so pode ser testada no estado de erro. */
function buscarNoticiaPublicada() {
    const config = configuracaoSite();

    if (!config.url || !config.chave) return Promise.resolve(null);

    const caminho = '/rest/v1/noticias?select=id,categoria&publicado=eq.true' +
        '&order=publicado_em.desc&limit=1';

    return new Promise(resolve => {
        try {
            const requisicao = https.request(config.url + caminho, {
                method: 'GET',
                timeout: 8000,
                headers: {
                    apikey: config.chave,
                    Accept: 'application/json'
                }
            }, resposta => {
                let corpo = '';
                resposta.setEncoding('utf8');
                resposta.on('data', parte => { corpo += parte; });
                resposta.on('end', () => {
                    if (resposta.statusCode !== 200) return resolve(null);
                    try {
                        const linhas = JSON.parse(corpo);
                        resolve(Array.isArray(linhas) && linhas[0] ? linhas[0] : null);
                    } catch (erro) {
                        resolve(null);
                    }
                });
            });

            requisicao.on('error', () => resolve(null));
            requisicao.on('timeout', () => { requisicao.destroy(); resolve(null); });
            requisicao.end();
        } catch (erro) {
            resolve(null);
        }
    });
}

/* ------------------------------------------------------------------
 * Verificacao do painel administrativo (com login de verdade)
 * ------------------------------------------------------------------
 * Abre /admin/, confere a tela de login e, se houver credencial,
 * entra no painel e percorre as quatro abas (Resumo, Noticias,
 * Leads, Visitas) conferindo se os dados carregam sem erro.
 *
 * A credencial vem do ambiente (QG_ADMIN_EMAIL / QG_ADMIN_PASSWORD)
 * ou do arquivo local .qg-admin.json (que NAO vai para o Git).
 * Sem credencial o teste para na tela de login e registra um aviso.
 * ------------------------------------------------------------------ */
function credenciaisAdmin() {
    const email = process.env.QG_ADMIN_EMAIL || '';
    const senha = process.env.QG_ADMIN_PASSWORD || '';

    if (email && senha) return { email: email, senha: senha, origem: 'variaveis de ambiente' };

    const arquivo = path.join(ROOT, '.qg-admin.json');

    if (fs.existsSync(arquivo)) {
        try {
            const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
            if (dados && dados.email && dados.password) {
                return { email: dados.email, senha: dados.password, origem: '.qg-admin.json' };
            }
        } catch (erro) {
            /* arquivo invalido: segue sem login */
        }
    }

    return null;
}

async function verificarPainelAdmin(browser, report) {
    const label = 'admin/login';
    const page = await browser.newPage();

    const consoleErrors = [];
    const badResponses = [];
    const failedRequests = [];

    page.on('console', message => {
        if (message.type() === 'error') {
            const local = message.location();
            consoleErrors.push({ text: message.text(), url: (local && local.url) || '' });
        }
    });
    page.on('pageerror', error => consoleErrors.push({ text: 'pageerror: ' + error.message, url: '' }));
    page.on('response', response => {
        if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() });
    });
    page.on('requestfailed', request => {
        failedRequests.push({
            url: request.url(),
            reason: request.failure() ? request.failure().errorText : 'desconhecido'
        });
    });

    await page.setViewport({ width: 1440, height: 900 });

    const resposta = await page.goto('http://' + HOST + ':' + PORT + '/admin/', {
        waitUntil: 'networkidle2',
        timeout: 45000
    });

    if (resposta && resposta.status() !== 200) {
        report.problems.push(label + ': HTTP ' + resposta.status() + ' (esperava 200)');
    }

    const tela = await page.evaluate(() => {
        const login = document.getElementById('loginScreen');
        const app = document.getElementById('app');
        const robots = (document.querySelector('meta[name="robots"]') || {}).content || '';

        return {
            loginVisivel: !!login && !login.hidden && login.getBoundingClientRect().height > 0,
            appOculto: !!app && app.hidden,
            temFormulario: !!document.getElementById('loginForm'),
            semIndice: /noindex/i.test(robots),
            titulo: (document.title || '').slice(0, 60)
        };
    });

    if (!tela.loginVisivel) report.problems.push(label + ': tela de login do painel nao apareceu');
    if (!tela.appOculto) report.problems.push(label + ': painel abriu sem login');
    if (!tela.temFormulario) report.problems.push(label + ': formulario de login ausente');
    if (!tela.semIndice) report.problems.push(label + ': painel sem "noindex" (o Google pode indexar)');

    const credenciais = credenciaisAdmin();
    const painel = { logado: false, abas: {} };

    if (!credenciais) {
        report.notes.push(label + ': sem credencial de admin (QG_ADMIN_EMAIL/QG_ADMIN_PASSWORD ou .qg-admin.json) - verificada apenas a tela de login');
    } else {
        await page.click('#loginEmail');
        await page.type('#loginEmail', credenciais.email, { delay: 5 });
        await page.click('#loginPassword');
        await page.type('#loginPassword', credenciais.senha, { delay: 5 });
        await page.click('#loginButton');

        const limite = Date.now() + 25000;

        while (Date.now() < limite) {
            const estado = await page.evaluate(() => {
                const app = document.getElementById('app');
                const alerta = document.getElementById('loginAlert');
                return {
                    appVisivel: !!app && !app.hidden,
                    alerta: alerta && !alerta.hidden ? (alerta.textContent || '').trim() : ''
                };
            });

            if (estado.appVisivel) {
                painel.logado = true;
                break;
            }

            if (estado.alerta) break;

            await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (!painel.logado) {
            const alerta = await page.evaluate(() => {
                const node = document.getElementById('loginAlert');
                return node && !node.hidden ? (node.textContent || '').trim() : '';
            });

            // Credencial errada e problema real do teste; so a falta de
            // rede ou erro 5xx do Supabase contam como "backend fora do ar".
            const semRede = failedRequests.some(item => ehRotaDoSupabase(item.url));
            const erroServidor = badResponses.some(item => ehRotaDoSupabase(item.url) && item.status >= 500);

            if (semRede || erroServidor) {
                report.notes.push(label + ': Supabase indisponivel - o login do painel nao pode ser verificado');
            } else {
                report.problems.push(label + ': login do painel falhou' + (alerta ? ' -> ' + alerta : ''));
            }
        } else {
            /* O bug relatado: depois do login, a tela de login continuava
               aberta e o painel aparecia embaixo dela. A causa era o
               atributo hidden ser vencido pelo display:flex do
               .login-screen — por isso a conferimos de verdade (display
               computed e altura), e nao so o atributo. */
            const telaDepois = await page.evaluate(() => {
                const login = document.getElementById('loginScreen');
                const app = document.getElementById('app');
                const estiloLogin = login ? getComputedStyle(login) : null;
                const estiloApp = app ? getComputedStyle(app) : null;

                return {
                    loginComHidden: !!login && login.hidden,
                    loginDisplay: estiloLogin ? estiloLogin.display : '',
                    loginAltura: login ? Math.round(login.getBoundingClientRect().height) : 0,
                    appDisplay: estiloApp ? estiloApp.display : '',
                    appAltura: app ? Math.round(app.getBoundingClientRect().height) : 0,
                    appVisivel: !!app && !app.hidden && app.getBoundingClientRect().height > 0
                };
            });

            painel.telaDepoisDoLogin = telaDepois;

            if (!telaDepois.loginComHidden || telaDepois.loginDisplay !== 'none' || telaDepois.loginAltura > 0) {
                report.problems.push('admin/login: a tela de login continua visivel depois do login (o painel abre embaixo dela)');
            }
            if (!telaDepois.appVisivel) {
                report.problems.push('admin/login: o painel nao ficou visivel depois do login');
            }

            // Espera o resumo preencher os cartoes
            await page.waitForFunction(() => {
                const cartoes = document.getElementById('cardsResumo');
                return !!cartoes && cartoes.children.length > 0;
            }, { timeout: 15000 }).catch(() => { /* dealtido nas regras abaixo */ });

            const abas = ['resumo', 'noticias', 'anuncios', 'leads', 'visitas'];

            for (const aba of abas) {
                await page.evaluate(nome => {
                    const botao = document.querySelector('.tab[data-tab="' + nome + '"]');
                    if (botao) botao.click();
                }, aba);

                await new Promise(resolve => setTimeout(resolve, 1500));

                const estadoAba = await page.evaluate(nome => {
                    const painelAba = document.getElementById('tab-' + nome);
                    const celulas = painelAba ? Array.from(painelAba.querySelectorAll('td')) : [];
                    const erro = celulas.find(celula => /^Erro ao carregar/i.test((celula.textContent || '').trim()));

                    return {
                        visivel: !!painelAba && !painelAba.hidden,
                        erro: erro ? (erro.textContent || '').trim().slice(0, 160) : '',
                        linhas: painelAba ? painelAba.querySelectorAll('tbody tr').length : 0,
                        cartoes: document.getElementById('cardsResumo').children.length
                    };
                }, aba);

                painel.abas[aba] = estadoAba;

                if (!estadoAba.visivel) {
                    report.problems.push('admin/' + aba + ': aba nao abriu');
                }
                if (estadoAba.erro) {
                    report.problems.push('admin/' + aba + ': erro ao carregar os dados -> ' + estadoAba.erro);
                }
                if (aba === 'resumo' && !estadoAba.cartoes) {
                    report.problems.push('admin/resumo: os cartoes do resumo nao carregaram');
                }
            }

            await page.evaluate(() => {
                const botao = document.querySelector('.tab[data-tab="resumo"]');
                if (botao) botao.click();
            });
            await new Promise(resolve => setTimeout(resolve, 400));

            // O formulario testado na home gravou um lead de teste.
            // Ele e apagado aqui para nao sujar o painel de quem usa o site.
            const limpeza = await page.evaluate(async () => {
                if (!window.QGSupabase) return { apagados: 0, erro: 'cliente do Supabase ausente' };

                try {
                    const filtro = 'email=eq.' + encodeURIComponent('teste@exemplo.com.br');
                    const antes = await window.QGSupabase.select('leads', 'select=id&' + filtro);

                    if (!antes || !antes.length) return { apagados: 0 };

                    await window.QGSupabase.remove('leads', filtro);

                    return { apagados: antes.length };
                } catch (erro) {
                    return { apagados: 0, erro: String((erro && erro.message) || erro) };
                }
            });

            painel.limpeza = limpeza;

            if (limpeza.erro) {
                report.notes.push('admin: nao foi possivel apagar o lead de teste -> ' + limpeza.erro);
            }

            // As visitas desta verificacao usam o identificador de visitante do
            // proprio navegador de teste (localStorage "qg_visitante").
            // Apagar so essas linhas mantem o painel limpo sem tocar nas
            // visitas de quem usa o site de verdade.
            //
            // Apaga as visitas de TODAS as paginas abertas nesta
            // verificacao (cada pagina pode ter gerado um identificador
            // de visitante diferente).
            //
            // O evento de analytics e enviado sem esperar a resposta: uma
            // visita pode chegar ao banco DEPOIS desta limpeza (a pagina
            // ja foi fechada com o fetch a caminho). Por isso a limpeza
            // roda em varias passadas, com uma pausa entre elas, e so
            // para quando nao sobra nenhuma linha de teste.
            const idsVisitantes = Array.from(VISITANTES_TESTE);

            const limpezaVisitas = await page.evaluate(async (ids) => {
                if (!window.QGSupabase) return { apagadas: 0, erro: 'cliente do Supabase ausente' };

                let apagadas = 0;
                let tentativas = 0;

                const apagar = async (filtro) => {
                    const antes = await window.QGSupabase.select('visitas', 'select=id&' + filtro);
                    if (!antes || !antes.length) return 0;
                    await window.QGSupabase.remove('visitas', filtro);
                    return antes.length;
                };

                try {
                    // Passadas: a ultima confere se sobrou alguma coisa.
                    while (tentativas < 4) {
                        tentativas += 1;

                        let nesta = 0;

                        for (const id of ids) {
                            nesta += await apagar('visitante_id=eq.' + encodeURIComponent(id));
                        }

                        // Rede de seguranca: apaga tambem as visitas que
                        // vieram do servidor local (referrer 127.0.0.1),
                        // mesmo que o identificador de visitante nao tenha
                        // sido capturado a tempo.
                        nesta += await apagar('referrer=like.*127.0.0.1*');

                        apagadas += nesta;

                        if (!nesta) break;

                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }

                    return { apagadas: apagadas, tentativas: tentativas };
                } catch (erro) {
                    return { apagadas: apagadas, erro: String((erro && erro.message) || erro) };
                }
            }, idsVisitantes);

            // Confere o que sobrou depois da limpeza: o painel tem que
            // mostrar zero visitas de teste.
            const restantes = await page.evaluate(async () => {
                if (!window.QGSupabase) return null;
                try {
                    const linhas = await window.QGSupabase.select('visitas', 'select=id&referrer=like.*127.0.0.1*');
                    return (linhas || []).length;
                } catch (erro) {
                    return null;
                }
            });

            painel.limpezaVisitas = limpezaVisitas;

            if (restantes !== null) {
                painel.limpezaVisitas.restantes = restantes;

                if (restantes > 0) {
                    report.notes.push('admin: sobraram ' + restantes + ' visita(s) de teste no painel');
                }
            }

            if (limpezaVisitas.erro) {
                report.notes.push('admin: nao foi possivel apagar as visitas de teste -> ' + limpezaVisitas.erro);
            }
        }
    }

    const shot = path.join(SHOTS_DIR, 'admin-painel.png');
    await page.screenshot({ path: shot, fullPage: true });

    report.painelAdmin = {
        url: '/admin/',
        status: resposta ? resposta.status() : 0,
        screenshot: path.relative(ROOT, shot).replace(/\\/g, '/'),
        tela: tela,
        telaDepoisDoLogin: painel.telaDepoisDoLogin || null,
        credencial: credenciais ? credenciais.origem : null,
        logado: painel.logado,
        abas: painel.abas,
        limpeza: painel.limpeza || null,
        limpezaVisitas: painel.limpezaVisitas || null,
        consoleErrors: consoleErrors,
        badResponses: badResponses,
        failedRequests: failedRequests
    };

    // Erros de console do painel: so contam quando nao vem do Supabase
    const supabaseSemRede = failedRequests.some(item => ehRotaDoSupabase(item.url));
    const supabaseRespondeu = badResponses.some(item => ehRotaDoSupabase(item.url));

    consoleErrors.forEach(item => {
        const mensagem = item.text || '';
        if (ehRotaDoSupabase(item.url) || ehRotaDoSupabase(mensagem) ||
            (supabaseSemRede && /net::ERR_FAILED|Failed to load resource/i.test(mensagem))) {
            report.notes.push('admin: Supabase indisponivel -> ' + mensagem);
            return;
        }
        if (supabaseRespondeu && /Failed to load resource/i.test(mensagem)) {
            report.notes.push('admin: Supabase recusou a requisicao -> ' + mensagem);
            return;
        }
        report.problems.push('admin: erro no console -> ' + mensagem);
    });

    failedRequests.forEach(item => {
        if (ehRotaDoSupabase(item.url)) {
            report.notes.push('admin: Supabase indisponivel -> ' + item.url);
            return;
        }
        report.problems.push('admin: requisicao falhou -> ' + item.url + ' (' + item.reason + ')');
    });

    await page.close();
}

/* ------------------------------------------------------------------
 * Execucao
 * ------------------------------------------------------------------ */
async function main() {
    const chromePath = findChrome();

    if (!chromePath) {
        console.log('');
        console.log('=== Verificacao visual ===');
        console.log('');
        console.log('  [ERRO]  Nenhum Chrome/Edge encontrado neste computador.');
        console.log('          Defina CHROME_PATH com o caminho do navegador e rode de novo.');
        console.log('');
        process.exit(1);
    }

    let puppeteer;
    try {
        puppeteer = require('puppeteer-core');
    } catch (error) {
        console.log('');
        console.log('=== Verificacao visual ===');
        console.log('');
        console.log('  [ERRO]  puppeteer-core nao esta instalado. Rode: npm install');
        console.log('');
        process.exit(1);
    }

    fs.mkdirSync(SHOTS_DIR, { recursive: true });

    const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
        env: Object.assign({}, process.env, { PORT: String(PORT), HOST }),
        stdio: 'ignore'
    });

    const ready = await waitForServer();
    if (!ready) {
        server.kill();
        console.log('  [ERRO]  O servidor local nao subiu na porta ' + PORT);
        process.exit(1);
    }

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--hide-scrollbars',
            '--force-device-scale-factor=1',
            // Emula mouse com ponteiro fino: sem isso o Chrome headless responde
            // "(hover: none)" e o tilt 3D nem chega a ser testado.
            '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4'
        ]
    });

    const report = {
        generatedAt: new Date().toISOString(),
        environment: {
            chrome: chromePath,
            node: process.version,
            server: 'http://' + HOST + ':' + PORT
        },
        pages: {},
        problems: [],
        notes: []
    };

    /* Paginas com conteudo de verdade: a materia hospedada e a
       listagem filtrada so fazem sentido com noticia publicada. */
    const paginas = PAGES.slice();
    const noticiaPublicada = await buscarNoticiaPublicada();

    if (noticiaPublicada && noticiaPublicada.id) {
        paginas.push({
            name: 'noticia-publicada',
            url: '/noticia.html?id=' + encodeURIComponent(noticiaPublicada.id)
        });

        if (noticiaPublicada.categoria) {
            paginas.push({
                name: 'noticias-filtradas',
                url: '/noticias.html?categoria=' + encodeURIComponent(noticiaPublicada.categoria)
            });
        }
    } else {
        report.notes.push('Nenhuma noticia publicada no banco: a materia e o filtro foram testados so com o aviso amigavel');
    }

    for (const target of paginas) {
        report.pages[target.name] = {};

        for (const viewport of VIEWPORTS) {
            const label = target.name + '-' + viewport.name;
            const page = await browser.newPage();

            const consoleErrors = [];
            const consoleWarnings = [];
            const failedRequests = [];
            const badResponses = [];

            page.on('console', message => {
                const type = message.type();
                if (type === 'error') {
                    const local = message.location();
                    consoleErrors.push({
                        text: message.text(),
                        url: (local && local.url) || ''
                    });
                }
                if (type === 'warning') consoleWarnings.push(message.text());
            });
            page.on('pageerror', error => consoleErrors.push({
                text: 'pageerror: ' + error.message,
                url: ''
            }));
            page.on('requestfailed', request => {
                failedRequests.push({
                    url: request.url(),
                    reason: request.failure() ? request.failure().errorText : 'desconhecido'
                });
            });
            page.on('response', response => {
                if (response.status() >= 400) {
                    badResponses.push({ url: response.url(), status: response.status() });
                }
            });

            // Captura a URL aberta pelo formulario em vez de abrir aba de verdade
            await page.evaluateOnNewDocument(() => {
                window.__opened = [];
                window.open = function (url) {
                    window.__opened.push(url);
                    return { focus() {}, close() {} };
                };
            });

            await page.setViewport({
                width: viewport.width,
                height: viewport.height,
                isMobile: viewport.isMobile,
                hasTouch: viewport.isMobile,
                deviceScaleFactor: 1
            });

            // Emula o tipo de ponteiro: mouse (hover) no desktop,
            // toque (sem hover) no celular.
            const client = await page.createCDPSession();
            await client.send('Emulation.setEmulatedMedia', {
                features: viewport.isMobile
                    ? [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }]
                    : [{ name: 'hover', value: 'hover' }, { name: 'pointer', value: 'fine' }]
            }).catch(() => { /* Navegador sem suporte a essa emulacao */ });

            const response = await page.goto('http://' + HOST + ':' + PORT + target.url, {
                waitUntil: 'networkidle2',
                timeout: 45000
            });

            // Guardar o identificador de visitante criado nesta pagina.
            // O script.js roda adiado (defer): a leitura pode acontecer
            // antes de ele gravar o id, entao a espera e repetida.
            const visitanteDaPagina = await page.evaluate(async () => {
                const deadline = Date.now() + 5000;

                while (Date.now() < deadline) {
                    try {
                        const id = window.localStorage.getItem('qg_visitante');
                        if (id) return id;
                    } catch (erro) {
                        return null;
                    }

                    await new Promise(resolve => setTimeout(resolve, 150));
                }

                return null;
            });

            if (visitanteDaPagina) VISITANTES_TESTE.add(visitanteDaPagina);

            const media = await page.evaluate(() => ({
                hover: window.matchMedia('(hover: hover)').matches,
                pointerFine: window.matchMedia('(pointer: fine)').matches,
                reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            }));

            // Rola a pagina inteira para disparar todas as animacoes de reveal.
            // "instant" ignora o scroll-behavior: smooth do CSS (senao a rolagem
            // suave atrasa e a pagina nunca chega no fim de verdade).
            await page.evaluate(async () => {
                const step = Math.round(window.innerHeight * 0.8);
                const max = document.body.scrollHeight;
                for (let y = 0; y <= max; y += step) {
                    window.scrollTo({ top: y, behavior: 'instant' });
                    await new Promise(resolve => setTimeout(resolve, 150));
                }
                window.scrollTo({ top: max, behavior: 'instant' });
                await new Promise(resolve => setTimeout(resolve, 500));
                window.scrollTo({ top: 0, behavior: 'instant' });
                await new Promise(resolve => setTimeout(resolve, 300));
            });

            // Espera as animacoes terminarem (reveal tem delay de ate 600ms)
            const revealSettled = await page.evaluate(async () => {
                const deadline = Date.now() + 6000;

                while (Date.now() < deadline) {
                    const pending = Array.from(document.querySelectorAll('[data-aos]')).filter(element => {
                        const style = getComputedStyle(element);
                        return !(element.classList.contains('is-visible') && parseFloat(style.opacity) > 0.98);
                    });

                    if (!pending.length) return true;
                    await new Promise(resolve => setTimeout(resolve, 150));
                }

                return false;
            });

            const dom = await page.evaluate(auditDom);

            /* ---------- Interacoes ---------- */
            const interactions = {};

            /* ---------- Foco de teclado ---------- */
            await page.evaluate(() => {
                if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
                window.scrollTo({ top: 0, behavior: 'instant' });
            });
            await page.keyboard.press('Tab');
            await new Promise(resolve => setTimeout(resolve, 250));

            const keyboardFocus = await page.evaluate(() => {
                const element = document.activeElement;
                if (!element || element === document.body) return { found: false };
                const style = getComputedStyle(element);
                return {
                    found: true,
                    tag: element.tagName.toLowerCase(),
                    text: (element.textContent || '').trim().slice(0, 30),
                    hasOutline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
                    hasShadow: !!style.boxShadow && style.boxShadow !== 'none'
                };
            });

            interactions.keyboardFocus = keyboardFocus;

            /* ---------- Interacoes ---------- */

            if (viewport.isMobile) {
                const hamburger = await page.$('.hamburger');
                if (hamburger) {
                    await hamburger.click();
                    await new Promise(resolve => setTimeout(resolve, 400));
                    interactions.menu = await page.evaluate(() => {
                        const links = document.querySelector('.nav-links');
                        const button = document.querySelector('.hamburger');
                        const style = getComputedStyle(links);
                        return {
                            expanded: button.getAttribute('aria-expanded'),
                            activeClass: links.classList.contains('active'),
                            display: style.display,
                            visible: style.display !== 'none' && style.visibility !== 'hidden'
                        };
                    });

                    await hamburger.click();
                    await new Promise(resolve => setTimeout(resolve, 400));
                    interactions.menuClosed = await page.evaluate(() => {
                        const links = document.querySelector('.nav-links');
                        const style = getComputedStyle(links);
                        return {
                            expanded: document.querySelector('.hamburger').getAttribute('aria-expanded'),
                            visible: style.display !== 'none' && style.visibility !== 'hidden'
                        };
                    });
                }

                // No touch o tilt nao pode travar o card inclinado
                const card = await page.$('.tilt-card');
                if (card) {
                    await page.evaluate(() => {
                        const element = document.querySelector('.tilt-card');
                        if (element) element.scrollIntoView({ block: 'center', behavior: 'instant' });
                    });
                    await new Promise(resolve => setTimeout(resolve, 400));
                    const box = await card.boundingBox();
                    if (box) {
                        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                    interactions.tiltOnTouch = await page.evaluate(() => {
                        const element = document.querySelector('.tilt-card');
                        return element ? getComputedStyle(element).transform : null;
                    });
                }
            } else {
                const card = await page.$('.tilt-card');
                if (card) {
                    // O card precisa estar visivel: mouse nao acerta o que esta fora da tela
                    await page.evaluate(() => {
                        const element = document.querySelector('.tilt-card');
                        if (element) element.scrollIntoView({ block: 'center', behavior: 'instant' });
                    });
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const before = await page.evaluate(() => {
                        const element = document.querySelector('.tilt-card');
                        return element ? getComputedStyle(element).transform : null;
                    });
                    const box = await card.boundingBox();
                    if (box) {
                        await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.2);
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                    const during = await page.evaluate(() => {
                        const element = document.querySelector('.tilt-card');
                        return element ? getComputedStyle(element).transform : null;
                    });
                    interactions.tilt = { changed: before !== during, before, during };
                }
            }

            /* ---------- Formulario ---------- */
            if (target.name === 'home') {
                const formResult = await page.evaluate(() => {
                    const form = document.getElementById('contactForm');
                    if (!form) return { present: false };

                    const set = (id, value) => {
                        const field = document.getElementById(id);
                        if (!field) return false;
                        if (field.type === 'checkbox') {
                            field.checked = value !== false;
                        } else {
                            field.value = value;
                        }
                        field.dispatchEvent(new Event('input', { bubbles: true }));
                        return true;
                    };

                    set('name', 'Teste Visual');
                    set('email', 'teste@exemplo.com.br');
                    set('phone', '(66) 99999-0000');
                    set('message', 'Mensagem de teste & verificacao');

                    // Os selects de perfil e busca sao obrigatorios: sem
                    // preencher, o navegador bloqueia o envio
                    set('perfil', 'Comprador');
                    set('busca', 'CTE + MDF-e');

                    // Consentimento (LGPD) tambem e obrigatorio
                    set('consentimento', true);

                    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

                    return {
                        present: true,
                        opened: window.__opened.slice(),
                        hasConsent: !!document.getElementById('consentimento'),
                        honeypotEmpty: !(document.getElementById('website') || {}).value
                    };
                });

                const openedUrl = formResult.opened && formResult.opened[0];
                interactions.form = {
                    present: formResult.present,
                    openedUrl: openedUrl || null,
                    pointsToWhatsApp: !!openedUrl && openedUrl.indexOf('https://wa.me/5566992281757?text=') === 0,
                    carriesName: !!openedUrl && openedUrl.indexOf(encodeURIComponent('Teste Visual')) !== -1,
                    carriesPerfil: !!openedUrl && openedUrl.indexOf(encodeURIComponent('Comprador')) !== -1,
                    carriesBusca: !!openedUrl && openedUrl.indexOf(encodeURIComponent('CTE + MDF-e')) !== -1,
                    encodesAmpersand: !!openedUrl && openedUrl.indexOf('%26') !== -1,
                    hasConsentField: !!formResult.hasConsent,
                    honeypotEmpty: formResult.honeypotEmpty !== false
                };
            }

            const shot = path.join(SHOTS_DIR, label + '.png');
            await page.screenshot({ path: shot, fullPage: true });

            const entry = {
                url: target.url,
                viewport: viewport.name,
                size: viewport.width + 'x' + viewport.height,
                status: response ? response.status() : 0,
                screenshot: path.relative(ROOT, shot).replace(/\\/g, '/'),
                revealSettled,
                media,
                consoleErrors,
                consoleWarnings,
                failedRequests,
                badResponses,
                dom,
                interactions
            };

            report.pages[target.name][viewport.name] = entry;

            /* ---------- Regras automaticas ---------- */
            if (entry.status !== 200) {
                report.problems.push(label + ': HTTP ' + entry.status + ' (esperava 200)');
            }
            if (dom.scroll.hasHorizontalScroll) {
                report.problems.push(label + ': rolagem horizontal (scrollWidth ' +
                    dom.scroll.documentScrollWidth + ' > ' + dom.scroll.documentClientWidth + ')');
            }
            if (dom.overflowOffenders.length) {
                report.problems.push(label + ': ' + dom.overflowOffenders.length +
                    ' elemento(s) fora da tela (ex.: ' +
                    dom.overflowOffenders.slice(0, 3).map(item => item.tag + '.' + item.class.split(' ')[0]).join(', ') + ')');
            }
            Object.keys(dom.sprite).forEach(id => {
                if (!dom.sprite[id].draws) {
                    report.problems.push(label + ': icone "' + id + '" nao desenha nada');
                }
            });
            if (dom.brokenIconRefs.length) {
                report.problems.push(label + ': <use> apontando para icone inexistente: ' + dom.brokenIconRefs.join(', '));
            }
            if (dom.unusedSymbols.length) {
                report.notes.push(label + ': simbolos sem uso no sprite: ' + dom.unusedSymbols.join(', '));
            }
            dom.images.forEach(image => {
                if (!image.hasSrc) return;
                if (!image.loaded) report.problems.push(label + ': imagem nao carregou -> ' + image.src);
                if (!image.hasAlt) report.problems.push(label + ': imagem sem alt -> ' + image.src);
            });

            /* ---------- Anuncios na tela ---------- */
            if (dom.ad.selos > 0 && dom.ad.linksSemNoFollow > 0) {
                report.problems.push(label + ': link de anuncio sem rel="nofollow"');
            }
            if (dom.ad.formatosIncorretos > 0) {
                report.problems.push(label + ': ' + dom.ad.formatosIncorretos +
                    ' bloco(s) de anuncio com formato diferente do pedido pelo anunciante');
            }
            if (dom.ad.blocosSemSelo > 0) {
                report.problems.push(label + ': ' + dom.ad.blocosSemSelo +
                    ' bloco(s) de anuncio sem o selo visivel de "Publicidade"');
            }
            if (dom.ad.idsDuplicados > 0) {
                report.problems.push(label + ': o mesmo anuncio aparece ' +
                    (dom.ad.idsDuplicados + 1) + ' vezes na mesma tela');
            }
            if (dom.reveal.hidden.length) {
                report.problems.push(label + ': ' + dom.reveal.hidden.length +
                    ' elemento(s) com reveal nao apareceram: ' +
                    dom.reveal.hidden.slice(0, 3).map(item => item.class || item.tag).join(', '));
            }
            if (dom.hero && dom.hero.overflow > 2) {
                report.problems.push(label + ': conteudo do hero maior que a caixa (' +
                    dom.hero.contentHeight + 'px dentro de ' + dom.hero.heroHeight + 'px)' +
                    (dom.hero.clippedChildren.length
                        ? ' -> cortado: ' + dom.hero.clippedChildren.map(item => item.class || item.tag).join(', ')
                        : ''));
            }
            dom.contrast.forEach(item => {
                if (item.indeterminate) {
                    report.notes.push(label + ': contraste de ' + item.selector + ' nao verificavel (fundo com imagem)');
                    return;
                }
                if (!item.passes) {
                    report.problems.push(label + ': contraste baixo em ' + item.selector +
                        ' (' + item.ratio + ':1, minimo ' + item.minimum + ':1)');
                }
            });
            // O backend do Supabase pode estar fora do ar. Quando isso
            // acontece o site precisa continuar funcionando (sem noticias,
            // sem leads, sem visitas) — isso NAO e defeito do site.
            // A falha vira aviso no relatorio, nunca problema.
            const respostasSupabase = badResponses.filter(item => ehRotaDoSupabase(item.url));
            const supabaseSemRede = failedRequests.some(item => ehRotaDoSupabase(item.url));
            const supabaseComErroServidor = respostasSupabase.some(item => item.status >= 500);
            const supabaseRecusou = respostasSupabase.some(item => item.status < 500);

            consoleErrors.forEach(item => {
                const mensagem = item.text || '';

                // O Supabase respondeu: o backend esta no ar. Um 4xx aqui e
                // regra do banco (antispam, validacao, permissao) e nao um
                // defeito do site.
                if (supabaseRecusou && ehRotaDoSupabase(item.url)) {
                    report.notes.push(label + ': o Supabase recusou a requisicao (regra do banco) -> ' + mensagem);
                    return;
                }

                if (ehRotaDoSupabase(item.url) || ehRotaDoSupabase(mensagem) ||
                    (supabaseSemRede && /net::ERR_FAILED|Failed to load resource/i.test(mensagem))) {
                    report.notes.push(label + ': Supabase indisponivel (backend fora do ar) -> ' + mensagem);
                    return;
                }

                report.problems.push(label + ': erro no console -> ' + mensagem);
            });

            badResponses.forEach(item => {
                if (ehRotaDoSupabase(item.url)) {
                    report.notes.push(label + ': Supabase respondeu HTTP ' + item.status + ' -> ' + item.url);
                    return;
                }
                report.problems.push(label + ': resposta HTTP ' + item.status + ' -> ' + item.url);
            });

            failedRequests.forEach(item => {
                if (ehRotaDoSupabase(item.url)) {
                    report.notes.push(label + ': Supabase indisponivel -> ' + item.url + ' (' + item.reason + ')');
                    return;
                }
                report.problems.push(label + ': requisicao falhou -> ' + item.url + ' (' + item.reason + ')');
            });

            if (supabaseComErroServidor) {
                report.notes.push(label + ': o Supabase respondeu com erro de servidor');
            }
            if (interactions.menu && !interactions.menu.visible) {
                report.problems.push(label + ': menu hamburguer nao abriu');
            }
            if (interactions.menuClosed && interactions.menuClosed.visible) {
                report.problems.push(label + ': menu hamburguer nao fechou');
            }
            if (interactions.tilt && !interactions.tilt.changed) {
                report.problems.push(label + ': tilt 3D nao ativou no hover');
            }
            if (interactions.tiltOnTouch && interactions.tiltOnTouch !== 'none') {
                report.problems.push(label + ': tilt 3D ficou travado no touch (' + interactions.tiltOnTouch + ')');
            }
            if (interactions.keyboardFocus) {
                if (!interactions.keyboardFocus.found) {
                    report.problems.push(label + ': o teclado nao encontra nenhum elemento focavel');
                } else if (!interactions.keyboardFocus.hasOutline && !interactions.keyboardFocus.hasShadow) {
                    report.problems.push(label + ': o elemento focado pelo teclado (' +
                        interactions.keyboardFocus.tag + ' "' + interactions.keyboardFocus.text +
                        '") nao mostra indicador de foco');
                }
            }
            if (interactions.form) {
                if (!interactions.form.pointsToWhatsApp) {
                    report.problems.push(label + ': formulario nao gerou link wa.me valido');
                }
                if (!interactions.form.carriesName) {
                    report.problems.push(label + ': formulario nao levou o nome do cliente para o WhatsApp');
                }
                if (!interactions.form.carriesPerfil) {
                    report.problems.push(label + ': formulario nao levou o perfil do cliente para o WhatsApp');
                }
                if (!interactions.form.carriesBusca) {
                    report.problems.push(label + ': formulario nao levou o que o cliente busca para o WhatsApp');
                }
                if (!interactions.form.encodesAmpersand) {
                    report.problems.push(label + ': formulario nao codificou o "&" da mensagem');
                }
                if (!interactions.form.hasConsentField) {
                    report.problems.push(label + ': formulario sem a caixa de consentimento (LGPD)');
                }
                if (!interactions.form.honeypotEmpty) {
                    report.problems.push(label + ': campo isca anti-spam estava preenchido');
                }
            }
            // A home guarda so o convite para a pagina de noticias e
            // nao pode ter o botao de WhatsApp no cabecalho
            if (target.name === 'home') {
                if (!dom.news.sectionExists) {
                    report.problems.push(label + ': secao #noticias ausente');
                }
                if (dom.news.gridExists) {
                    report.problems.push(label + ': a grade de noticias nao deve ficar na pagina inicial');
                }
                if (!dom.news.linkParaPaginaDeNoticias) {
                    report.problems.push(label + ': sem link para a pagina de noticias');
                }
                if (dom.news.navWhatsappExists) {
                    report.problems.push(label + ': botao de WhatsApp da navegacao presente');
                }
            }

            // A pagina de noticias e a unica com a lista de noticias
            if (target.name === 'noticias') {
                if (!dom.news.gridExists) {
                    report.problems.push(label + ': container #newsGrid ausente na pagina de noticias');
                }
                if (!dom.news.botaoMaisExiste) {
                    report.problems.push(label + ': botao de carregar mais ausente na pagina de noticias');
                }
                if (dom.news.navWhatsappExists) {
                    report.problems.push(label + ': botao de WhatsApp da navegacao presente');
                }
                // O filtro por categoria precisa existir e ser operavel
                // pelo teclado (botoes com aria-pressed).
                if (!dom.filtro.containerExiste) {
                    report.problems.push(label + ': filtro de categoria ausente (#filtroCategorias)');
                }
                if (!dom.filtro.chipsExiste) {
                    report.problems.push(label + ': container dos chips de categoria ausente (#filtroChips)');
                }
                if (dom.filtro.chips > 0 && dom.filtro.chipsPressionados > 1) {
                    report.problems.push(label + ': mais de uma categoria marcada ao mesmo tempo');
                }
            }

            /* A listagem (com ou sem filtro) e o bloco "Mais noticias"
               usam o mesmo card: ele precisa ter a classe que o contador
               de clique do script.js reconhece e o id da noticia. Sem os
               dois, o clique na manchete nao vira metrica. */
            if (target.name === 'noticias' || target.name === 'noticias-filtradas') {
                if (dom.news.cardsSemClasse > 0) {
                    report.problems.push(label + ': ' + dom.news.cardsSemClasse +
                        ' card(s) de noticia sem a classe "news-card-link" (o contador de clique nao os reconhece)');
                }
                if (dom.news.cardsSemId > 0) {
                    report.problems.push(label + ': ' + dom.news.cardsSemId +
                        ' card(s) de noticia sem "data-noticia-id" (o clique na manchete nao vira metrica)');
                }
                if (dom.news.cardsParaFora > 0) {
                    report.problems.push(label + ': ' + dom.news.cardsParaFora +
                        ' card(s) de noticia apontando para fora do site (a materia deve ser hospedada aqui)');
                }
            }

            // A materia hospedada: sem id na URL o site precisa mostrar a
            // mensagem amigavel, nunca uma tela quebrada.
            if (target.name === 'noticia') {
                if (!dom.noticia.corpoExiste) {
                    report.problems.push(label + ': container do texto da materia ausente (#noticiaCorpo)');
                }
                if (!dom.noticia.erroExiste) {
                    report.problems.push(label + ': estado de erro da materia ausente (#noticiaErro)');
                }
                if (!dom.noticia.erroVisivel && !dom.noticia.conteudoVisivel) {
                    report.problems.push(label + ': a pagina da materia nao mostrou nem o texto nem o aviso de erro');
                }
                if (!dom.noticia.maisNoticiasExiste) {
                    report.problems.push(label + ': bloco "Mais noticias" ausente');
                }
                if (dom.noticia.maisNoticiasSemClasse > 0) {
                    report.problems.push(label + ': ' + dom.noticia.maisNoticiasSemClasse +
                        ' card(s) de "Mais noticias" sem a classe "news-card-link" (o contador de clique nao os reconhece)');
                }
                if (dom.noticia.maisNoticiasSemId > 0) {
                    report.problems.push(label + ': ' + dom.noticia.maisNoticiasSemId +
                        ' card(s) de "Mais noticias" sem "data-noticia-id" (o clique na manchete nao vira metrica)');
                }
            }
            // A transparencia de publicidade precisa existir e citar a lei
            if (target.name === 'publicidade') {
                const texto = await page.evaluate(() => document.body.textContent || '');
                if (texto.indexOf('9.279/1996') === -1) {
                    report.problems.push(label + ': a politica de publicidade nao cita a Lei 9.279/1996');
                }
            }

            await page.close();
        }
    }

    await verificarPainelAdmin(browser, report);

    await browser.close();
    server.kill();

    report.problems = Array.from(new Set(report.problems));
    report.notes = Array.from(new Set(report.notes));

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

    console.log('');
    console.log('=== Verificacao visual (Chrome headless) ===');
    console.log('');
    console.log('  Navegador: ' + chromePath);
    console.log('  Relatorio:  tools/visual-report.json');
    console.log('  Imagens:    tools/shots/*.png');
    console.log('');

    Object.keys(report.pages).forEach(pageName => {
        Object.keys(report.pages[pageName]).forEach(viewportName => {
            const entry = report.pages[pageName][viewportName];
            console.log('  [' + pageName + '/' + viewportName + '] HTTP ' + entry.status +
                ' | icones ok: ' + Object.keys(entry.dom.sprite).length +
                ' | imagens ok: ' + entry.dom.images.filter(image => image.loaded).length + '/' + entry.dom.images.length +
                ' | reveal: ' + entry.dom.reveal.visible + '/' + entry.dom.reveal.total +
                ' | overflow: ' + (entry.dom.scroll.hasHorizontalScroll ? 'SIM' : 'nao'));
        });
    });

    if (report.painelAdmin) {
        const painel = report.painelAdmin;
        console.log('  [admin/painel] HTTP ' + painel.status +
            ' | login: ' + (painel.logado ? 'ok' : 'nao verificado') +
            ' | aba resumo: ' + (painel.abas.resumo ? painel.abas.resumo.cartoes + ' cartao(s)' : '-') +
            ' | leads: ' + (painel.abas.leads ? painel.abas.leads.linhas + ' linha(s)' : '-') +
            ' | noticias: ' + (painel.abas.noticias ? painel.abas.noticias.linhas + ' linha(s)' : '-') +
            ' | anuncios: ' + (painel.abas.anuncios ? painel.abas.anuncios.linhas + ' linha(s)' : '-') +
            ' | visitas: ' + (painel.abas.visitas ? painel.abas.visitas.linhas + ' linha(s)' : '-') +
            ' | lead de teste apagado: ' + (painel.limpeza ? painel.limpeza.apagados : '-') +
            ' | visitas de teste apagadas: ' + (painel.limpezaVisitas ? painel.limpezaVisitas.apagadas : '-') +
            ' | visitas de teste restantes: ' + (painel.limpezaVisitas && painel.limpezaVisitas.restantes !== undefined ? painel.limpezaVisitas.restantes : '-'));
    }

    if (report.notes.length) {
        console.log('');
        console.log('  Observacoes:');
        report.notes.forEach(note => console.log('    - ' + note));
    }

    console.log('');

    if (report.problems.length) {
        report.problems.forEach(problem => console.log('  [ERRO]  ' + problem));
        console.log('');
        console.log('Resultado: ' + report.problems.length + ' problema(s) encontrado(s).');
        console.log('');
        process.exit(1);
    }

    console.log('Resultado: nenhuma problema visual encontrada.');
    console.log('');
}

main().catch(error => {
    console.error('');
    console.error('  [ERRO]  Falha na verificacao visual: ' + (error && error.stack ? error.stack : error));
    console.error('');
    process.exit(1);
});
