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
                'select=id,titulo,resumo,categoria,fonte,url,imagem_url,publicado,destaque,cliques,publicado_em&order=publicado_em.desc,criado_em.desc&limit=200'
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
                        noticia.fonte ? criar('div', { texto: noticia.fonte, style: 'color:#6B6B6B;font-size:0.82rem' }) : null
                    ]),
                    criar('td', {}, [criar('span', {
                        classe: 'pill',
                        texto: ROTULO_CATEGORIA[noticia.categoria] || noticia.categoria
                    })]),
                    criar('td', { texto: formatarData(noticia.publicado_em) }),
                    criar('td', { texto: String(noticia.cliques || 0) }),
                    criar('td', {}, [acaoEditar, espaco(), acaoExcluir])
                ]));
            });
        } catch (erro) {
            limpar(corpo);
            corpo.appendChild(criar('tr', {}, [
                criar('td', { colSpan: '5', texto: 'Erro ao carregar: ' + mensagemDeErro(erro) })
            ]));
        }
    }

    function preencherFormularioNoticia(noticia) {
        byId('newsId').value = noticia.id;
        byId('newsTitle').value = noticia.titulo || '';
        byId('newsSummary').value = noticia.resumo || '';
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
        byId('leadExport').addEventListener('click', exportarLeadsCsv);

        byId('leadSearch').addEventListener('input', evento => {
            estado.filtroLeads = evento.target.value || '';
            desenharLeads();
        });

        document.querySelectorAll('.tab').forEach(botao => {
            botao.addEventListener('click', () => ativarAba(botao.getAttribute('data-tab')));
        });
    }

    async function iniciar() {
        registrarEventos();
        verificarConfiguracao();

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
