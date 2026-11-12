ALTER TABLE public.noticias ADD COLUMN IF NOT EXISTS visualizacoes integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.registrar_visualizacao_noticia(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.noticias
    SET visualizacoes = visualizacoes + 1
    WHERE id = p_id
      AND publicado = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_visualizacao_noticia(uuid) TO anon, authenticated;
