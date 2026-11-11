'use strict';

/* ------------------------------------------------------------------
 * Q GRAOS — cliente REST do Supabase (sem SDK e sem CDN)
 * ------------------------------------------------------------------
 * O site e o painel /admin conversam com o Supabase pela API REST
 * (PostgREST + GoTrue) usando só `fetch`. Isso mantém o projeto
 * "zero dependência": nada de supabase-js, nada de build.
 *
 * Segurança (leia antes de mexer):
 *   - A "anon key" NÃO é senha: ela é pública por definição e vai
 *     no site. O que protege os dados são as políticas de RLS.
 *   - A "service role key" NUNCA entra neste arquivo: ela não deve
 *     ir para o navegador. Quem precisar dela roda no servidor.
 *   - O site público só grava dados pelas funções RPC do banco
 *     (registrar_lead / registrar_evento), nunca direto na tabela.
 * ------------------------------------------------------------------ */

(function () {
    const FALLBACK = {
        url: 'https://rppoiwrbxqdbtavhgdjk.supabase.co',
        anonKey: ''
    };

    const SESSION_KEY = 'qg_admin_session';

    function readConfig() {
        const site = (typeof window !== 'undefined' && window.QG_SITE) || {};
        const supabase = site.supabase || {};

        return {
            url: String(supabase.url || FALLBACK.url || '').replace(/\/+$/, ''),
            anonKey: String(supabase.anonKey || FALLBACK.anonKey || '').trim()
        };
    }

    const config = readConfig();

    let session = null;

    /* ---------- Sessão do painel ---------- */

    function loadStoredSession() {
        try {
            const raw = window.localStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.access_token) return null;
            return parsed;
        } catch (error) {
            return null;
        }
    }

    function storeSession(value) {
        try {
            if (value) window.localStorage.setItem(SESSION_KEY, JSON.stringify(value));
            else window.localStorage.removeItem(SESSION_KEY);
        } catch (error) {
            /* modo privativo do navegador: segue sem persistir */
        }
    }

    function isExpired(sessionData) {
        if (!sessionData || !sessionData.expires_at) return true;
        // 60s de folga para não usar um token que vence no meio da requisição
        return sessionData.expires_at * 1000 - 60000 <= Date.now();
    }

    /* ----------requisição ---------- */

    function buildHeaders(extra) {
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            apikey: config.anonKey
        };

        if (session && session.access_token) {
            headers.Authorization = 'Bearer ' + session.access_token;
        }

        return Object.assign(headers, extra || {});
    }

    async function request(path, options) {
        const opts = options || {};

        const response = await fetch(config.url + path, {
            method: opts.method || 'GET',
            headers: buildHeaders(opts.headers),
            body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
            cache: 'no-store',
            credentials: 'omit'
        });

        if (!response.ok) {
            let detail = '';

            try {
                detail = await response.text();
            } catch (error) {
                detail = '';
            }

            const error = new Error(
                'HTTP ' + response.status + (detail ? ': ' + detail.slice(0, 400) : '')
            );
            error.status = response.status;
            error.body = detail;
            throw error;
        }

        if (response.status === 204) return null;

        const text = await response.text();
        if (!text) return null;

        try {
            return JSON.parse(text);
        } catch (error) {
            return text;
        }
    }

    /* ---------- API ---------- */

    const api = {
        config: config,

        /* true quando a URL e a anon key estão preenchidas */
        isConfigured: function () {
            return Boolean(config.url && config.anonKey);
        },

        /* true quando há sessão ativa (e válida) */
        isAuthenticated: function () {
            return Boolean(session && session.access_token);
        },

        getSession: function () {
            return session;
        },

        getUser: function () {
            return session && session.user ? session.user : null;
        },

        /* Restaura a sessão salva no navegador (chamado no boot do painel) */
        restoreSession: function () {
            session = loadStoredSession();
            return session;
        },

        /* ---------- REST genérico ---------- */

        select: function (table, query, extraHeaders) {
            const qs = query ? '?' + query : '';
            return request('/rest/v1/' + table + qs, { headers: extraHeaders });
        },

        insert: function (table, row) {
            return request('/rest/v1/' + table, {
                method: 'POST',
                headers: { Prefer: 'return=representation' },
                body: row
            });
        },

        update: function (table, filter, row) {
            return request('/rest/v1/' + table + '?' + filter, {
                method: 'PATCH',
                headers: { Prefer: 'return=representation' },
                body: row
            });
        },

        remove: function (table, filter) {
            return request('/rest/v1/' + table + '?' + filter, { method: 'DELETE' });
        },

        /* Chamada de função do banco (RPC) */
        rpc: function (name, params) {
            return request('/rest/v1/rpc/' + name, {
                method: 'POST',
                body: params || {}
            });
        },

        /* ---------- Autenticação ---------- */

        signIn: async function (email, password) {
            const data = await request('/auth/v1/token?grant_type=password', {
                method: 'POST',
                body: { email: email, password: password }
            });

            session = {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
                user: data.user || null
            };

            storeSession(session);
            return session;
        },

        /* Renova o token quando a sessão expirou */
        refreshSession: async function () {
            if (!session || !session.refresh_token) return null;

            const data = await request('/auth/v1/token?grant_type=refresh_token', {
                method: 'POST',
                body: { refresh_token: session.refresh_token }
            });

            session = {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
                user: data.user || (session.user || null)
            };

            storeSession(session);
            return session;
        },

        signOut: function () {
            session = null;
            storeSession(null);
        },

        /* Garante que existe uma sessão utilizável antes de uma chamada */
        ensureSession: async function () {
            if (!session) session = loadStoredSession();
            if (!session) return null;
            if (isExpired(session)) {
                try {
                    await api.refreshSession();
                } catch (error) {
                    session = null;
                    storeSession(null);
                    return null;
                }
            }
            return session;
        }
    };

    if (typeof window !== 'undefined') {
        window.QGSupabase = api;
    }

    // Exporta também para os testes em Node (tools/)
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
