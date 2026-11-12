/* =====================================================================
 * Q GRAOS — funções, políticas e visão do painel para a rotação
 * =====================================================================
 * 1. anuncios_elegiveis: o banco decide quem pode aparecer agora
 *    (publicado, dentro do prazo, com cota disponível);
 * 2. registrar_impressao_anuncio: passa a contar também o dia;
 * 3. anuncios_leitura_admin / noticias_leitura_admin: o painel volta a
 *    enxergar o que está pausado (sem isso, "Pausar" fazia a linha
 *    sumir da tabela do painel);
 * 4. vw_anuncios_desempenho: o painel lê o desempenho (impressões de
 *    hoje, cota restante, CTR) em uma consulta só.
 * ===================================================================== */

/* ---------- 1. Quem pode aparecer agora ---------- */

CREATE OR REPLACE FUNCTION public.anuncios_elegiveis(p_posicao text, p_formato text)
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
    autorizacao text,
    inicio_em timestamptz,
    fim_em timestamptz,
    criado_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
        a.autorizacao,
        a.inicio_em,
        a.fim_em,
        a.criado_em
    FROM public.anuncios a
    LEFT JOIN public.anuncio_impressoes_diarias d
           ON d.anuncio_id = a.id
          AND d.dia = current_date
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

/* ---------- 2. Impressão com contagem do dia ---------- */

CREATE OR REPLACE FUNCTION public.registrar_impressao_anuncio(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dia date := current_date;
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

/* ---------- 3. Leitura do painel ---------- */

/* Sem esta política o painel só enxergava o que estava publicado:
   ao pausar um anúncio, a linha sumia da tabela e não dava para
   editar nem reativar. */
DROP POLICY IF EXISTS anuncios_leitura_admin ON public.anuncios;
CREATE POLICY anuncios_leitura_admin
    ON public.anuncios
    FOR SELECT TO authenticated
    USING (public.e_admin());

/* O mesmo problema acontecia com as notícias pausadas. */
DROP POLICY IF EXISTS noticias_leitura_admin ON public.noticias;
CREATE POLICY noticias_leitura_admin
    ON public.noticias
    FOR SELECT TO authenticated
    USING (public.e_admin());

/* ---------- 4. Desempenho dos anúncios (painel) ---------- */

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
      AND d.dia = current_date;

GRANT SELECT ON public.vw_anuncios_desempenho TO authenticated;
