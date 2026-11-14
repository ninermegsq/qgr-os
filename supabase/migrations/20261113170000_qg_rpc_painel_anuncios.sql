/* =====================================================================
 * Q GRAOS — RPC do painel de anúncios, restrita ao administrador
 * ---------------------------------------------------------------------
 * PROBLEMA
 *   O painel precisa ler a coluna `autorizacao` dos anúncios: é o
 *   campo "Autorizado por" (o contato de quem autorizou o anúncio),
 *   usado na listagem e no formulário de edição.
 *
 *   Até agora essa coluna chegava ao painel por uma view:
 *   `vw_anuncios_desempenho_publica`, criada sem
 *   `security_invoker = true`. Sem esse marcador, a view roda com o
 *   privilégio do DONO da view (o postgres), ignorando a RLS da
 *   tabela `anuncios`. Como a view recebeu apenas
 *   `GRANT SELECT ... TO authenticated`, qualquer pessoa com uma
 *   conta no Supabase — inclusive quem se cadastrou agora e não é
 *   administrador — lê o contato do anunciante e os anúncios
 *   pausados.
 *
 *   Pior: a migration 20261113140000 revoga o acesso de `PUBLIC` e
 *   de `anon` dessa view, mas a REVOKE só é aplicada no banco quando
 *   a migration roda. A view, porém, é criada pela migration
 *   20261113120000 — que ainda NAO esta aplicada no banco de
 *   produção (confirmado: GET /rest/v1/vw_anuncios_desempenho_publica
 *   devolve HTTP 404 / PGRST205). Ou seja: assim que 120000 for
 *   aplicada, a view nasce com o privilegio padrao do Postgres
 *   (`SELECT ... TO PUBLIC`, que inclui o papel `anon`) e o
 *   `autorizacao` passa a vazar para a chave publica do site.
 *
 * A CORRECAO
 *   1. Uma funcao `SECURITY DEFINER` que so responde a
 *      administrador: `public.anuncios_painel_desempenho()`.
 *      Ela devolve as MESMAS colunas da view (o painel le exatamente
 *      esses campos) e checa `public.e_admin()` antes de devolver
 *      qualquer linha. Funcao SECURITY DEFINER tambem recebe por
 *      padrao `EXECUTE ... TO PUBLIC`, entao o revoke de PUBLIC e
 *      obrigatorio.
 *
 *   2. A view publica e recriada SEM a coluna `autorizacao` e COM
 *      `security_invoker = true` — assim ela respeita a RLS da
 *      tabela `anuncios` (quem nao e administrador ve zero linhas) e
 *      nao entrega o contato do anunciante. Ela continua sendo uma
 *      reserva valida para o painel em bancos onde a RPC ainda nao
 *      existe.
 *
 *   3. `vw_anuncios_desempenho` (a view com RLS, que ja existia)
 *      tambem e revogada de PUBLIC e de anon — o privilegio padrao
 *      do Postgres a entregava ao papel anon.
 *
 *   4. `noticias_leitura_publica` volta a valer para `authenticated`.
 *      A migration 20261111225533 estreitou a policy para `anon`
 *      apenas, e como o `CREATE POLICY` substitui a policy anterior
 *      (mesmo nome), quem tem conta e nao e administrador passou a
 *      receber ZERO noticias publicadas — o site, para esse
 *      visitante, fica sem noticias.
 *
 * Idempotente: pode rodar em um banco novo ou em um banco que ja
 * tenha estas views e funcoes. Usa `to_regclass` para nao abortar
 * (42P01) se alguma relacao nao existir.
 * ===================================================================== */

/* ---------- 1. A RPC do painel (somente administrador) ---------- */

