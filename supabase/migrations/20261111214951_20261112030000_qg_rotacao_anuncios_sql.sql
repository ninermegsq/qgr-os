/* =====================================================================
 * Q GRAOS — rotação de anúncios: peso, cotas e contagem diária
 * =====================================================================
 * O que muda em relação ao modelo anterior:
 *
 *   - "prioridade" deixa de ser a chave de exibição. Antes ela
 *     mandava no `order by` e o primeiro da lista levava 100% das
 *     exibições. Agora ela é só a ordem preferencial dentro do ciclo
 *     de rodízio (nenhum anunciante fica travado no topo);
 *
 *   - cada anúncio ganha "peso" (participação no rodízio) e duas
 *     cotas opcionais: total e por dia;
 *
 *   - as impressões passam a ser contadas por dia, para que a cota
 *     diária seja um número real e não uma promessa de papel.
 *
 * Nada aqui muda o que o visitante vê: os dados existentes continuam
 * válidos (peso 1 = participação igual à de antes).
 * ===================================================================== */

ALTER TABLE public.anuncios ADD COLUMN IF NOT EXISTS peso integer NOT NULL DEFAULT 1;
ALTER TABLE public.anuncios ADD COLUMN IF NOT EXISTS limite_impressoes integer;
ALTER TABLE public.anuncios ADD COLUMN IF NOT EXISTS limite_impressoes_dia integer;

ALTER TABLE public.anuncios DROP CONSTRAINT IF EXISTS anuncios_peso_check;
ALTER TABLE public.anuncios ADD CONSTRAINT anuncios_peso_check
    CHECK (peso BETWEEN 1 AND 10);

ALTER TABLE public.anuncios DROP CONSTRAINT IF EXISTS anuncios_limite_impressoes_check;
ALTER TABLE public.anuncios ADD CONSTRAINT anuncios_limite_impressoes_check
    CHECK (limite_impressoes IS NULL OR limite_impressoes >= 0);

ALTER TABLE public.anuncios DROP CONSTRAINT IF EXISTS anuncios_limite_impressoes_dia_check;
ALTER TABLE public.anuncios ADD CONSTRAINT anuncios_limite_impressoes_dia_check
    CHECK (limite_impressoes_dia IS NULL OR limite_impressoes_dia >= 0);

/* Índice do rodízio: posição + formato + prioridade. */
CREATE INDEX IF NOT EXISTS anuncios_rotacao_idx
    ON public.anuncios (publicado, posicao, formato, prioridade DESC);

/* Contagem de impressões por dia (base das cotas diárias). */
CREATE TABLE IF NOT EXISTS public.anuncio_impressoes_diarias (
    anuncio_id uuid NOT NULL REFERENCES public.anuncios(id) ON DELETE CASCADE,
    dia date NOT NULL,
    impressoes integer NOT NULL DEFAULT 0,
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (anuncio_id, dia)
);

CREATE INDEX IF NOT EXISTS anuncio_impressoes_diarias_dia_idx
    ON public.anuncio_impressoes_diarias (dia);

ALTER TABLE public.anuncio_impressoes_diarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anuncio_impressoes_diarias_leitura_admin ON public.anuncio_impressoes_diarias;
CREATE POLICY anuncio_impressoes_diarias_leitura_admin
    ON public.anuncio_impressoes_diarias
    FOR SELECT TO authenticated
    USING (public.e_admin());

/* A escrita acontece só dentro das funções SECURITY DEFINER. */
GRANT SELECT ON public.anuncio_impressoes_diarias TO authenticated;
