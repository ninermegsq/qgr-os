/* O papel anônimo (o site) só precisa ler: sem escrita em notícias. */
REVOKE ALL ON public.noticias FROM anon;
GRANT SELECT ON public.noticias TO anon;

/* Métricas e visão de desempenho: só leitura para quem entrou com conta. */
REVOKE ALL ON public.anuncio_impressoes_diarias FROM authenticated;
GRANT SELECT ON public.anuncio_impressoes_diarias TO authenticated;

REVOKE ALL ON public.vw_anuncios_desempenho FROM authenticated;
GRANT SELECT ON public.vw_anuncios_desempenho TO authenticated;
