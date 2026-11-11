'use strict';

/* ------------------------------------------------------------------
 * Q GRÃOS — configuração central do site
 * ------------------------------------------------------------------
 * É AQUI que você troca telefone, e-mail, CNPJ e redes sociais.
 * O script.js lê estes valores e aplica nos elementos marcados com
 *   data-config="chave"      (link: href) e
 *   data-config-text="chave" (texto do link)
 * no index.html e no 404.html.
 *
 * Formato dos campos:
 *   whatsapp     -> só dígitos, com DDI e DDD: '55' + DDD + número
 *   phoneE164    -> telefone internacional, formato E.164: '+5566992281757'
 *   phoneDisplay -> como o telefone aparece para o cliente: '(66) 99228-1757'
 *   siteUrl      -> endereço do site (entra na mensagem do WhatsApp)
 *   address      -> cidade/UF exibida no rodapé
 *
 * O HTML mantém os valores literais como reserva: se este arquivo não
 * carregar, o site continua funcionando exatamente como está hoje.
 * ------------------------------------------------------------------ */

window.QG_SITE = {
    whatsapp: '5566992281757',
    siteUrl: 'https://qgraos.com.br/',
    phoneDisplay: '(66) 99228-1757',
    phoneE164: '+5566992281757',
    email: 'contato@qgraos.com.br',
    cnpj: '62.793.851/0001-96',
    address: 'Mato Grosso, Brasil',
    socials: {
        instagram: 'https://www.instagram.com/q_graos/'
    },

    /* ------------------------------------------------------------------
     * Supabase (noticias, leads, visitas e painel /admin)
     * ------------------------------------------------------------------
     * `anonKey` e a chave PUBLICA (sb_publishable_... ou a antiga anon).
     * Ela vai no navegador de proposito: nao e senha. O que protege os
     * dados sao as politicas de RLS do banco.
     *
     * Onde pegar a chave:
     *   Supabase Dashboard -> Project Settings -> API Keys -> Publishable key
     *
     * Enquanto o `anonKey` estiver vazio, o site funciona igual: a secao
     * de noticias fica vazia e nada e enviado para o banco.
     */
    supabase: {
        url: 'https://rppoiwrbxqdbtavhgdjk.supabase.co',
        anonKey: 'sb_publishable_Rr1vHc5Kr_qQjti4HuaPxA_8pTdjztH'
    }
};
