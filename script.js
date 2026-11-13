'use strict';

/* ------------------------------------------------------------------
 * Q GRÃOS — comportamento do site
 * Sem dependências externas: todo o JavaScript é local, então o site
 * funciona mesmo sem internet ou com CDN bloqueado.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------
 * Configuração do site
 * ------------------------------------------------------------------
 * Os dados de contato ficam em um único arquivo: site.config.js.
 * O objeto DEFAULTS abaixo é a reserva caso esse arquivo não carregue
 * (nesse caso o site continua funcionando com os valores atuais).
 * ------------------------------------------------------------------ */
const DEFAULT_SITE = {
    whatsapp: '5566992281757', // '55' + DDD + número, só dígitos
    siteUrl: 'https://qgraos.com.br/',
    phoneDisplay: '(66) 99228-1757',
    phoneE164: '+5566992281757',
    email: 'contato@qgraos.com.br',
    cnpj: '62.793.851/0001-96',
    address: 'Mato Grosso, Brasil',
    socials: {
        instagram: 'https://www.instagram.com/q_graos/'
    }
};

const SITE = (function buildSiteConfig() {
    const loaded = (typeof window !== 'undefined' && window.QG_SITE) || {};
    const merged = Object.assign({}, DEFAULT_SITE, loaded);
    merged.socials = Object.assign({}, DEFAULT_SITE.socials, loaded.socials || {});
    return merged;
})();

const WHATSAPP_NUMBER = SITE.whatsapp;
const SITE_URL = SITE.siteUrl;

/* ------------------------------------------------------------------
 * De onde veio o lead
 * ------------------------------------------------------------------
 * Quando o visitante chega da página de uma matéria, a origem do lead
 * é a própria matéria (e não a home): é o que o time precisa ver no
 * painel para saber de qual assunto o contato veio.
 * ------------------------------------------------------------------ */
let ORIGEM_LEAD = '';

function definirOrigemDoLead() {
    const parametros = new URLSearchParams(window.location.search);

    const origem = (parametros.get('origem') || '').trim();
    const materia = (parametros.get('materia') || '').trim();

    if (origem === 'noticia' && materia && /^[a-fA-F0-9-]{8,64}$/.test(materia)) {
        ORIGEM_LEAD = SITE_URL.replace(/\/+$/, '') + '/noticia.html?id=' + encodeURIComponent(materia);
        return;
    }

    const referencia = document.referrer || '';

    if (referencia.indexOf('/noticia.html') !== -1) {
        ORIGEM_LEAD = referencia;
        return;
    }

    ORIGEM_LEAD = window.location.href;
}

function urlDeOrigemDoLead() {
    return ORIGEM_LEAD || window.location.href;
}

/* ------------------------------------------------------------------
 * Aplica a configuração nos elementos marcados com data-config
 * ------------------------------------------------------------------
 * No HTML:
 *   data-config="chave"       -> define o href (em links) ou o texto
 *   data-config-text="chave"  -> define apenas o texto de um link
 * ------------------------------------------------------------------ */
function applySiteConfig() {
    const hrefByKey = {
        whatsapp: 'https://wa.me/' + SITE.whatsapp,
        phone: 'tel:' + SITE.phoneE164,
        email: 'mailto:' + SITE.email,
        instagram: SITE.socials.instagram
    };

    const textByKey = {
        phone: SITE.phoneDisplay,
        email: SITE.email,
        cnpj: SITE.cnpj,
        address: SITE.address,
        year: String(new Date().getFullYear())
    };

    document.querySelectorAll('[data-config]').forEach(element => {
        const key = element.getAttribute('data-config');
        const isLink = element.tagName === 'A';

        if (isLink) {
            const href = hrefByKey[key];

            if (href) {
                element.setAttribute('href', href);
                element.removeAttribute('data-no-scroll');

                // Link externo abre em nova aba sem vazar a origem
                if (/^https?:/i.test(href)) {
                    element.setAttribute('target', '_blank');
                    element.setAttribute('rel', 'noopener noreferrer');
                }
            }

            // Rede social sem URL cadastrada: fica desativada, sem link morto
            if (!href) {
                element.setAttribute('aria-disabled', 'true');
                element.removeAttribute('href');
                element.removeAttribute('data-no-scroll');
            }
        }

        // Texto: nunca sobrescreve o conteúdo de um elemento que tem ícones dentro
        const textKey = element.getAttribute('data-config-text') || key;
        if (textKey && textByKey[textKey] && element.children.length === 0) {
            element.textContent = textByKey[textKey];
        }
    });
}

applySiteConfig();

/* ------------------------------------------------------------------
 * Revelação ao rolar (substitui a biblioteca AOS)
 * O estado inicial "invisível" é aplicado aqui, por JS. Se o script
 * não executar, nenhum elemento fica escondido.
 * ------------------------------------------------------------------ */
const REVEAL_DURATION_MS = 800;

const revealElements = document.querySelectorAll('[data-aos]');

function revealElement(element) {
    element.classList.remove('aos-init');
    element.classList.add('is-visible');
}

function revealVisibleElements() {
    revealElements.forEach(element => {
        if (element.classList.contains('is-visible')) return;

        const rect = element.getBoundingClientRect();
        // Só revela o que já deveria estar visível na tela
        if (rect.top < window.innerHeight && rect.bottom > 0) {
            revealElement(element);
        }
    });
}

// Todos os elementos já foram revelados?
function allRevealed() {
    for (let index = 0; index < revealElements.length; index++) {
        if (!revealElements[index].classList.contains('is-visible')) return false;
    }
    return true;
}

// Temporizador da rede de segurança (desligado assim que tudo aparece)
let safetyTimer = null;

function setupReveal() {
    if (!revealElements.length) return;

    const prefersReducedMotion = window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Sem animação ou sem suporte: mostra tudo de imediato
    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
        revealElements.forEach(element => element.classList.add('is-visible'));
        return;
    }

    revealElements.forEach(element => {
        const delay = parseInt(element.getAttribute('data-aos-delay') || '0', 10);
        if (delay > 0) element.style.transitionDelay = delay + 'ms';
        element.classList.add('aos-init');
    });

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            revealElement(entry.target);
            observer.unobserve(entry.target);
        });

        // Quando tudo já apareceu, a rede de segurança pode ser desligada
        if (safetyTimer && allRevealed()) {
            clearInterval(safetyTimer);
            safetyTimer = null;
        }
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

    revealElements.forEach(element => observer.observe(element));

    // Rede de segurança: se o observer falhar, o conteúdo visível aparece
    safetyTimer = setInterval(revealVisibleElements, 2000);
}

setupReveal();

/* ------------------------------------------------------------------
 * Navegação mobile
 * ------------------------------------------------------------------ */
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');

function setMenuState(open) {
    if (!navLinks || !hamburger) return;
    navLinks.classList.toggle('active', open);
    hamburger.classList.toggle('active', open);
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    hamburger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
}

if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
        setMenuState(!navLinks.classList.contains('active'));
    });

    // Fecha o menu ao escolher um link (essencial no mobile)
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => setMenuState(false));
    });

    // Fecha o menu ao voltar para o layout desktop
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) setMenuState(false);
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') setMenuState(false);
    });
}

