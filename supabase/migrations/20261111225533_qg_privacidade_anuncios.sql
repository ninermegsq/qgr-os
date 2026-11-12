/* ---------- 1. A tabela de anúncios: o público lê só o anúncio ---------- */

REVOKE ALL ON public.anuncios FROM anon;

GRANT SELECT (
    id, titulo, empresa, texto, url, imagem_url,
    posicao, formato, publicado, prioridade, peso,
    inicio_em, fim_em, criado_em
) ON public.anuncios TO anon;

GRANT ALL ON public.anuncios TO authenticated;

/* ---------- 2. A contagem diária é dado do painel ---------- */

REVOKE ALL ON public.anuncio_impressoes_diarias FROM anon;
GRANT SELECT ON public.anuncio_impressoes_diarias TO authenticated;

/* ---------- 3. A view de desempenho é do painel ---------- */

REVOKE ALL ON public.vw_anuncios_desempenho FROM anon;
GRANT SELECT ON public.vw_anuncios_desempenho TO authenticated;

/* ---------- 4. A função de elegibilidade não entrega o contato ---------- */

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
           ON d.anuncio_id = a.id AND d.dia = current_date
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

/* ---------- 5. A leitura pública é do visitante anônimo ---------- */

DROP POLICY IF EXISTS anuncios_leitura_publica ON public.anuncios;
CREATE POLICY anuncios_leitura_publica
    ON public.anuncios
    FOR SELECT TO anon
    USING (publicado = true);

DROP POLICY IF EXISTS noticias_leitura_publica ON public.noticias;
CREATE POLICY noticias_leitura_publica
    ON public.noticias
    FOR SELECT TO anon
    USING (publicado = true);
