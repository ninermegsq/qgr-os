-- =====================================================================
-- AREA DE COTACOES (IMEA + Grao Direto + Investing.com)
-- =====================================================================
-- O site continua estatico: a pagina /cotacoes.html le a tabela
-- public.cotacoes pela chave publica (RLS), e um coletor no servidor
-- busca as cotações nas três fontes e grava aqui.
--
--   public.cotacoes        -> as cotacoes (preco, variacao, unidade,
--                              produto, regiao, fonte, atualizado_em)
--   public.cotacoes_fontes -> o estado de cada fonte (ok/erro/pendente),
--                              visivel SO no painel
--
-- O publico le somente as linhas publicadas de public.cotacoes.
-- A escrita e sempre do coletor (ou do painel), com conta de admin.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. As cotacoes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cotacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fonte text NOT NULL,
    mercado text NOT NULL,
    simbolo text NOT NULL,
    produto text NOT NULL,
    regiao text,
    preco numeric(14, 4),
    preco_max numeric(14, 4),
    preco_min numeric(14, 4),
    variacao numeric(12, 4),
    variacao_abs numeric(14, 4),
    unidade text,
    referencia text,
    publicado boolean NOT NULL DEFAULT true,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cotacoes_fonte_simbolo_unico UNIQUE (fonte, simbolo),
    CONSTRAINT cotacoes_fonte_check CHECK (fonte IN ('imea', 'grao_direto', 'investing')),
    CONSTRAINT cotacoes_mercado_check CHECK (mercado IN ('spot', 'regional', 'futuros', 'b3', 'fx', 'macro')),
    CONSTRAINT cotacoes_preco_check CHECK (preco IS NULL OR preco >= 0),
    CONSTRAINT cotacoes_publicado_check CHECK (publicado IN (true, false))
);

COMMENT ON TABLE public.cotacoes IS
    'Cotacoes de graos e indicadores de mercado coletadas do IMEA, do Grao Direto e do Investing.com.';

COMMENT ON COLUMN public.cotacoes.fonte IS
    'Origem da cotacao: imea, grao_direto ou investing.';

COMMENT ON COLUMN public.cotacoes.mercado IS
    'Mercado: spot, regional, futuros, b3, fx ou macro.';

COMMENT ON COLUMN public.cotacoes.simbolo IS
    'Identificador da cotacao na fonte (ex.: soj_mt, ZS, USD/BRL).';

-- ---------------------------------------------------------------------
-- 2. O estado das fontes (painel)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cotacoes_fontes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fonte text NOT NULL,
    nome text NOT NULL,
    url text,
    status text NOT NULL DEFAULT 'pendente',
    mensagem text,
    itens integer NOT NULL DEFAULT 0,
    coletado_em timestamptz,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cotacoes_fontes_fonte_unico UNIQUE (fonte),
    CONSTRAINT cotacoes_fontes_status_check CHECK (status IN ('ok', 'erro', 'pendente')),
    CONSTRAINT cotacoes_fontes_itens_check CHECK (itens >= 0)
);

COMMENT ON TABLE public.cotacoes_fontes IS
    'Estado de cada fonte de cotacoes: ok, erro ou pendente. Visivel apenas no painel.';

-- ---------------------------------------------------------------------
-- 3. Indices
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS cotacoes_mercado_idx ON public.cotacoes (mercado);
CREATE INDEX IF NOT EXISTS cotacoes_fonte_idx ON public.cotacoes (fonte);
CREATE INDEX IF NOT EXISTS cotacoes_publicado_idx ON public.cotacoes (publicado);
CREATE INDEX IF NOT EXISTS cotacoes_atualizado_em_idx ON public.cotacoes (atualizado_em DESC);

-- ---------------------------------------------------------------------
-- 4. "atualizado_em" automatico
-- ---------------------------------------------------------------------
CREATE OR REPLACE TRIGGER cotacoes_atualizado_em
BEFORE UPDATE ON public.cotacoes
FOR EACH ROW EXECUTE FUNCTION public.tg_atualizado_em();

CREATE OR REPLACE TRIGGER cotacoes_fontes_atualizado_em
BEFORE UPDATE ON public.cotacoes_fontes
FOR EACH ROW EXECUTE FUNCTION public.tg_atualizado_em();

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.cotacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacoes_fontes ENABLE ROW LEVEL SECURITY;

-- O publico le SOMENTE as cotacoes publicadas.
DROP POLICY IF EXISTS cotacoes_leitura_publica ON public.cotacoes;
CREATE POLICY cotacoes_leitura_publica
ON public.cotacoes FOR SELECT
TO anon, authenticated
USING (publicado = true);

-- O painel (e o coletor) enxerga tudo e pode escrever.
DROP POLICY IF EXISTS cotacoes_leitura_admin ON public.cotacoes;
CREATE POLICY cotacoes_leitura_admin
ON public.cotacoes FOR SELECT
TO authenticated
USING (public.e_admin());

DROP POLICY IF EXISTS cotacoes_escrita_admin ON public.cotacoes;
CREATE POLICY cotacoes_escrita_admin
ON public.cotacoes FOR INSERT
TO authenticated
WITH CHECK (public.e_admin());

DROP POLICY IF EXISTS cotacoes_atualizacao_admin ON public.cotacoes;
CREATE POLICY cotacoes_atualizacao_admin
ON public.cotacoes FOR UPDATE
TO authenticated
USING (public.e_admin())
WITH CHECK (public.e_admin());

DROP POLICY IF EXISTS cotacoes_exclusao_admin ON public.cotacoes;
CREATE POLICY cotacoes_exclusao_admin
ON public.cotacoes FOR DELETE
TO authenticated
USING (public.e_admin());

-- O estado das fontes e interno: NINGUEM anon le, nem autenticado sem
-- ser administrador.
DROP POLICY IF EXISTS cotacoes_fontes_leitura_admin ON public.cotacoes_fontes;
CREATE POLICY cotacoes_fontes_leitura_admin
ON public.cotacoes_fontes FOR SELECT
TO authenticated
USING (public.e_admin());

DROP POLICY IF EXISTS cotacoes_fontes_escrita_admin ON public.cotacoes_fontes;
CREATE POLICY cotacoes_fontes_escrita_admin
ON public.cotacoes_fontes FOR INSERT
TO authenticated
WITH CHECK (public.e_admin());

DROP POLICY IF EXISTS cotacoes_fontes_atualizacao_admin ON public.cotacoes_fontes;
CREATE POLICY cotacoes_fontes_atualizacao_admin
ON public.cotacoes_fontes FOR UPDATE
TO authenticated
USING (public.e_admin())
WITH CHECK (public.e_admin());

DROP POLICY IF EXISTS cotacoes_fontes_exclusao_admin ON public.cotacoes_fontes;
CREATE POLICY cotacoes_fontes_exclusao_admin
ON public.cotacoes_fontes FOR DELETE
TO authenticated
USING (public.e_admin());

-- ---------------------------------------------------------------------
-- 6. Permissoes
-- ---------------------------------------------------------------------
GRANT SELECT ON public.cotacoes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cotacoes TO authenticated;

GRANT SELECT ON public.cotacoes_fontes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cotacoes_fontes TO authenticated;

REVOKE ALL ON public.cotacoes_fontes FROM anon;

-- O papel anon NAO pode escrever cotacao: quem publica e o coletor
-- (ou o painel), sempre com conta de administrador.
REVOKE INSERT, UPDATE, DELETE ON public.cotacoes FROM anon;
