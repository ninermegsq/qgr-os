'use strict';

/* ------------------------------------------------------------------
 * Teste da configuracao central (site.config.js -> HTML).
 *
 * Nao ha navegador neste ambiente, entao o script.js e executado
 * contra um DOM simulado: a funcao applySiteConfig e extraida do
 * script.js e executada de verdade sobre os elementos marcados com
 * data-config que existem no index.html.
 *
 * Roda: npm run test:config
 * ------------------------------------------------------------------ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const failures = [];
const checks = [];

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

/* ---------- Configuracao ---------- */
function readSiteConfig() {
    const code = read('site.config.js');
    const sandbox = {};
    const factory = new Function('window', code + '\nreturn window.QG_SITE || {};');
    return factory(sandbox) || {};
}

const SITE = readSiteConfig();

/* ---------- DOM simulado ---------- */
function FakeElement(tagName, attributes, innerHtml) {
    this.tagName = tagName.toUpperCase();
    this.attributes = Object.assign({}, attributes);
    this.innerHtml = innerHtml || '';
    // Um elemento "tem filhos" quando o conteudo interno tem tags
    this.children = /<[a-zA-Z]/.test(this.innerHtml) ? [{}] : [];
    this.textContent = this.innerHtml.replace(/<[^>]*>/g, '').trim();
}

FakeElement.prototype.getAttribute = function (name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
};

FakeElement.prototype.setAttribute = function (name, value) {
    this.attributes[name] = value;
};

FakeElement.prototype.removeAttribute = function (name) {
    delete this.attributes[name];
};

/* Extrai do HTML os elementos com data-config e o conteudo interno deles */
function extractConfiguredElements(html) {
    const elements = [];
    const tagPattern = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
    let match;

    while ((match = tagPattern.exec(html)) !== null) {
        const tagName = match[1];
        const rawAttributes = match[2];

        const configMatch = rawAttributes.match(/data-config="([^"]+)"/);
        if (!configMatch) continue;

        const attributes = {};
        const attributePattern = /([a-zA-Z-]+)="([^"]*)"/g;
        let attribute;

        while ((attribute = attributePattern.exec(rawAttributes)) !== null) {
            attributes[attribute[1]] = attribute[2];
        }

        // Conteudo interno: vai do fim da tag de abertura ate a tag de fechamento
        const contentStart = match.index + match[0].length;
        const closeTag = '</' + tagName.toLowerCase();
        const closeIndex = html.toLowerCase().indexOf(closeTag.toLowerCase(), contentStart);
        const innerHtml = closeIndex === -1 ? '' : html.slice(contentStart, closeIndex);

        elements.push(new FakeElement(tagName, attributes, innerHtml));
    }

    return elements;
}

/* Extrai a funcao applySiteConfig do script.js (sem alterar o arquivo) */
function extractApplyFunction(source) {
    const start = source.indexOf('function applySiteConfig()');
    if (start === -1) throw new Error('applySiteConfig nao encontrada no script.js');

    let depth = 0;
    let end = -1;

    for (let index = source.indexOf('{', start); index < source.length; index++) {
        if (source[index] === '{') depth++;
        else if (source[index] === '}') {
            depth--;
            if (depth === 0) { end = index + 1; break; }
        }
    }

    if (end === -1) throw new Error('applySiteConfig nao fechada no script.js');
    return source.slice(start, end);
}

function expect(label, actual, wanted) {
    if (actual === wanted) {
        checks.push(label + '  ->  ' + wanted);
    } else {
        failures.push(label + '  ->  "' + actual + '" (esperava "' + wanted + '")');
    }
}

/* ---------- Execucao ---------- */
const expected = {
    whatsappHref: 'https://wa.me/' + SITE.whatsapp,
    phoneHref: 'tel:' + SITE.phoneE164,
    emailHref: 'mailto:' + SITE.email,
    instagramHref: SITE.socials.instagram,
    phoneText: SITE.phoneDisplay,
    emailText: SITE.email,
    cnpjText: SITE.cnpj,
    addressText: SITE.address,
    yearText: String(new Date().getFullYear())
};

const applyFunction = extractApplyFunction(read('script.js'));

['index.html', '404.html'].forEach(file => {
    const html = read(file);
    const elements = extractConfiguredElements(html);

    const fakeDocument = {
        querySelectorAll: selector => (selector === '[data-config]' ? elements : [])
    };

    const factory = new Function('SITE', 'document', applyFunction + '\nreturn applySiteConfig;');
    factory(SITE, fakeDocument)();

    console.log('');
    console.log('  ' + file + ': ' + elements.length + ' elemento(s) com data-config');

    elements.forEach((element, index) => {
        const key = element.getAttribute('data-config');
        const textKey = element.getAttribute('data-config-text') || key;
        const label = file + ' #' + index + ' [data-config="' + key + '"]';

    if (key === 'whatsapp') {
        expect(label + ' href', element.getAttribute('href'), expected.whatsappHref);
        expect(label + ' target', element.getAttribute('target'), '_blank');
        expect(label + ' rel', element.getAttribute('rel'), 'noopener noreferrer');
    }

    if (key === 'phone') {
        expect(label + ' href', element.getAttribute('href'), expected.phoneHref);
    }

    if (key === 'email') {
        expect(label + ' href', element.getAttribute('href'), expected.emailHref);
    }

    if (key === 'instagram') {
        expect(label + ' href', element.getAttribute('href'), expected.instagramHref);
        expect(label + ' target', element.getAttribute('target'), '_blank');
    }

    if (textKey === 'phone') {
        expect(label + ' texto', element.textContent, expected.phoneText);
    }

    if (textKey === 'email') {
        expect(label + ' texto', element.textContent, expected.emailText);
    }

    if (textKey === 'cnpj') {
        expect(label + ' texto', element.textContent, expected.cnpjText);
    }

    if (textKey === 'address') {
        expect(label + ' texto', element.textContent, expected.addressText);
    }

    if (textKey === 'year') {
        expect(label + ' texto', element.textContent, expected.yearText);
    }
    });

    // O icone do Instagram nao pode ser apagado pela aplicacao do config
    const instagram = elements.find(element => element.getAttribute('data-config') === 'instagram');
    if (instagram && instagram.children.length === 0) {
        failures.push(file + ': o icone do Instagram foi removido do link');
    }
});

/* ---------- Relatorio ---------- */
console.log('');
console.log('=== Teste da configuracao (site.config.js) ===');
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
console.log('Resultado: configuracao aplicada corretamente em todos os elementos.');
console.log('');
