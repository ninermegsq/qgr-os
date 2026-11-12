-- Limpeza das visitas de teste que sobraram no painel depois das execucoes
-- de verificacao visual: sao as linhas cujo "referrer" aponta para o
-- servidor local (127.0.0.1), ou seja, o navegador de teste.
-- Visitas de quem usa o site de verdade (referrer externo) ficam intactas.
DELETE FROM public.visitas
WHERE referrer LIKE '%127.0.0.1%';
