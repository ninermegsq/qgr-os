-- Limpeza final dos dados de teste que sobraram no painel:
--
-- 1. Visitas: todas as 194 linhas vieram dos navegadores de teste
--    (servidor local 127.0.0.1). Os identificadores abaixo sao fixos
--    dos navegadores headless; em outro ambiente eles nao existem,
--    entao este arquivo nao apaga visita de ninguem.
-- 2. Anuncio: o espaco "INSUMOS / EMBRAPA" (criado para validar o
--    rodizio) estava PUBLICADO e aparecia no fim das materias como
--    se fosse propaganda de cliente. A contagem diaria dele some
--    junto (FK em cascata).
--
-- Nada aqui toca em lead real, noticia real nem em visita de quem
-- usa o site de verdade.
DELETE FROM public.visitas
WHERE visitante_id IN (
    '85cdd7b3-977d-406f-b95f-62f6468053b8',
    '09e4e1f3-2b98-4695-8a39-3fcc8c3c29bf',
    'b9f76995-a6ab-4397-94d8-ec9297be4cde',
    '1154c892-e4f7-4582-83ac-379584ea07eb',
    'c7e3fa37-0b76-4731-946f-1865b8bfd16a'
);

DELETE FROM public.anuncios
WHERE id = 'fda28edf-941e-4d5a-815a-8b8994efe391';