/* ------------------------------------------------------------------
 * Rolagem suave
 * ------------------------------------------------------------------ */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (event) {
        const href = this.getAttribute('href');

        // Links de placeholder (redes sociais): ainda não têm destino real
        if (this.hasAttribute('data-no-scroll')) {
            event.preventDefault();
            return;
        }

        // Links vazios (logo): antes causavam SyntaxError em querySelector('#')
        if (!href || href === '#') {
            event.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        // getElementById: evita erros de seletor inválido
        const target = document.getElementById(href.slice(1));
        if (!target) return; // sem destino: mantém o comportamento padrão

        event.preventDefault();
        // scroll-margin-top no CSS compensa a navbar fixa
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

/* ------------------------------------------------------------------
 * Efeito 3D (tilt)
 * ------------------------------------------------------------------ */
const TILT_MAX_DEG = 10;
const TILT_DURATION_MS = 80;
const tiltCards = document.querySelectorAll('.tilt-card');

// Guardamos as transições inline originais para devolvê-las ao final do hover
const savedTransitions = new WeakMap();

function captureTransition(element) {
    return {
        property: element.style.transitionProperty,
        duration: element.style.transitionDuration,
        timing: element.style.transitionTimingFunction,
        delay: element.style.transitionDelay
    };
}

function restoreTransition(element, saved) {
    if (!saved) return;
    element.style.transitionProperty = saved.property;
    element.style.transitionDuration = saved.duration;
    element.style.transitionTimingFunction = saved.timing;
    element.style.transitionDelay = saved.delay;
}

// No hover o transform precisa ser rápido, mas a opacidade (fade) e a sombra
// mantêm o tempo da animação de entrada.
function applyFastTiltTransition(element, saved) {
    const delay = saved && saved.delay && saved.delay !== '0ms' ? saved.delay : '0ms';

    if (element.hasAttribute('data-aos')) {
        element.style.transitionProperty = 'opacity, transform, box-shadow';
        element.style.transitionDuration =
            REVEAL_DURATION_MS + 'ms, ' + TILT_DURATION_MS + 'ms, 300ms';
        element.style.transitionTimingFunction = 'ease, ease-out, ease';
        element.style.transitionDelay = delay + ', 0ms, 0ms';
    } else {
        element.style.transitionProperty = 'transform, box-shadow';
        element.style.transitionDuration = TILT_DURATION_MS + 'ms, 300ms';
        element.style.transitionTimingFunction = 'ease-out, ease';
        element.style.transitionDelay = '0ms';
    }
}

function handleTilt(event) {
    const card = this;
    const rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const rotateX = ((event.clientY - centerY) / (rect.height / 2)) * -TILT_MAX_DEG;
    const rotateY = ((event.clientX - centerX) / (rect.width / 2)) * TILT_MAX_DEG;

    card.style.transform =
        `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale(1.02)`;
}

function startTilt() {
    applyFastTiltTransition(this, savedTransitions.get(this));
}

function resetTilt() {
    const card = this;
    // Devolve a transição original antes de remover o transform inline
    restoreTransition(card, savedTransitions.get(card));
    card.style.transform = '';
}

// O tilt 3D só faz sentido com ponteiro fino (mouse). Em telas de
// toque o card ficaria inclinado travado depois do toque.
const supportsHover = window.matchMedia
    ? window.matchMedia('(hover: hover)').matches
    : true;

if (supportsHover) {
    tiltCards.forEach(card => {
        savedTransitions.set(card, captureTransition(card));
        card.addEventListener('mouseenter', startTilt);
        card.addEventListener('mousemove', handleTilt);
        card.addEventListener('mouseleave', resetTilt);
    });
}

/* ------------------------------------------------------------------
 * Partículas do hero
 * ------------------------------------------------------------------ */
const canvas = document.getElementById('particles-canvas');

if (canvas && canvas.getContext) {
    const ctx = canvas.getContext('2d');

    const PARTICLE_COLOR = '#D4AF37';
    const LINK_COLOR = '212, 175, 55'; // dourado: legível sobre o fundo verde
    const LINK_MAX_DISTANCE = 120; // px
    const LINK_MAX_OPACITY = 0.45;
    const MAX_PARTICLES = 90;

    let particles = [];
    let viewWidth = 0;
    let viewHeight = 0;
    let isVisible = true;
    let animationFrame = null;

    // Ponteiro em coordenadas da janela; convertido para o canvas no loop
    const pointer = { x: null, y: null, radius: 150 };

    class Particle {
        constructor(x, y, directionX, directionY, size, color) {
            this.x = x;
            this.y = y;
            this.directionX = directionX;
            this.directionY = directionY;
            this.size = size;
            this.color = color;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
            ctx.fillStyle = this.color;
            ctx.fill();
        }

        update(mouse) {
            // Espelha nas bordas do canvas
            if (this.x > viewWidth - this.size) this.directionX = -this.directionX;
            if (this.x < this.size) this.directionX = -this.directionX;
            if (this.y > viewHeight - this.size) this.directionY = -this.directionY;
            if (this.y < this.size) this.directionY = -this.directionY;

            // Repelição do mouse
            if (mouse) {
                const dx = mouse.x - this.x;
                const dy = mouse.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < mouse.radius + this.size) {
                    const force = (mouse.radius + this.size - distance) / 10;
                    this.x -= dx * force * 0.1;
                    this.y -= dy * force * 0.1;
                }
            }

            this.x += this.directionX;
            this.y += this.directionY;
        }
    }

    function init() {
        particles = [];

        const area = viewWidth * viewHeight;
        let count = Math.round(area / 9000);

        // Menos partículas em telas pequenas (performance)
        if (window.innerWidth < 768) count = Math.round(count / 3);

        count = Math.max(12, Math.min(count, MAX_PARTICLES));

        for (let i = 0; i < count; i++) {
            const size = Math.random() * 3 + 1;
            const x = Math.random() * (viewWidth - size * 2) + size;
            const y = Math.random() * (viewHeight - size * 2) + size;
            const directionX = (Math.random() * 2) - 1;
            const directionY = (Math.random() * 2) - 1;

            particles.push(new Particle(x, y, directionX, directionY, size, PARTICLE_COLOR));
        }
    }

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, 2);

        viewWidth = Math.max(1, Math.round(rect.width));
        viewHeight = Math.max(1, Math.round(rect.height));

        canvas.width = Math.round(viewWidth * ratio);
        canvas.height = Math.round(viewHeight * ratio);
        // Desenha em coordenadas lógicas (independente da densidade do pixel)
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

        init();
    }

    // Liga partículas próximas entre si
    function connect() {
        for (let a = 0; a < particles.length; a++) {
            for (let b = a + 1; b < particles.length; b++) {
                const dx = particles[a].x - particles[b].x;
                const dy = particles[a].y - particles[b].y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < LINK_MAX_DISTANCE) {
                    const opacity = (1 - distance / LINK_MAX_DISTANCE) * LINK_MAX_OPACITY;
                    ctx.strokeStyle = 'rgba(' + LINK_COLOR + ',' + opacity.toFixed(3) + ')';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(particles[a].x, particles[a].y);
                    ctx.lineTo(particles[b].x, particles[b].y);
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        animationFrame = window.requestAnimationFrame(animate);

        if (!isVisible || document.hidden) return;

        const rect = canvas.getBoundingClientRect();
        const mouse = pointer.x === null
            ? null
            : { x: pointer.x - rect.left, y: pointer.y - rect.top, radius: pointer.radius };

        ctx.clearRect(0, 0, viewWidth, viewHeight);

        for (let i = 0; i < particles.length; i++) {
            particles[i].update(mouse);
            particles[i].draw();
        }

        connect();
    }

    window.addEventListener('mousemove', event => {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
    });

    window.addEventListener('mouseout', event => {
        if (!event.relatedTarget) {
            pointer.x = null;
            pointer.y = null;
        }
    });

    window.addEventListener('resize', () => {
        resizeCanvas();
    });

    // Pausa a animação quando o hero sai da viewport (economiza bateria/CPU)
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
            isVisible = entries[0].isIntersecting;
        }, { threshold: 0 });
        observer.observe(canvas);
    }

    resizeCanvas();
    animate();
}

/* ------------------------------------------------------------------
 * Envio do formulário para o WhatsApp
 * ------------------------------------------------------------------ */
