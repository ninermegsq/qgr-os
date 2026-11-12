ALTER TABLE public.noticias ADD COLUMN IF NOT EXISTS conteudo text;

UPDATE public.noticias
   SET conteudo = btrim(resumo)
 WHERE char_length(resumo) > 320
   AND coalesce(btrim(conteudo), '') = '';

UPDATE public.noticias
   SET resumo = left(btrim(regexp_replace(left(btrim(resumo), 320), '\s+\S*$', '')), 320)
 WHERE char_length(resumo) > 320;

ALTER TABLE public.noticias DROP CONSTRAINT IF EXISTS noticias_resumo_tamanho_check;
ALTER TABLE public.noticias ADD CONSTRAINT noticias_resumo_tamanho_check
    CHECK (resumo IS NULL OR char_length(resumo) <= 320);

CREATE TABLE IF NOT EXISTS public.anuncios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo text NOT NULL,
    empresa text NOT NULL,
    texto text,
    url text,
    imagem_url text,
    posicao text NOT NULL DEFAULT 'noticias',
    formato text NOT NULL DEFAULT 'faixa',
    publicado boolean NOT NULL DEFAULT false,
    prioridade integer NOT NULL DEFAULT 0,
    impressoes integer NOT NULL DEFAULT 0,
    cliques integer NOT NULL DEFAULT 0,
    autorizacao text,
    inicio_em timestamptz,
    fim_em timestamptz,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT anuncios_titulo_check CHECK (char_length(titulo) BETWEEN 3 AND 160),
    CONSTRAINT anuncios_empresa_check CHECK (char_length(empresa) BETWEEN 2 AND 120),
    CONSTRAINT anuncios_posicao_check CHECK (posicao IN ('noticias', 'noticia')),
    CONSTRAINT anuncios_formato_check CHECK (formato IN ('faixa', 'card'))
);

CREATE INDEX IF NOT EXISTS anuncios_publicados_idx
    ON public.anuncios (publicado, posicao, prioridade DESC);

ALTER TABLE public.anuncios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anuncios_leitura_publica ON public.anuncios;
DROP POLICY IF EXISTS anuncios_insercao_admin ON public.anuncios;
DROP POLICY IF EXISTS anuncios_atualizacao_admin ON public.anuncios;
DROP POLICY IF EXISTS anuncios_exclusao_admin ON public.anuncios;

CREATE POLICY anuncios_leitura_publica ON public.anuncios
    FOR SELECT TO anon, authenticated
    USING (publicado = true);

CREATE POLICY anuncios_insercao_admin ON public.anuncios
    FOR INSERT TO authenticated
    WITH CHECK (public.e_admin());

CREATE POLICY anuncios_atualizacao_admin ON public.anuncios
    FOR UPDATE TO authenticated
    USING (public.e_admin())
    WITH CHECK (public.e_admin());

CREATE POLICY anuncios_exclusao_admin ON public.anuncios
    FOR DELETE TO authenticated
    USING (public.e_admin());

GRANT SELECT ON public.anuncios TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.anuncios TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.atualizado_em := now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER anuncios_atualizado_em
BEFORE UPDATE ON public.anuncios
FOR EACH ROW EXECUTE FUNCTION public.tg_atualizado_em();

CREATE OR REPLACE FUNCTION public.registrar_impressao_anuncio(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.anuncios
    SET impressoes = impressoes + 1
    WHERE id = p_id
      AND publicado = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_impressao_anuncio(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.clicar_anuncio(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.anuncios
    SET cliques = cliques + 1
    WHERE id = p_id
      AND publicado = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clicar_anuncio(uuid) TO anon, authenticated;
