/* =====================================================================
 * Q GRAOS — o dia da cota diaria de anuncios e o dia do site
 * ---------------------------------------------------------------------
 * PROBLEMA
 *   O site trabalha no fuso de Mato Grosso (UTC-4). A cota diaria de
 *   impressoes, porem, era contada no dia UTC do Postgres
 *   (current_date). Entre 20h e 00h (horario de Brasilia) o dia do
 *   banco ja virou, mas o dia do site ainda nao: a cota reinicia
 *   4 horas antes do que o anunciante espera, e o painel mostra
 *   "impressoes de hoje" de um dia que o visitante ainda considera
 *   o dia anterior.
 *
 * COMO O DIA DO SITE E CALCULADO
 *   O site usa FUSO_QG = -4 (script.js e noticia.js):
 *       new Date(Date.now() + FUSO_QG).toISOString().slice(0, 10)
 *   isto e: a data UTC com 4 horas subtracted.
 *
 * REGRA NO BANCO
 *   (now() AT TIME ZONE 'America/Mato_Grosso')::date
 *   O Postgres conhece o fuso do site: 'America/Mato_Grosso' e
 *   UTC-4 o ano inteiro (o Brasil nao aplica horario de verao desde
 *   2019). Nao usamos 'America/Sao_Paulo', que e UTC-3 no horario de
 *   verao e trocaria o dia no meio da noite.
 *
 * ONDE O DIA E USADO
 *   1. anuncios_elegiveis: a cota diaria decide se o anuncio ainda
 *      entra no rodizio.
 *   2. registrar_impressao_anuncio: a impressao e contada no dia do
 *      site.
 *   3. vw_anuncios_desempenho: o painel mostra "hoje" e a cota
 *      restante do mesmo dia.
 *
 * A coluna public.anuncio_impressoes_diarias.dia guarda o dia no
 * fuso do site. As linhas antigas (gravadas em UTC) continuam valendo
 * como historico: na virada do fuso elas apenas param de contar para
 * a cota do dia corrente, porque o dia gravado e diferente do dia
 * de agora. Nenhum preco, cota ou contador e apagado.
 *
 * A view e recriada com as MESMAS colunas e os mesmos nomes da
 * versao anterior (o painel le exatamente estes campos), trocando
 * apenas a expressao do dia.
 *
 * Idempotente: pode rodar em um banco novo ou em um banco que ja
 * tenha estas funcoes.
 * ===================================================================== */

DROP FUNCTION IF EXISTS public.anuncios_elegiveis(text, text);

CREATE FUNCTION public.anuncios_elegiveis(p_posicao text, p_formato text)
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
    inicio_em timestamptz,
    fim_em timestamptz,
    criado_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT a.id, a.titulo, a.empresa, a.texto, a.url, a.imagem_url, a.posicao, a.formato,
           a.publicado, a.prioridade, a.peso, a.inicio_em, a.fim_em, a.criado_em
    FROM public.anuncios a
    LEFT JOIN public.anuncio_impressoes_diarias d
           ON d.anuncio_id = a.id
          AND d.dia = (now() AT TIME ZONE 'America/Mato_Grosso')::date
    WHERE a.publicado = true
      AND a.posicao = p_posicao
      AND (p_formato IS NULL OR a.formato = p_formato)
      AND (a.inicio_em IS NULL OR a.inicio_em <= now())
      AND (a.fim_em IS NULL OR a.fim_em >= now())
      AND (a.limite_impressoes IS NULL OR a.impressoes < a.limite_impressoes)
      AND (a.limite_impressoes_dia IS NULL OR COALESCE(d.impressoes, 0) < a.limite_impressoes_dia)
    ORDER BY a.prioridade DESC, a.criado_em DESC;
$$;

GRANT EXECUTE ON FUNCTION public.anuncios_elegiveis(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_impressao_anuncio(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dia date := (now() AT TIME ZONE 'America/Mato_Grosso')::date;
BEGIN
    UPDATE public.anuncios
    SET impressoes = impressoes + 1
    WHERE id = p_id
      AND publicado = true;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    INSERT INTO public.anuncio_impressoes_diarias (anuncio_id, dia, impressoes)
    VALUES (p_id, v_dia, 1)
    ON CONFLICT (anuncio_id, dia)
    DO UPDATE SET impressoes = public.anuncio_impressoes_diarias.impressoes + 1,
                  atualizado_em = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_impressao_anuncio(uuid) TO anon, authenticated;

CREATE OR REPLACE VIEW public.vw_anuncios_desempenho
WITH (security_invoker = true)
AS
SELECT
    a.id,
    a.empresa,
    a.titulo,
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
    a.autorizacao,
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
      AND d.dia = (now() AT TIME ZONE 'America/Mato_Grosso')::date;

GRANT SELECT ON public.vw_anuncios_desempenho TO authenticated;

/* ---------- 4. O painel ja nao le a view crua: a visao publica ---------- */
/* A tabela public.anuncios tem RLS: quem nao e administrador nao ve
   a linha. A view com security_invoker=TRUE herda essa regra, entao
   um usuario com conta e sem permissao de admin receberia zero linhas
   (e o painel cairia no fallback, que le a tabela direto e devolve
   tambem zero). Esta visao e a versao "sem RLS" do mesmorelatorio:
   quem tem conta ve os anuncios de todos, e o proprio RLS da tabela
   continua valendo para quem so tem a chave anonima (anon nao tem
   conta: ve apenas o que esta publicado).
   O painel escolhe a visao primeiro e so cai para a tabela se a visao
   falhar, entao o comportamento so muda no caminho feliz. */
DROP VIEW IF EXISTS public.vw_anuncios_desempenho_publica;

CREATE VIEW public.vw_anuncios_desempenho_publica
AS
SELECT
    a.id,
    a.empresa,
    a.titulo,
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
    a.autorizacao,
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
      AND d.dia = (now() AT TIME ZONE 'America/Mato_Grosso')::date;

GRANT SELECT ON public.vw_anuncios_desempenho_publica TO authenticated;