CREATE OR REPLACE FUNCTION public.anuncios_painel_desempenho()
RETURNS TABLE (
    id uuid,
    titulo text,
    empresa text,
    texto text,
    url text,
    imagem_url text,
    posicao text,
    formato text,
    publicado boolean,
    prioridade integer,
    peso integer,
    impressoes integer,
    impressoes_hoje integer,
    cliques integer,
    autorizacao text,
    inicio_em timestamptz,
    fim_em timestamptz,
    criado_em timestamptz,
    limite_impressoes integer,
    limite_impressoes_dia integer,
    cota_esgotada boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    /* Sem administrador ativo, a funcao devolve zero linhas — nunca
       um erro, para que o painel caia na reserva sem quebrar. */
    IF NOT public.e_admin() THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        a.id,
        a.titulo,
        a.empresa,
        a.texto,
        a.url,
        a.imagem_url,
        a.posicao,
        a.formato,
        a.publicado,
        a.prioridade,
        a.peso,
        a.impressoes,
        COALESCE(d.impressoes, 0)::integer,
        a.cliques,
        a.autorizacao,
        a.inicio_em,
        a.fim_em,
        a.criado_em,
        a.limite_impressoes,
        a.limite_impressoes_dia,
        CASE
            WHEN a.limite_impressoes IS NOT NULL
                 AND a.impressoes >= a.limite_impressoes THEN true
            WHEN a.limite_impressoes_dia IS NOT NULL
                 AND COALESCE(d.impressoes, 0) >= a.limite_impressoes_dia THEN true
            ELSE false
        END
    FROM public.anuncios a
    LEFT JOIN public.anuncio_impressoes_diarias d
           ON d.anuncio_id = a.id
          AND d.dia = (now() AT TIME ZONE interval '-04:00')::date
    ORDER BY a.prioridade DESC, a.criado_em DESC;
END;
$$;

/* Funcao SECURITY DEFINER recebe `EXECUTE ... TO PUBLIC` por padrao.
   O revoke de PUBLIC e obrigatorio: sem ele, o papel anon executa a
   RPC. O `e_admin()` segura o dado, mas o privilegio nao deve
   existir para o anon. */
REVOKE ALL ON FUNCTION public.anuncios_painel_desempenho() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anuncios_painel_desempenho() FROM anon;
GRANT EXECUTE ON FUNCTION public.anuncios_painel_desempenho() TO authenticated;

/* ---------- 2. A view publica: sem `autorizacao` e com RLS ---------- */

/* A view e recriada, entao as concessoes antigas caem com ela. */
DROP VIEW IF EXISTS public.vw_anuncios_desempenho_publica;

CREATE VIEW public.vw_anuncios_desempenho_publica
WITH (security_invoker = true)
AS
SELECT
    a.id,
    a.titulo,
    a.empresa,
    a.texto,
    a.url,
    a.imagem_url,
    a.posicao,
    a.formato,
    a.publicado,
    a.prioridade,
    a.peso,
    a.impressoes,
    a.cliques,
    a.inicio_em,
    a.fim_em,
    a.criado_em,
    a.limite_impressoes,
    a.limite_impressoes_dia,
    COALESCE(d.impressoes, 0) AS impressoes_hoje,
    CASE
        WHEN a.limite_impressoes IS NOT NULL
             AND a.impressoes >= a.limite_impressoes THEN true
        WHEN a.limite_impressoes_dia IS NOT NULL
             AND COALESCE(d.impressoes, 0) >= a.limite_impressoes_dia THEN true
        ELSE false
    END AS cota_esgotada
FROM public.anuncios a
LEFT JOIN public.anuncio_impressoes_diarias d
       ON d.anuncio_id = a.id
      AND d.dia = (now() AT TIME ZONE interval '-04:00')::date;

/* O privilegio padrao do Postgres numa view e `SELECT ... TO PUBLIC`
   (que inclui `anon`). Revogar de PUBLIC e de anon e obrigatorio. */
REVOKE ALL ON public.vw_anuncios_desempenho_publica FROM PUBLIC;
REVOKE ALL ON public.vw_anuncios_desempenho_publica FROM anon;
GRANT SELECT ON public.vw_anuncios_desempenho_publica TO authenticated;

/* ---------- 3. A view com RLS: mesma regra de privilegio ---------- */

DO $$
BEGIN
    IF to_regclass('public.vw_anuncios_desempenho') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON public.vw_anuncios_desempenho FROM PUBLIC';
        EXECUTE 'REVOKE ALL ON public.vw_anuncios_desempenho FROM anon';
        EXECUTE 'GRANT SELECT ON public.vw_anuncios_desempenho TO authenticated';
    END IF;
END;
$$;

/* ---------- 4. Quem tem conta volta a ver as noticias publicadas ---------- */

/* `CREATE POLICY` com o mesmo nome substitui a policy anterior. A
   migration 20261111225533 estreitou esta policy para `anon`
   apenas, e o efeito colateral foi que um visitante com conta e sem
   permissao de administrador passou a receber zero linhas — o site
   ficava sem noticias para ele. A leitura publica vale para os dois
   papeis; a RLS de escrita continua sendo do administrador. */
DROP POLICY IF EXISTS noticias_leitura_publica ON public.noticias;
CREATE POLICY noticias_leitura_publica
    ON public.noticias
    FOR SELECT TO anon, authenticated
    USING (publicado = true);
