-- Migration original: inseria uma noticia temporaria para validar a
-- renderizacao dos cards no site e a aba "Noticias" do painel.
-- Reescrita para ser inofensiva em qualquer ambiente: em vez de inserir
-- a noticia de teste, ela remove a noticia de teste (idempotente).
DELETE FROM public.noticias WHERE fonte = 'Q GRÃOS — teste interno';
