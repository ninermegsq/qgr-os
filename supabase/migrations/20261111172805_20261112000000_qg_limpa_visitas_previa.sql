-- Visitas das execucoes de verificacao (Chrome headless) e de previa
-- local, registradas antes de o site estar publicado. Nao havia
-- trafego real para preservar.
--
-- Os identificadores sao os do navegador de teste. Em outro ambiente
-- eles nao existem, entao este arquivo nao apaga visita de ninguem.
DELETE FROM public.visitas
WHERE visitante_id IN (
    '75d8ddc0-e111-4891-852f-0c69a85897fc',
    'b9f76995-a6ab-4397-94d8-ec9297be4cde'
);