function enviarParaWhatsapp() {
    const name = document.getElementById('name');
    const email = document.getElementById('email');
    const phone = document.getElementById('phone');
    const message = document.getElementById('message');
    const perfil = document.getElementById('perfil');
    const busca = document.getElementById('busca');

    if (!name || !email || !phone || !message) return false;

    // Perfil e busca qualify o lead: entram na mensagem quando preencheridos
    const perfilTexto = perfil ? perfil.value.trim() : '';
    const buscaTexto = busca ? busca.value.trim() : '';

    const formattedMessage =
        `*Nome Completo:* ${name.value.trim()}\n` +
        `*E-mail:* ${email.value.trim()}\n` +
        `*Telefone:* ${phone.value.trim()}\n` +
        (perfilTexto ? `*Perfil:* ${perfilTexto}\n` : '') +
        (buscaTexto ? `*O que busca:* ${buscaTexto}\n` : '') +
        `*Mensagem:* ${message.value.trim()}\n\n` +
        `*Link de Origem:* ${urlDeOrigemDoLead()}`;

    // encodeURIComponent preserva acentos e evita que &, # ou + quebrem a URL
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(formattedMessage)}`;

    const newTab = window.open(whatsappUrl, '_blank', 'noopener');

    // Se o bloqueador de pop-ups impedir a nova aba, usa a aba atual
    if (!newTab) {
        window.location.href = whatsappUrl;
    }

    return false;
}

const contactForm = document.getElementById('contactForm');

if (contactForm) {
    contactForm.addEventListener('submit', event => {
        event.preventDefault();

        // Validação nativa dos campos obrigatórios antes de montar a mensagem
        if (!contactForm.checkValidity()) {
            contactForm.reportValidity();
            return;
        }

        // Campo isca preenchido = robô: não grava lead nem abre o WhatsApp
        const isca = document.getElementById('website');
        if (isca && isca.value.trim()) return;

        const dados = coletarDadosFormulario();

        // Grava o lead no banco (não bloqueia o atendimento) e registra o evento
        registrarLead(dados);
        registrarEvento('lead_enviado');

        enviarParaWhatsapp();
    });

    // Primeira interação com o formulário = sinal de interesse
    contactForm.addEventListener('focusin', () => {
        registrarEvento('abrir_formulario');
    }, { once: true });
}

/* ------------------------------------------------------------------
 * Coleta dos dados do formulário
 * ------------------------------------------------------------------ */
function coletarDadosFormulario() {
    const valor = id => {
        const campo = document.getElementById(id);
        return campo ? campo.value.trim() : '';
    };

    const consentimento = document.getElementById('consentimento');

    return {
        nome: valor('name'),
        email: valor('email'),
        telefone: valor('phone'),
        perfil: valor('perfil'),
        busca: valor('busca'),
        mensagem: valor('message'),
        consentimento: Boolean(consentimento && consentimento.checked)
    };
}

/* ------------------------------------------------------------------
 * Ficha preenchida a partir da página de uma matéria
 * ------------------------------------------------------------------
 * A chamada do fim da matéria ("O que você busca hoje?") leva para
 * a ficha com a opção de "O que você busca" já marcada e a mensagem
 * com o contexto da matéria. Só entram valores que existem na lista
 * do formulário: a URL é do visitante e não pode inventar opção nova.
 * ------------------------------------------------------------------ */
function aplicarPreenchimentoDaUrl() {
    const parametros = new URLSearchParams(window.location.search);

    const busca = (parametros.get('busca') || '').trim();
    const origem = (parametros.get('origem') || '').trim();
    const titulo = (parametros.get('titulo') || '').trim();

    const campoBusca = document.getElementById('busca');

    if (campoBusca && busca) {
        const opcoes = Array.from(campoBusca.options).map(opcao => opcao.value);

        if (opcoes.indexOf(busca) !== -1) campoBusca.value = busca;
    }

    const campoMensagem = document.getElementById('message');

    if (campoMensagem && origem === 'noticia' && titulo && !campoMensagem.value.trim()) {
        campoMensagem.value = 'Sobre a matéria: ' + titulo;
    }
}

/* ------------------------------------------------------------------
 * Abre direto na ficha de contato
 * ------------------------------------------------------------------
 * O link da matéria chega com #contact. Depois que a página carrega
 * (a home tem conteúdo que chega depois) a rolagem é refeita para a
 * ficha ficar realmente à vista.
 * ------------------------------------------------------------------ */
function prepararAncoraContato() {
    if (window.location.hash !== '#contact') return;

    const secao = document.getElementById('contact');
    if (!secao) return;

    function rolar() {
        secao.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (document.readyState === 'complete') {
        setTimeout(rolar, 100);
        return;
    }

    window.addEventListener('load', function () {
        setTimeout(rolar, 100);
    });
}

/* ------------------------------------------------------------------
 * Supabase: notícias, leads e visitas
 * ------------------------------------------------------------------
 * Tudo aqui é opcional. Se a chave pública não estiver preenchida em
 * site.config.js, o site continua funcionando exatamente como antes:
 * a seção de notícias avisa que está em breve e nada é enviado ao banco.
 * ------------------------------------------------------------------ */
const SUPABASE = (typeof window !== 'undefined' && window.QGSupabase) || null;
const SUPABASE_ATIVO = Boolean(SUPABASE && SUPABASE.isConfigured());

if (SUPABASE && !SUPABASE_ATIVO) {
    console.warn('Q GRAOS: Supabase sem chave pública em site.config.js — ' +
        'notícias, leads e visitas estão desativados.');
}

/* ---------- Identificação do visitante ---------- */

function gerarId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, caracter => {
        const numero = Math.random() * 16 | 0;
        const valor = caracter === 'x' ? numero : (numero & 0x3 | 0x8);
        return valor.toString(16);
    });
}

function lerArmazenamento(tipo, chave) {
    try {
        return window[tipo].getItem(chave);
    } catch (erro) {
        return null;
    }
}

function gravarArmazenamento(tipo, chave, valor) {
    try {
        window[tipo].setItem(chave, valor);
    } catch (erro) {
        /* modo privativo do navegador: segue sem persistir */
    }
}

const UTM_CHAVES = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

function capturarUtm() {
    const parametros = new URLSearchParams(window.location.search);
    const utm = {};
    let encontrou = false;

    UTM_CHAVES.forEach(chave => {
        const valor = parametros.get(chave);
        if (valor) {
            utm[chave] = valor.slice(0, 150);
            encontrou = true;
        }
    });

    if (encontrou) {
        gravarArmazenamento('sessionStorage', 'qg_utm', JSON.stringify(utm));
        return utm;
    }

    const guardado = lerArmazenamento('sessionStorage', 'qg_utm');
    if (guardado) {
        try {
            return JSON.parse(guardado) || {};
        } catch (erro) {
            return {};
        }
    }

    return {};
}

function detectarDispositivo() {
    const agente = navigator.userAgent || '';

    if (/iPad|Tablet|Android(?!.*Mobile)/i.test(agente)) return 'tablet';
    if (/Mobi|Android|iPhone|iPod/i.test(agente)) return 'celular';
    return 'desktop';
}

const ANALYTICS = {
    visitorId: '',
    sessionId: '',
    utm: {}
};

function prepararAnalytics() {
    ANALYTICS.visitorId = lerArmazenamento('localStorage', 'qg_visitante') || gerarId();
    gravarArmazenamento('localStorage', 'qg_visitante', ANALYTICS.visitorId);

    ANALYTICS.sessionId = lerArmazenamento('sessionStorage', 'qg_sessao') || gerarId();
    gravarArmazenamento('sessionStorage', 'qg_sessao', ANALYTICS.sessionId);

    ANALYTICS.utm = capturarUtm();
}

/* ---------- Eventos ---------- */

function registrarEvento(tipo, extras) {
    if (!SUPABASE_ATIVO) return;

    const payload = {
        p_tipo: tipo,
        /* O caminho vai com a query string: é o que permite saber que a
           visita foi para uma matéria (/noticia.html?id=...) ou para um
           filtro de categoria (/noticias.html?categoria=Soja). */
        p_path: window.location.pathname + (window.location.search || ''),
        p_referrer: document.referrer || null,
        p_dispositivo: detectarDispositivo(),
        p_visitante_id: ANALYTICS.visitorId,
        p_sessao_id: ANALYTICS.sessionId,
        p_secao: (extras && extras.secao) || null
    };

    UTM_CHAVES.forEach(chave => {
        payload[chave.replace('utm_', 'p_utm_')] = ANALYTICS.utm[chave] || null;
    });

    SUPABASE.rpc('registrar_evento', payload).catch(erro => {
        console.warn('Q GRAOS: não foi possível registrar o evento.', erro && erro.message);
    });
}

/* ---------- Lead ---------- */

/* Fila de leads pendentes.
 * Se o banco estiver fora do ar na hora do envio, o contato não se perde:
 * ele fica guardado no navegador e é reenviado assim que o site volta a
 * falar com o Supabase (na próxima visita). */
const FILA_LEADS = 'qg_leads_pendentes';
const LIMITE_FILA = 20;

function lerFilaLeads() {
    const guardado = lerArmazenamento('localStorage', FILA_LEADS);
    if (!guardado) return [];

    try {
        const fila = JSON.parse(guardado);
        return Array.isArray(fila) ? fila : [];
    } catch (erro) {
        return [];
    }
}

function guardarLeadPendente(payload) {
    const fila = lerFilaLeads();
    fila.push({ id: gerarId(), payload: payload, criado_em: new Date().toISOString() });
    gravarArmazenamento('localStorage', FILA_LEADS, JSON.stringify(fila.slice(-LIMITE_FILA)));
}

function tirarLeadPendente(id) {
    const fila = lerFilaLeads();
    const restantes = fila.filter(item => item.id !== id);
    gravarArmazenamento('localStorage', FILA_LEADS, JSON.stringify(restantes));
}

/* Reenvia o que ficou na fila. Roda uma vez a cada visita. */
function reenviarLeadsPendentes() {
    if (!SUPABASE_ATIVO) return;

    lerFilaLeads().forEach(item => {
        SUPABASE.rpc('registrar_lead', item.payload)
            .then(() => {
                tirarLeadPendente(item.id);
            })
            .catch(erro => {
                // Duplicado (o banco já tinha gravado) não precisa insistir.
                const mensagem = String((erro && erro.message) || '');
                if (mensagem.indexOf('envio_duplicado') !== -1) {
                    tirarLeadPendente(item.id);
                    return;
                }
                // Continua na fila: o banco ainda está fora do ar.
            });
    });
}

function registrarLead(dados) {
    if (!SUPABASE_ATIVO) return Promise.resolve(false);

    const payload = {
        p_nome: dados.nome,
        p_email: dados.email,
        p_telefone: dados.telefone,
        p_perfil: dados.perfil || null,
        p_busca: dados.busca || null,
        p_mensagem: dados.mensagem || null,
        p_origem_url: urlDeOrigemDoLead(),
        p_referrer: document.referrer || null,
        p_utm_source: ANALYTICS.utm.utm_source || null,
        p_utm_medium: ANALYTICS.utm.utm_medium || null,
        p_utm_campaign: ANALYTICS.utm.utm_campaign || null,
        p_utm_term: ANALYTICS.utm.utm_term || null,
        p_utm_content: ANALYTICS.utm.utm_content || null,
        p_consentimento: dados.consentimento === true
    };

    return SUPABASE.rpc('registrar_lead', payload)
        .then(() => true)
        .catch(erro => {
            const mensagem = String((erro && erro.message) || '');

            if (mensagem.indexOf('envio_duplicado') !== -1) {
                return true;
            }

            console.warn('Q GRAOS: o lead não pôde ser salvo agora (' + mensagem + '). ' +
                'Ele ficou guardado no navegador e será reenviado.');

            guardarLeadPendente(payload);
            return false;
        });
}

/* ---------- Observadores ---------- */

function observarSecoes() {
    if (!SUPABASE_ATIVO || !('IntersectionObserver' in window)) return;

    const secoes = document.querySelectorAll('section[id]');
    const vistas = new Set();

    const observador = new IntersectionObserver(entradas => {
        entradas.forEach(entrada => {
            if (!entrada.isIntersecting) return;

            const id = entrada.target.id;
            if (vistas.has(id)) return;

            vistas.add(id);
            registrarEvento('secao', { secao: id });
            observador.unobserve(entrada.target);
        });
    }, { threshold: 0.35 });

    secoes.forEach(secao => observador.observe(secao));
}

function observarCliques() {
    document.addEventListener('click', evento => {
        const alvo = evento.target;
        if (!alvo || typeof alvo.closest !== 'function') return;

        const link = alvo.closest('a[href]');
        if (!link) return;

        const href = link.getAttribute('href') || '';

        if (/^https:\/\/wa\.me\//i.test(href)) registrarEvento('clique_whatsapp');
        else if (/^tel:/i.test(href)) registrarEvento('clique_telefone');
        else if (/^mailto:/i.test(href)) registrarEvento('clique_email');

        /* O card da manchete usa a classe `news-card-link` (o nome antigo
           `news-link` continua aceito para não quebrar links antigos). */
        const ehLinkNoticia = link.classList.contains('news-card-link') ||
            link.classList.contains('news-link');

        if (ehLinkNoticia && SUPABASE_ATIVO) {
            registrarEvento('clique_noticia');

            const id = link.getAttribute('data-noticia-id');
            if (id) {
                SUPABASE.rpc('clicar_noticia', { p_id: id }).catch(erro => {
                    console.warn('Q GRAOS: não foi possível contar o clique.', erro && erro.message);
                });
            }
        }

        /* Clique no anunciante: conta no próprio anúncio (a tabela de
           visitas não aceita este tipo de evento) */
        if (link.classList.contains('anuncio-link') && SUPABASE_ATIVO) {
            const idAnuncio = link.getAttribute('data-anuncio-id');

            if (idAnuncio) {
                SUPABASE.rpc('clicar_anuncio', { p_id: idAnuncio }).catch(erro => {
                    console.warn('Q GRAOS: não foi possível contar o clique do anúncio.', erro && erro.message);
                });
            }
        }
    }, true);
}

/* ------------------------------------------------------------------
 * Seção de notícias
 * ------------------------------------------------------------------ */

/* Quantas notícias entram por página na página de notícias */
const NOTICIAS_POR_PAGINA = 9;

/* Quantas já foram carregadas (paginação do botão "carregar mais") */
let noticiasCarregadas = 0;

/* Quantas notícias estão na tela (serve para o SEO do filtro) */
let noticiasVisiveis = 0;

/* ------------------------------------------------------------------
 * Categorias
 * ------------------------------------------------------------------
 * `valor` é exatamente o que fica gravado na coluna `categoria` do
 * banco (é o que o CHECK do Postgres aceita); `rotulo` é o texto que o
 * leitor vê no chip da página de notícias.
 * ------------------------------------------------------------------ */
const CATEGORIAS = [
    { valor: 'Geral', rotulo: 'Geral' },
    { valor: 'Soja', rotulo: 'Soja' },
    { valor: 'Milho', rotulo: 'Milho' },
    { valor: 'Sorgo', rotulo: 'Sorgo' },
    { valor: 'Milheto', rotulo: 'Milheto' },
    { valor: 'Feijao', rotulo: 'Feijão' },
    { valor: 'Gergelim', rotulo: 'Gergelim' },
    { valor: 'Safra', rotulo: 'Safra' },
    { valor: 'Logistica', rotulo: 'Logística' },
    { valor: 'Mercado', rotulo: 'Mercado' },
    { valor: 'Exportacao', rotulo: 'Exportação' }
];

const ROTULO_CATEGORIA = CATEGORIAS.reduce((mapa, categoria) => {
    mapa[categoria.valor] = categoria.rotulo;
    return mapa;
}, {});

function urlSegura(valor) {
    const texto = String(valor || '').trim();
    if (!/^https?:\/\//i.test(texto)) return '';
    return texto;
}

function formatarData(iso) {
    if (!iso) return '';

    const data = new Date(iso);
    if (isNaN(data.getTime())) return '';

    /* A listagem e filtrada pelo dia de Mato Grosso (-04:00). Se a data
       do card saisse no fuso do navegador, a mesma materia apareceria
       no dia 12 com o rotulo 13 (so muda na faixa da noite, mas
       aparece). Por isso a data e lida no fuso do site. */
    const noFuso = new Date(data.getTime() + FUSO_QG);

    const dia = String(noFuso.getUTCDate()).padStart(2, '0');
    const mes = String(noFuso.getUTCMonth() + 1).padStart(2, '0');
    const ano = noFuso.getUTCFullYear();

    return dia + '/' + mes + '/' + ano;
}

function iconeSprite(id) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ic');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);

    return svg;
}

function limparElemento(elemento) {
    while (elemento.firstChild) elemento.removeChild(elemento.firstChild);
}

function mostrarAvisoNoticias(texto, acao) {
    const grade = document.getElementById('newsGrid');
    if (!grade) return;

    limparElemento(grade);

    const aviso = document.createElement('p');
    aviso.className = 'news-empty';
    aviso.textContent = texto;

    grade.appendChild(aviso);

    /* Botão de ajuda: "ver as de ontem" ou "voltar para as de hoje" */
    if (acao && acao.texto) {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'news-data-acao';
        botao.textContent = acao.texto;

        if (typeof acao.clique === 'function') {
            botao.addEventListener('click', acao.clique);
        }

        grade.appendChild(botao);
    }
}

/* ------------------------------------------------------------------
 * Manchete da notícia (o card da listagem)
 * ------------------------------------------------------------------
 * O card inteiro é o link: ele abre a página da matéria dentro do site
 * (noticia.html?id=...). O visitante nunca é levado para a página de
 * origem — o crédito da fonte fica no fim do texto da matéria.
 * ------------------------------------------------------------------ */
function criarCardNoticia(noticia) {
    const card = document.createElement('a');
    card.className = 'news-card news-card-link';
    card.href = 'noticia.html?id=' + encodeURIComponent(noticia.id || '');

    if (noticia.id) card.setAttribute('data-noticia-id', noticia.id);

    const midia = document.createElement('div');
    midia.className = 'news-media';

    const imagemUrl = urlSegura(noticia.imagem_url);

    if (imagemUrl) {
        const imagem = document.createElement('img');
        imagem.src = imagemUrl;
        imagem.alt = noticia.titulo || 'Notícia do agronegócio';
        imagem.loading = 'lazy';
        imagem.decoding = 'async';

        imagem.addEventListener('error', () => {
            midia.classList.add('news-media-placeholder');
            midia.removeChild(imagem);
            midia.appendChild(iconeSprite('ic-sprout'));
        });

        midia.appendChild(imagem);
    } else {
        midia.classList.add('news-media-placeholder');
        midia.appendChild(iconeSprite('ic-sprout'));
    }

    card.appendChild(midia);

    const corpo = document.createElement('div');
    corpo.className = 'news-body';

    const meta = document.createElement('div');
    meta.className = 'news-meta';

    const categoria = document.createElement('span');
    categoria.className = 'news-category';
    categoria.textContent = ROTULO_CATEGORIA[noticia.categoria] || noticia.categoria || 'Geral';
    meta.appendChild(categoria);

    const tempo = document.createElement('time');
    tempo.className = 'news-date';
    if (noticia.publicado_em) tempo.setAttribute('datetime', noticia.publicado_em);
    tempo.textContent = formatarData(noticia.publicado_em);
    meta.appendChild(tempo);

    corpo.appendChild(meta);

    const titulo = document.createElement('h3');
    titulo.textContent = noticia.titulo || '';
    corpo.appendChild(titulo);

    if (noticia.resumo) {
        const resumo = document.createElement('p');
        resumo.className = 'news-resumo';
        resumo.textContent = noticia.resumo;
        corpo.appendChild(resumo);
    }

    const indicador = document.createElement('span');
    indicador.className = 'news-indicador';
    indicador.appendChild(document.createTextNode('Ler a matéria'));
    indicador.appendChild(iconeSprite('ic-arrow-right'));

    corpo.appendChild(indicador);

    card.appendChild(corpo);

    return card;
}

function carregarNoticias(acrescentar) {
    const grade = document.getElementById('newsGrid');
    if (!grade) return Promise.resolve([]);

    const botaoMais = document.getElementById('newsMais');
    const continuar = acrescentar === true;

    if (!SUPABASE_ATIVO) {
        if (!continuar) mostrarAvisoNoticias('As notícias do agronegócio entram no ar em breve.');
        if (botaoMais) botaoMais.hidden = true;
        return Promise.resolve([]);
    }

    const consulta = montarConsultaNoticias(continuar);

    return SUPABASE.select('noticias', consulta)
        .then(linhas => {
            const lista = Array.isArray(linhas) ? linhas : [];

            if (!continuar) {
                limparElemento(grade);
                noticiasCarregadas = 0;
                noticiasVisiveis = 0;
            }

            if (!lista.length) {
                if (!continuar) mostrarAvisoNoticias(mensagemSemResultados(), acaoDoEstadoVazio());
            } else {
                lista.forEach((noticia, indice) => {
                    grade.appendChild(criarCardNoticia(noticia));

                    // Faixa patrocinada logo depois do 3º card da página
                    if (indice === 2) inserirFaixaAnuncio(grade);

                    // Card patrocinado dentro da grade (depois do 6º)
                    if (indice === 5) inserirCardAnuncio(grade);
                });

                noticiasCarregadas += lista.length;
                noticiasVisiveis += lista.length;
            }

            atualizarSeoNoticias(noticiasVisiveis > 0);

            // O botão só aparece quando ainda há notícias para carregar
            if (botaoMais) {
                botaoMais.hidden = lista.length < NOTICIAS_POR_PAGINA;
                botaoMais.disabled = false;
                botaoMais.textContent = 'Carregar mais notícias';
                botaoMais.dataset.modo = 'mais';
            }

            return lista;
        })
        .catch(erro => {
            console.warn('Q GRAOS: não foi possível carregar as notícias.', erro && erro.message);

            if (!continuar) mostrarAvisoNoticias('Não foi possível carregar as notícias agora.');

            if (botaoMais) {
                /* O botao precisa ficar visivel: sem isso o texto
                   "Tentar de novo" preparado abaixo nunca aparece e o
                   leitor so pode recarregar a pagina no escuro. */
                botaoMais.hidden = false;
                botaoMais.disabled = false;
                botaoMais.textContent = 'Tentar de novo';
                botaoMais.dataset.modo = 'tentar';
            }

            return [];
        });
}

/* ------------------------------------------------------------------
 * Filtro por categoria (multi-seleção)
 * ------------------------------------------------------------------
 * O leitor pode marcar várias categorias ao mesmo tempo (ex.: Soja +
 * Milho). A escolha fica no endereço (?categoria=Soja,Milho) para que a
 * página possa ser linkada e compartilhada.
 * ------------------------------------------------------------------ */

/* Categorias escolhidas pelo leitor (vazio = ver todas) */
let categoriasSelecionadas = [];

/* Quantas notícias publicadas existem em cada categoria */
let contagemCategorias = {};

/* Valor usado pelo chip "Todas" (não é uma categoria do banco) */
const CATEGORIA_TODAS = '__todas__';

/* Lê ?categoria=Soja,Milho e devolve só as categorias que existem */
function lerCategoriasDaUrl() {
    const parametros = new URLSearchParams(window.location.search);
    const bruto = parametros.get('categoria') || '';
    const validas = CATEGORIAS.map(categoria => categoria.valor);
    const escolhidas = [];

    bruto.split(',').forEach(parte => {
        let valor = parte.trim();

        try {
            valor = decodeURIComponent(valor);
        } catch (erro) {
            /* texto malformado: simplesmente ignorado */
        }

        valor = valor.trim();

        if (validas.indexOf(valor) !== -1 && escolhidas.indexOf(valor) === -1) {
            escolhidas.push(valor);
        }
    });

    return escolhidas;
}

/* Grava a escolha no endereço sem poluir o histórico do navegador */
function escreverCategoriasNaUrl() {
    const parametros = new URLSearchParams(window.location.search);

    if (categoriasSelecionadas.length) {
        parametros.set('categoria', categoriasSelecionadas.join(','));
    } else {
        parametros.delete('categoria');
    }

    const consulta = parametros.toString();
    const novaUrl = window.location.pathname +
        (consulta ? '?' + consulta : '') +
        window.location.hash;

    window.history.replaceState(null, '', novaUrl);
}

/* Canonical e robots conforme o filtro escolhido.
   - Sem filtro: a página é a listagem geral.
   - Com filtro: o canonical aponta para a própria combinação.
   - Combinação sem notícia: noindex e volta para a listagem geral.
   - Dia diferente do de hoje: o canonical continua sendo a listagem e a
     página fica noindex (o conteúdo é o mesmo, só muda a data). */
function atualizarSeoNoticias(temResultados) {
    const canonical = document.querySelector('link[rel="canonical"]');
    const robots = document.querySelector('meta[name="robots"]');

    const base = SITE_URL.replace(/\/+$/, '') + '/noticias.html';
    const filtrada = categoriasSelecionadas.length
        ? base + '?categoria=' + encodeURIComponent(categoriasSelecionadas.join(','))
        : base;

    const semResultado = categoriasSelecionadas.length > 0 && !temResultados;
    const outroDia = (dataSelecionada || hojeEmQg()) !== hojeEmQg();

    const semIndexar = semResultado || outroDia;

    if (canonical) canonical.setAttribute('href', semIndexar ? base : filtrada);
    if (robots) robots.setAttribute('content', semIndexar ? 'noindex, follow' : 'index, follow');
}

/* Monta a consulta do banco conforme as categorias escolhidas */
function montarConsultaNoticias(continuar) {
    const campos = 'id,titulo,resumo,categoria,fonte,url,imagem_url,publicado_em,destaque';

    let consulta = 'select=' + campos + '&publicado=eq.true';

    /* Só o dia escolhido: a listagem abre no dia de hoje e só muda
       quando o leitor troca a data (publicado_em de ... até ...). */
    const dia = dataSelecionada || hojeEmQg();

    consulta += '&publicado_em=gte.' + encodeURIComponent(inicioDoDia(dia));
    consulta += '&publicado_em=lt.' + encodeURIComponent(fimDoDia(dia));

    if (categoriasSelecionadas.length) {
        const lista = categoriasSelecionadas
            .map(valor => 'categoria.eq.' + encodeURIComponent(valor))
            .join(',');

        consulta += '&or=(' + lista + ')';

        // Com filtro a ordem é só por data: o destaque não é empurrado
        // para o topo de uma combinação que ele não representa.
        consulta += '&order=publicado_em.desc';
    } else {
        consulta += '&order=destaque.desc,publicado_em.desc';
    }

    consulta += '&limit=' + NOTICIAS_POR_PAGINA +
        '&offset=' + (continuar ? noticiasCarregadas : 0);

    return consulta;
}

/* Mensagem para quando não há nada no filtro escolhido */
function mensagemSemResultados() {
    const hoje = hojeEmQg();
    const dia = dataSelecionada || hoje;

    const rotulos = categoriasSelecionadas.map(valor => ROTULO_CATEGORIA[valor] || valor);

    let filtro = '';

    if (rotulos.length === 1) {
        filtro = ' em "' + rotulos[0] + '"';
    } else if (rotulos.length > 1) {
        filtro = ' nas categorias "' + rotulos.join('", "') + '"';
    }

    if (dia === hoje) {
        return 'Ainda não publicamos notícia hoje (' + formatarDataQg(dia) + ')' + filtro + '.';
    }

    return 'Não publicamos notícias em ' + formatarDataQg(dia) + filtro + '.';
}

/* Conta quantas notícias publicadas existem em cada categoria.
   Uma consulta leve: do banco vem só o campo categoria.
   A contagem é do dia escolhido — os números dos chips precisam
   falar do que está na tela.

   A consulta é paginada: com o acervo crescendo, um "limit=1000"
   sem paginação devolveria um pedaço arbitrário do banco e os
   chips contariam notícias que não estão na tela. */
function carregarContagemCategorias() {
    if (!SUPABASE_ATIVO) return Promise.resolve({});

    const dia = dataSelecionada || hojeEmQg();

    const base = 'select=categoria&publicado=eq.true' +
        '&publicado_em=gte.' + encodeURIComponent(inicioDoDia(dia)) +
        '&publicado_em=lt.' + encodeURIComponent(fimDoDia(dia)) +
        '&order=publicado_em.desc';

    const contagem = {};
    let offset = 0;

    const pagina = () => {
        const consulta = base + '&limit=1000&offset=' + offset;

        return SUPABASE.select('noticias', consulta)
            .then(linhas => {
                const lista = Array.isArray(linhas) ? linhas : [];

                lista.forEach(linha => {
                    const chave = (linha && linha.categoria) || 'Geral';
                    contagem[chave] = (contagem[chave] || 0) + 1;
                });

                if (lista.length < 1000) {
                    contagemCategorias = contagem;
                    return contagem;
                }

                offset += lista.length;
                return pagina();
            });
    };

    return pagina()
        .catch(erro => {
            console.warn('Q GRAOS: não foi possível contar as categorias.', erro && erro.message);
            return {};
        });
}

/* Cria um chip de categoria */
function criarChipCategoria(valor, total, selecionado) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'filtro-chip';
    botao.setAttribute('data-categoria', valor);
    botao.setAttribute('aria-pressed', selecionado ? 'true' : 'false');

    const rotulo = valor === CATEGORIA_TODAS ? 'Todas' : (ROTULO_CATEGORIA[valor] || valor);
    botao.appendChild(document.createTextNode(rotulo));

    const contagem = document.createElement('span');
    contagem.className = 'filtro-chip-count';
    contagem.textContent = String(total);
    botao.appendChild(contagem);

    return botao;
}

/* Desenha os chips com a contagem de cada categoria */
function montarChipsCategorias() {
    const caixa = document.getElementById('filtroChips');

    let totalGeral = 0;

    Object.keys(contagemCategorias).forEach(chave => {
        totalGeral += contagemCategorias[chave];
    });

    /* Quantas notícias foram publicadas no dia escolhido: é o número
       que a linha de status do bloco de data mostra. */
    noticiasDoDia = totalGeral;

    atualizarBlocoData();

    if (!caixa) return;

    limparElemento(caixa);

    caixa.appendChild(criarChipCategoria(
        CATEGORIA_TODAS,
        totalGeral,
        categoriasSelecionadas.length === 0
    ));

    CATEGORIAS.forEach(categoria => {
        const total = contagemCategorias[categoria.valor] || 0;
        const selecionado = categoriasSelecionadas.indexOf(categoria.valor) !== -1;

        /* Só entram as categorias que têm notícia publicada. A que o leitor
           escolheu aparece sempre: sem o chip não haveria como desmarcar. */
        if (!total && !selecionado) return;

        caixa.appendChild(criarChipCategoria(categoria.valor, total, selecionado));
    });

    const bloco = document.getElementById('filtroCategorias');
    if (bloco) bloco.hidden = false;
}

/* Marca ou desmarca uma categoria e recarrega a lista */
function alternarCategoria(valor) {
    if (valor === CATEGORIA_TODAS) {
        categoriasSelecionadas = [];
    } else {
        const posicao = categoriasSelecionadas.indexOf(valor);

        if (posicao === -1) categoriasSelecionadas.push(valor);
        else categoriasSelecionadas.splice(posicao, 1);
    }

    // Mantém a ordem dos chips, para a URL ficar sempre igual
    categoriasSelecionadas.sort((a, b) => {
        const ia = CATEGORIAS.findIndex(categoria => categoria.valor === a);
        const ib = CATEGORIAS.findIndex(categoria => categoria.valor === b);
        return ia - ib;
    });

    montarChipsCategorias();
    escreverCategoriasNaUrl();

    // A paginação volta ao começo: "carregar mais" nunca mistura
    // uma categoria com outra.
    noticiasCarregadas = 0;
    noticiasVisiveis = 0;
    carregarNoticias(false);
}

/* Liga os chips: clique para marcar, setas para navegar entre eles */
function prepararFiltroCategorias() {
    const caixa = document.getElementById('filtroChips');
    if (!caixa) return;

    caixa.addEventListener('click', evento => {
        const botao = evento.target.closest('button[data-categoria]');
        if (!botao) return;

        alternarCategoria(botao.getAttribute('data-categoria'));
    });

    caixa.addEventListener('keydown', evento => {
        if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return;

        const chips = Array.prototype.slice.call(
            caixa.querySelectorAll('button[data-categoria]')
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

/* ------------------------------------------------------------------
 * Filtro por data (a listagem abre sempre no dia de hoje)
 * ------------------------------------------------------------------
 * A página de notícias mostra o que saiu HOJE, no fuso de Mato Grosso
 * (UTC-4, sem horário de verão). Para ver outro dia o leitor troca a
 * data: o filtro vira um intervalo de tempo na consulta (publicado_em
 * de ... até ...). A escolha fica no endereço (?data=AAAA-MM-DD) e
 * NÃO é guardada no navegador: quem entra de novo vê o dia de hoje.
 * ------------------------------------------------------------------ */

/* Deslocamento fixo de Mato Grosso em relação ao UTC (em ms) */
const FUSO_QG = -4 * 60 * 60 * 1000;

/* Dia escolhido pelo leitor (vazio = hoje) */
let dataSelecionada = '';

/* Dias que têm notícia publicada (para pular de um dia para o outro) */
let diasComNoticia = [];

/* Quantas notícias foram publicadas no dia escolhido */
let noticiasDoDia = 0;

/* Data (AAAA-MM-DD) de um instante, no fuso de Mato Grosso */
function chaveDiaQg(iso) {
    const data = new Date(iso);
    if (isNaN(data.getTime())) return '';

    return new Date(data.getTime() + FUSO_QG).toISOString().slice(0, 10);
}

/* O dia de hoje, no fuso de Mato Grosso */
function hojeEmQg() {
    return new Date(Date.now() + FUSO_QG).toISOString().slice(0, 10);
}

/* Soma (ou subtrai) dias de uma data AAAA-MM-DD */
function somarDias(chave, dias) {
    const partes = String(chave || '').split('-');
    if (partes.length !== 3) return '';

    const data = new Date(
        Number(partes[0]),
        Number(partes[1]) - 1,
        Number(partes[2]) + dias,
        12, 0, 0, 0
    );

    if (isNaN(data.getTime())) return '';

    return data.getFullYear() + '-' +
        String(data.getMonth() + 1).padStart(2, '0') + '-' +
        String(data.getDate()).padStart(2, '0');
}

/* A data existe mesmo? (13/13/2026 não existe) */
function chaveDataValida(valor) {
    const texto = String(valor || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return '';

    const partes = texto.split('-').map(Number);
    const data = new Date(partes[0], partes[1] - 1, partes[2], 12);

    if (isNaN(data.getTime())) return '';
    if (data.getFullYear() !== partes[0]) return '';
    if (data.getMonth() + 1 !== partes[1]) return '';
    if (data.getDate() !== partes[2]) return '';

    return texto;
}

/* Início do dia em ISO, com o fuso de Mato Grosso */
function inicioDoDia(chave) {
    return chave + 'T00:00:00-04:00';
}

/* Fim do dia (o começo do dia seguinte) em ISO */
function fimDoDia(chave) {
    const proximo = somarDias(chave, 1);
    return (proximo || chave) + 'T00:00:00-04:00';
}

/* Data no formato do Brasil (DD/MM/AAAA) */
function formatarDataQg(chave) {
    const partes = String(chave || '').split('-');
    if (partes.length !== 3) return '';

    return partes[2] + '/' + partes[1] + '/' + partes[0];
}

/* Como chamar o dia escolhido: "hoje", "ontem" ou nada (quando o dia
   é outro qualquer, o próprio nome da data faz o papel do rótulo) */
function rotuloDoDia(chave) {
    const hoje = hojeEmQg();

    if (chave === hoje) return 'hoje';
    if (chave === somarDias(hoje, -1)) return 'ontem';

    return '';
}

/* O dia que o leitor pediu no endereço (?data=AAAA-MM-DD) */
function lerDataDaUrl() {
    const parametros = new URLSearchParams(window.location.search);
    const bruto = parametros.get('data') || '';

    let valor = bruto;

    try {
        valor = decodeURIComponent(bruto);
    } catch (erro) {
        valor = bruto;
    }

    const chave = chaveDataValida(valor);
    const hoje = hojeEmQg();

    /* Data inválida ou no futuro: a página abre no dia de hoje */
    if (!chave || chave > hoje) return hoje;

    return chave;
}

/* Grava o dia escolhido no endereço (sem poluir o histórico) */
function escreverDataNaUrl() {
    const parametros = new URLSearchParams(window.location.search);
    const hoje = hojeEmQg();

    if (dataSelecionada && dataSelecionada !== hoje) {
        parametros.set('data', dataSelecionada);
    } else {
        parametros.delete('data');
    }

    const consulta = parametros.toString();
    const novaUrl = window.location.pathname +
        (consulta ? '?' + consulta : '') +
        window.location.hash;

    window.history.replaceState(null, '', novaUrl);
}

/* Carrega os dias que têm notícia (o botão ‹ › pula o dia vazio)

   Paginado: com o acervo grande, um limite fixo de 1000 linhas
   cortaria a lista e a navegação para os dias mais antigos pararia
   de funcionar. */
function carregarDiasComNoticia() {
    if (!SUPABASE_ATIVO) return Promise.resolve([]);

    const dias = [];
    let offset = 0;

    const pagina = () => {
        const consulta = 'select=publicado_em&publicado=eq.true' +
            '&order=publicado_em.desc&limit=1000&offset=' + offset;

        return SUPABASE.select('noticias', consulta)
            .then(linhas => {
                const lista = Array.isArray(linhas) ? linhas : [];

                lista.forEach(linha => {
                    const chave = chaveDiaQg(linha && linha.publicado_em);
                    if (chave && dias.indexOf(chave) === -1) dias.push(chave);
                });

                if (lista.length < 1000) {
                    dias.sort();
                    diasComNoticia = dias;
                    return dias;
                }

                offset += lista.length;
                return pagina();
            });
    };

    return pagina()
        .catch(erro => {
            console.warn('Q GRAOS: não foi possível carregar os dias com notícia.', erro && erro.message);
            return [];
        });
}

/* O dia vizinho que tem notícia (-1 = anterior, 1 = seguinte) */
function diaComNoticiaNoSentido(sentido) {
    const dia = dataSelecionada || hojeEmQg();

    if (sentido < 0) {
        for (let i = diasComNoticia.length - 1; i >= 0; i--) {
            if (diasComNoticia[i] < dia) return diasComNoticia[i];
        }

        return '';
    }

    for (let i = 0; i < diasComNoticia.length; i++) {
        if (diasComNoticia[i] > dia) return diasComNoticia[i];
    }

    return '';
}

/* Atualiza o bloco de data: campo, botões e linha de status */
function atualizarBlocoData() {
    const bloco = document.getElementById('newsData');
    if (!bloco) return;

    const hoje = hojeEmQg();
    const dia = dataSelecionada || hoje;
    const ontem = somarDias(hoje, -1);

    const campo = document.getElementById('newsDataInput');
    const botaoHoje = document.getElementById('newsDataHoje');
    const botaoOntem = document.getElementById('newsDataOntem');
    const anterior = document.getElementById('newsDataAnterior');
    const proximo = document.getElementById('newsDataProximo');
    const status = document.getElementById('newsDataStatus');

    if (campo) {
        campo.value = dia;
        /* Não dá para escolher um dia que ainda vai acontecer */
        campo.max = hoje;
    }

    if (botaoHoje) {
        botaoHoje.setAttribute('aria-pressed', dia === hoje ? 'true' : 'false');
    }

    if (botaoOntem) {
        botaoOntem.setAttribute('aria-pressed', dia === ontem ? 'true' : 'false');
        botaoOntem.disabled = diasComNoticia.indexOf(ontem) === -1;
    }

    if (anterior) anterior.disabled = !diaComNoticiaNoSentido(-1);
    if (proximo) proximo.disabled = !diaComNoticiaNoSentido(1);

    if (status) {
        const quantidade = noticiasDoDia === 1
            ? '1 notícia'
            : noticiasDoDia + ' notícias';

        /* "Notícias de hoje, 11/11/2026" ou "Notícias de 01/01/2000" */
        const rotulo = rotuloDoDia(dia);
        const quando = rotulo
            ? rotulo + ', ' + formatarDataQg(dia)
            : formatarDataQg(dia);

        status.textContent = 'Notícias de ' + quando + ' · ' +
            (noticiasDoDia ? quantidade : 'nenhuma notícia');
    }
}

/* Troca o dia mostrado e recarrega a lista do dia */
function irParaDia(chave) {
    const nova = chaveDataValida(chave);
    if (!nova) return;

    dataSelecionada = nova;

    escreverDataNaUrl();

    /* O painel registra que o leitor trocou o dia (a URL fica no evento) */
    registrarEvento('secao', { secao: 'noticias_data' });

    /* A paginação volta ao começo: "carregar mais" nunca mistura dias */
    noticiasCarregadas = 0;
    noticiasVisiveis = 0;

    carregarContagemCategorias()
        .then(() => {
            montarChipsCategorias();
            return carregarNoticias(false);
        });
}

/* Botão do estado vazio: ajuda o leitor a sair do dia sem notícia */
function acaoDoEstadoVazio() {
    const hoje = hojeEmQg();
    const dia = dataSelecionada || hoje;

    if (dia !== hoje) {
        return {
            texto: 'Voltar para as de hoje',
            clique: function () { irParaDia(hoje); }
        };
    }

    const ontem = somarDias(hoje, -1);

    if (diasComNoticia.indexOf(ontem) !== -1) {
        return {
            texto: 'Ver as de ontem',
            clique: function () { irParaDia(ontem); }
        };
    }

    return null;
}

/* Liga o bloco de data: campo, atalhos e navegação entre os dias */
function prepararFiltroData() {
    const bloco = document.getElementById('newsData');
    if (!bloco) return;

    const campo = document.getElementById('newsDataInput');
    const botaoHoje = document.getElementById('newsDataHoje');
    const botaoOntem = document.getElementById('newsDataOntem');
    const anterior = document.getElementById('newsDataAnterior');
    const proximo = document.getElementById('newsDataProximo');

    if (campo) {
        campo.addEventListener('change', function () {
            irParaDia(campo.value);
        });
    }

    if (botaoHoje) {
        botaoHoje.addEventListener('click', function () {
            irParaDia(hojeEmQg());
        });
    }

    if (botaoOntem) {
        botaoOntem.addEventListener('click', function () {
            irParaDia(somarDias(hojeEmQg(), -1));
        });
    }

    if (anterior) {
        anterior.addEventListener('click', function () {
            irParaDia(diaComNoticiaNoSentido(-1));
        });
    }

    if (proximo) {
        proximo.addEventListener('click', function () {
            irParaDia(diaComNoticiaNoSentido(1));
        });
    }
}

/* ------------------------------------------------------------------
 * Anúncios (espaços patrocinados)
 * ------------------------------------------------------------------
 * Regras aplicadas a todo anúncio do site:
 *   - selo visível de "Publicidade";
 *   - link do anunciante com rel="sponsored nofollow noopener";
 *   - aviso de que a Q GRÃOS é corretora e recebe comissão;
 *   - nenhum script ou pixel de terceiros: só os contadores internos.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------
 * Motor do rodízio de anúncios
 * ------------------------------------------------------------------
 * 1. O banco devolve só os anúncios ELEGÍVEIS: publicados, dentro do
 *    prazo e sem cota esgotada. Anúncio pausado ou com a cota cheia
 *    nunca entra na fila (e nunca "ocupa" a vaga de outro).
 * 2. Os elegíveis viram uma FILA PONDERADA: cada anúncio entra
 *    "peso" vezes no ciclo (peso 3 = três vezes a exposição de um
 *    peso 1).
 * 3. A fila é embaralhada de forma determinística pelo visitante e
 *    pelo dia: todo mundo começa num ponto diferente do ciclo, então
 *    o primeiro anúncio da página já é distribuído entre os
 *    anunciantes.
 * 4. O cursor vive na sessão (sessionStorage): ao navegar, o próximo
 *    espaço mostra o próximo da fila, sem repetir o mesmo anunciante
 *    duas vezes seguidas.
 * 5. "Prioridade" NÃO prende o anúncio no topo: ela só define a
 *    ordem dentro do ciclo (desempate do peso).
 * ------------------------------------------------------------------ */

/* Anúncios elegíveis por posição */
const anunciosPorPosicao = {};

/* Ciclo (fila) montado por espaço: "posicao:formato" */
const ciclosAnuncio = {};

/* Chave do espaço (slot) do anúncio */
function chaveEspacoAnuncio(posicao, formato) {
    return posicao + ':' + (formato || '*');
}

/* Hash FNV-1a: mesma entrada, mesmo número, sem biblioteca externa */
function hashAnuncio(texto) {
    let hash = 2166136261;
    const valor = String(texto);

    for (let i = 0; i < valor.length; i++) {
        hash ^= valor.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

/* Semente do dia: muda a cada dia, mas é a mesma para o mesmo visitante */
function sementeAnuncio() {
    const visitante = (typeof ANALYTICS !== 'undefined' && ANALYTICS.visitorId) || 'visitante';

    /* O dia e o do site (-04:00). Com a data UTC, entre 21h e meia-noite
       de Mato Grosso o rodizio dos anuncios ja comecaria no dia
       seguinte. */
    const dia = hojeEmQg();

    return visitante + '|' + dia;
}

/* Estado do espaço dentro da sessão */
function lerEstadoEspacoAnuncio(chave) {
    const bruto = lerArmazenamento('sessionStorage', 'qg_espaco_' + chave);
    if (!bruto) return null;

    try {
        return JSON.parse(bruto) || null;
    } catch (erro) {
        return null;
    }
}

function gravarEstadoEspacoAnuncio(chave, estado) {
    gravarArmazenamento('sessionStorage', 'qg_espaco_' + chave, JSON.stringify(estado));
}

/* Monta o ciclo ponderado (rodízio ponderado).
   Cada anúncio entra "peso" vezes no ciclo; a prioridade define a
   ordem de entrada (desempate quando os pesos são iguais). */
function montarCicloAnuncio(lista) {
    if (!lista.length) return [];

    const pesos = lista.map(anuncio => Math.max(1, Math.min(10, Number(anuncio.peso) || 1)));
    const total = pesos.reduce((soma, peso) => soma + peso, 0);
    const atuais = pesos.map(() => 0);
    const ciclo = [];

    for (let passo = 0; passo < total; passo++) {
        for (let i = 0; i < lista.length; i++) atuais[i] += pesos[i];

        let escolhido = 0;

        for (let i = 1; i < lista.length; i++) {
            /* Empate fica com o primeiro da lista (maior prioridade). */
            if (atuais[i] > atuais[escolhido]) escolhido = i;
        }

        atuais[escolhido] -= total;
        ciclo.push(lista[escolhido]);
    }

    return ciclo;
}

/* Carrega os anúncios elegíveis de uma posição (uma consulta só) */
function carregarAnuncios(posicao) {
    if (!SUPABASE_ATIVO) return Promise.resolve([]);

    return SUPABASE.rpc('anuncios_elegiveis', { p_posicao: posicao, p_formato: null })
        .then(linhas => Array.isArray(linhas) ? linhas : [])
        .catch(erro => {
            console.warn('Q GRAOS: a função de rodízio não respondeu; usando a consulta direta.', erro && erro.message);
            return carregarAnunciosDireto(posicao);
        });
}

/* Reserva: se a função do banco ainda não existir, consulta a tabela e
   filtra o prazo no navegador (as cotas são dados do painel: o banco
   não as libera para o público). */
function carregarAnunciosDireto(posicao) {
    const completa = 'select=id,titulo,empresa,texto,url,imagem_url,formato,posicao,prioridade,' +
        'peso,inicio_em,fim_em&publicado=eq.true&posicao=eq.' +
        encodeURIComponent(posicao) + '&order=prioridade.desc&limit=50';

    const simples = 'select=id,titulo,empresa,texto,url,imagem_url,formato,posicao,prioridade,' +
        'inicio_em,fim_em&publicado=eq.true&posicao=eq.' + encodeURIComponent(posicao) +
        '&order=prioridade.desc&limit=50';

    return SUPABASE.select('anuncios', completa)
        .catch(() => SUPABASE.select('anuncios', simples))
        .then(linhas => {
            const agora = Date.now();

            return (Array.isArray(linhas) ? linhas : []).filter(anuncio => {
                const inicio = anuncio.inicio_em ? new Date(anuncio.inicio_em).getTime() : null;
                const fim = anuncio.fim_em ? new Date(anuncio.fim_em).getTime() : null;

                if (inicio !== null && agora < inicio) return false;
                if (fim !== null && agora > fim) return false;

                return true;
            });
        })
        .catch(erro => {
            console.warn('Q GRAOS: não foi possível carregar os anúncios.', erro && erro.message);
            return [];
        });
}

/* Pega o próximo anúncio do espaço (rotação de verdade) */
function proximoAnuncioEspaco(posicao, formato) {
    const chave = chaveEspacoAnuncio(posicao, formato);
    const lista = (anunciosPorPosicao[posicao] || []).filter(anuncio => {
        return formato ? anuncio.formato === formato : true;
    });

    if (!lista.length) return null;

    const assinatura = hashAnuncio(
        lista.map(anuncio => anuncio.id + ':' + (anuncio.peso || 1) + ':' + (anuncio.prioridade || 0)).join('|')
    );

    let ciclo = ciclosAnuncio[chave];

    /* (re)monta o ciclo quando a lista elegível muda */
    if (!ciclo || ciclo.assinatura !== assinatura) {
        const estado = lerEstadoEspacoAnuncio(chave) || {};
        const itens = montarCicloAnuncio(lista);

        ciclo = {
            assinatura: assinatura,
            itens: itens,
            cursor: Number(estado.cursor) || 0,
            ultimo: estado.ultimo || '',
            deslocamento: 0
        };

        ciclo.cursor = ciclo.cursor % itens.length;

        /* Cada visitante começa num ponto diferente do ciclo */
        const semente = hashAnuncio(sementeAnuncio() + '|' + chave);
        ciclo.deslocamento = semente % itens.length;

        ciclosAnuncio[chave] = ciclo;
    }

    if (!ciclo.itens.length) return null;

    /* Índice do próximo: deslocamento (visitante) + cursor (sessão) */
    let indice = (ciclo.deslocamento + ciclo.cursor) % ciclo.itens.length;

    /* Não repete o mesmo anunciante em dois espaços seguidos */
    if (ciclo.ultimo && ciclo.itens.length > 1) {
        let tentativas = 0;

        while (ciclo.itens[indice].id === ciclo.ultimo && tentativas < ciclo.itens.length) {
            indice = (indice + 1) % ciclo.itens.length;
            tentativas++;
        }
    }

    const anuncio = ciclo.itens[indice];

    ciclo.cursor = (ciclo.cursor + 1) % ciclo.itens.length;
    ciclo.ultimo = anuncio.id;

    gravarEstadoEspacoAnuncio(chave, {
        cursor: ciclo.cursor,
        ultimo: ciclo.ultimo,
        dia: hojeEmQg()
    });

    return anuncio;
}

/* Selo "Publicidade" — obrigatório em todo espaço patrocinado */
function criarSeloAnuncio() {
    const selo = document.createElement('span');
    selo.className = 'anuncio-selo';
    selo.textContent = 'Publicidade';
    return selo;
}

/* Aviso legal do anúncio */
function criarAvisoAnuncio() {
    const aviso = document.createElement('p');
    aviso.className = 'anuncio-aviso';

    aviso.appendChild(document.createTextNode(
        'A Q GRÃOS é corretora e recebe comissão pela intermediação. ' +
        'Este anúncio não é uma recomendação da Q GRÃOS. '
    ));

    const politica = document.createElement('a');
    politica.className = 'anuncio-politica';
    politica.href = 'publicidade.html';
    politica.textContent = 'Política de publicidade';
    aviso.appendChild(politica);

    return aviso;
}

/* Logo (ou nome) do anunciante */
function criarMarcaAnuncio(anuncio) {
    const marca = document.createElement('div');
    marca.className = 'anuncio-marca';

    const logo = urlSegura(anuncio.imagem_url);

    if (logo) {
        const imagem = document.createElement('img');
        imagem.src = logo;
        imagem.alt = anuncio.empresa || 'Anunciante';
        imagem.loading = 'lazy';
        imagem.decoding = 'async';

        imagem.addEventListener('error', () => {
            marca.textContent = anuncio.empresa || '';
        });

        marca.appendChild(imagem);
    } else {
        marca.textContent = anuncio.empresa || '';
    }

    return marca;
}

/* Título e frase do anúncio */
function criarTextoAnuncio(anuncio) {
    const texto = document.createElement('div');
    texto.className = 'anuncio-texto';

    const titulo = document.createElement('strong');
    titulo.className = 'anuncio-titulo';
    titulo.textContent = anuncio.titulo || '';
    texto.appendChild(titulo);

    if (anuncio.texto) {
        const frase = document.createElement('span');
        frase.className = 'anuncio-frase';
        frase.textContent = anuncio.texto;
        texto.appendChild(frase);
    }

    return texto;
}

/* Botão "Saiba mais" — sempre com rel="sponsored nofollow noopener" */
function criarCtaAnuncio(anuncio) {
    const link = urlSegura(anuncio.url);

    const botao = document.createElement('a');
    botao.className = 'anuncio-cta anuncio-link';
    botao.textContent = 'Saiba mais';

    if (link) {
        botao.href = link;
        botao.target = '_blank';
        botao.rel = 'sponsored nofollow noopener';
    } else {
        botao.setAttribute('aria-disabled', 'true');
        botao.removeAttribute('href');
    }

    if (anuncio.id) botao.setAttribute('data-anuncio-id', anuncio.id);

    return botao;
}

/* Faixa patrocinada (banner entre os cards) */
function criarFaixaAnuncio(anuncio) {
    const bloco = document.createElement('aside');
    bloco.className = 'anuncio anuncio-faixa';
    bloco.setAttribute('aria-label', 'Publicidade');

    if (anuncio.id) bloco.setAttribute('data-anuncio-id', anuncio.id);
    bloco.setAttribute('data-anuncio-formato', 'faixa');

    const conteudo = document.createElement('div');
    conteudo.className = 'anuncio-conteudo';

    conteudo.appendChild(criarMarcaAnuncio(anuncio));
    conteudo.appendChild(criarTextoAnuncio(anuncio));
    conteudo.appendChild(criarCtaAnuncio(anuncio));

    bloco.appendChild(criarSeloAnuncio());
    bloco.appendChild(conteudo);
    bloco.appendChild(criarAvisoAnuncio());

    return bloco;
}

/* Card patrocinado (dentro da grade, com selo visível) */
function criarCardAnuncio(anuncio) {
    const cartao = document.createElement('article');
    cartao.className = 'anuncio-card';
    cartao.setAttribute('aria-label', 'Publicidade');

    if (anuncio.id) cartao.setAttribute('data-anuncio-id', anuncio.id);
    cartao.setAttribute('data-anuncio-formato', 'card');

    const conteudo = document.createElement('div');
    conteudo.className = 'anuncio-conteudo';

    conteudo.appendChild(criarMarcaAnuncio(anuncio));
    conteudo.appendChild(criarTextoAnuncio(anuncio));
    conteudo.appendChild(criarCtaAnuncio(anuncio));

    cartao.appendChild(criarSeloAnuncio());
    cartao.appendChild(conteudo);
    cartao.appendChild(criarAvisoAnuncio());

    return cartao;
}

/* Insere a faixa patrocinada na grade */
function inserirFaixaAnuncio(container) {
    if (!window.QGAnuncios) return;

    const proximo = window.QGAnuncios.proximo('noticias', 'faixa');
    if (!proximo) return;

    container.appendChild(proximo.elemento);
    observarImpressaoAnuncio(proximo.elemento);
}

/* Insere o card patrocinado na grade */
function inserirCardAnuncio(container) {
    if (!window.QGAnuncios) return;

    const proximo = window.QGAnuncios.proximo('noticias', 'card');
    if (!proximo) return;

    container.appendChild(proximo.elemento);
    observarImpressaoAnuncio(proximo.elemento);
}

/* Conta a impressão uma única vez, quando o anúncio aparece na tela.
   Nada de pixel de terceiros: só o contador interno do banco. */
function observarImpressaoAnuncio(elemento) {
    if (!SUPABASE_ATIVO || !elemento || !('IntersectionObserver' in window)) return;

    const id = elemento.getAttribute('data-anuncio-id');
    if (!id) return;

    const observador = new IntersectionObserver(entradas => {
        entradas.forEach(entrada => {
            if (!entrada.isIntersecting) return;

            observador.disconnect();

            SUPABASE.rpc('registrar_impressao_anuncio', { p_id: id }).catch(() => {
                /* contador é acessório: se falhar, a página continua */
            });
        });
    }, { threshold: 0.5 });

    observador.observe(elemento);
}

/* ------------------------------------------------------------------
 * API do motor de anúncios (usada pelo script.js e pelo noticia.js)
 * ------------------------------------------------------------------ */

const QGAnuncios = {
    /* Carrega os anúncios elegíveis de uma posição */
    iniciar: function (posicao) {
        if (!SUPABASE_ATIVO) {
            anunciosPorPosicao[posicao] = [];
            return Promise.resolve([]);
        }

        return carregarAnuncios(posicao).then(lista => {
            anunciosPorPosicao[posicao] = lista;
            return lista;
        });
    },

    /* Próximo anúncio do espaço, já com o bloco pronto.
       O bloco respeita o formato declarado pelo anunciante. */
    proximo: function (posicao, formato) {
        const anuncio = proximoAnuncioEspaco(posicao, formato);
        if (!anuncio) return null;

        return {
            anuncio: anuncio,
            elemento: anuncio.formato === 'card'
                ? criarCardAnuncio(anuncio)
                : criarFaixaAnuncio(anuncio)
        };
    },

    /* Conta a impressão quando o bloco aparece na tela */
    observar: function (elemento) {
        observarImpressaoAnuncio(elemento);
    }
};

if (typeof window !== 'undefined') window.QGAnuncios = QGAnuncios;

/* Botão "carregar mais" (só existe na página de notícias) */
function prepararBotaoMaisNoticias() {
    const botao = document.getElementById('newsMais');
    if (!botao) return;

    botao.addEventListener('click', () => {
        botao.disabled = true;
        botao.textContent = 'Carregando…';

        /* O botao "Tentar de novo" volta a carregar a lista do dia
           escolhido (e nao a proxima pagina), para nao misturar dias. */
        const continuando = botao.dataset.modo === 'mais';

        carregarNoticias(continuando)
            .then(() => {
                if (continuando) botao.textContent = 'Carregar mais notícias';
            })
            .catch(() => {
                botao.disabled = false;
                botao.textContent = 'Tentar de novo';
            });
    });
}

/* ---------- Partida ---------- */

prepararAnalytics();
observarSecoes();
observarCliques();
prepararBotaoMaisNoticias();
prepararFiltroCategorias();
prepararFiltroData();

/* A ficha de contato sabe de onde veio o visitante: quando ele chega
   da página de uma matéria, a opção de busca vem marcada e a origem
   do lead é a matéria (e não a home). */
definirOrigemDoLead();
aplicarPreenchimentoDaUrl();
prepararAncoraContato();

/* Só a página de notícias tem lista, filtro e espaços patrocinados */
if (document.getElementById('newsGrid')) {
    categoriasSelecionadas = lerCategoriasDaUrl();

    /* A listagem abre no dia de hoje (ou no dia que o leitor pediu
       na URL). A escolha não fica guardada no navegador. */
    dataSelecionada = lerDataDaUrl();

    /* Primeiro os anúncios elegíveis, os dias com notícia e a contagem
       por categoria; depois a lista do dia escolhido */
    QGAnuncios.iniciar('noticias')
        .then(() => carregarDiasComNoticia())
        .then(() => carregarContagemCategorias())
        .then(() => {
            montarChipsCategorias();
            return carregarNoticias(false);
        })
        .catch(() => {
            montarChipsCategorias();
            return carregarNoticias(false);
        });
}

registrarEvento('pageview');
reenviarLeadsPendentes();
