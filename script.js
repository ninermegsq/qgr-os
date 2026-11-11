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
        `*Link de Origem:* ${SITE_URL}`;

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
        p_path: window.location.pathname,
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
        p_origem_url: window.location.href,
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

        if (link.classList.contains('news-link') && SUPABASE_ATIVO) {
            registrarEvento('clique_noticia');

            const id = link.getAttribute('data-noticia-id');
            if (id) {
                SUPABASE.rpc('clicar_noticia', { p_id: id }).catch(erro => {
                    console.warn('Q GRAOS: não foi possível contar o clique.', erro && erro.message);
                });
            }
        }
    }, true);
}

/* ------------------------------------------------------------------
 * Seção de notícias
 * ------------------------------------------------------------------ */

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
    const ano = data.getFullYear();

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

function mostrarAvisoNoticias(texto) {
    const grade = document.getElementById('newsGrid');
    if (!grade) return;

    limparElemento(grade);

    const aviso = document.createElement('p');
    aviso.className = 'news-empty';
    aviso.textContent = texto;

    grade.appendChild(aviso);
}

function criarCardNoticia(noticia) {
    const card = document.createElement('article');
    card.className = 'news-card tilt-card';

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
    categoria.textContent = noticia.categoria || 'Geral';
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
        resumo.textContent = noticia.resumo;
        corpo.appendChild(resumo);
    }

    const link = urlSegura(noticia.url);

    if (link) {
        const ancora = document.createElement('a');
        ancora.className = 'link-arrow news-link';
        ancora.href = link;
        ancora.target = '_blank';
        ancora.rel = 'noopener noreferrer';
        if (noticia.id) ancora.setAttribute('data-noticia-id', noticia.id);

        ancora.appendChild(document.createTextNode(
            noticia.fonte ? 'Ler no ' + noticia.fonte : 'Ler mais'
        ));
        ancora.appendChild(iconeSprite('ic-arrow-right'));

        corpo.appendChild(ancora);
    }

    card.appendChild(corpo);

    return card;
}

function carregarNoticias() {
    const grade = document.getElementById('newsGrid');
    if (!grade) return;

    if (!SUPABASE_ATIVO) {
        mostrarAvisoNoticias('As notícias do agronegócio entram no ar em breve.');
        return;
    }

    const consulta = 'select=id,titulo,resumo,categoria,fonte,url,imagem_url,publicado_em,destaque' +
        '&publicado=eq.true&order=destaque.desc,publicado_em.desc&limit=6';

    SUPABASE.select('noticias', consulta)
        .then(linhas => {
            const lista = Array.isArray(linhas) ? linhas : [];

            limparElemento(grade);

            if (!lista.length) {
                mostrarAvisoNoticias('Nenhuma notícia publicada no momento.');
                return;
            }

            lista.forEach(noticia => grade.appendChild(criarCardNoticia(noticia)));
        })
        .catch(erro => {
            console.warn('Q GRAOS: não foi possível carregar as notícias.', erro && erro.message);
            mostrarAvisoNoticias('Não foi possível carregar as notícias agora.');
        });
}

/* ---------- Partida ---------- */

prepararAnalytics();
observarSecoes();
observarCliques();
carregarNoticias();
registrarEvento('pageview');
reenviarLeadsPendentes();
