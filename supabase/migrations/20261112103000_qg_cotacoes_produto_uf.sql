-- =====================================================================
-- FILTRO DE PRODUTO E DE ESTADO NAS COTACOES
-- =====================================================================
-- A pagina /cotacoes.html ganhou, alem do filtro por mercado, o
-- filtro por produto (soja, milho, algodao...) e o filtro por estado
-- (MT, SP, PR...). As tres escolhas se combinam e ficam no endereco
-- (?mercado=spot&produto=soja&uf=MT).
--
-- Para isso a tabela public.cotacoes recebe duas colunas:
--
--   produto_chave -> a chave do produto: soja, milho, algodao,
--                    sorgo, farelo_soja, cafe, dolar, ibovespa,
--                    ouro, petroleo (vazio = cotacao sem produto)
--   uf            -> a sigla do estado: MT, SP, PR... (vazio =
--                    cotacao sem estado: Chicago, BM&F, B3, dolar)
--
-- A CLASSIFICACAO fica em classificacao-cotacoes.js (o site usa como
-- reserva e o coletor grava no banco). Esta migration faz o
-- preenchimento inicial das linhas que ja estavam no ar, com a mesma
-- regra: o IMEA e o indice de Mato Grosso (tudo MT); no Grao Direto
-- a praca diz o estado; bolsa, dolar e macro nao tem estado.
--
-- Nada aqui estima preco: e so classificacao de nome.
--
-- APLICADA no projeto rppoiwrbxqdbtavhgdjk em 12/11/2026: as 143
-- cotacoes publicadas ficaram classificadas (143 com produto_chave e
-- 119 com uf — as 24 de Chicago, BM&F, B3 e do dolar/macro nao tem
-- estado de proposito). O script e idempotente: pode rodar de novo
-- sem alterar o resultado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. As colunas novas
-- ---------------------------------------------------------------------
ALTER TABLE public.cotacoes ADD COLUMN IF NOT EXISTS produto_chave text;
ALTER TABLE public.cotacoes ADD COLUMN IF NOT EXISTS uf text;

COMMENT ON COLUMN public.cotacoes.produto_chave IS
    'Chave do produto para o filtro do site: soja, milho, algodao, sorgo, farelo_soja, cafe, dolar, ibovespa, ouro, petroleo. Vazio = cotacao sem produto.';

COMMENT ON COLUMN public.cotacoes.uf IS
    'Sigla do estado da cotacao (MT, SP, PR...). Vazio = cotacao sem estado (Chicago, BM&F, B3, dolar e indicadores de macro).';

-- ---------------------------------------------------------------------
-- 2. Indices do filtro
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS cotacoes_produto_chave_idx ON public.cotacoes (produto_chave);
CREATE INDEX IF NOT EXISTS cotacoes_uf_idx ON public.cotacoes (uf);

-- ---------------------------------------------------------------------
-- 3. Preenchimento das cotacoes que ja estavam no ar
-- ---------------------------------------------------------------------
-- O nome do produto e cortado no primeiro caractere que nao e letra
-- nem espaco ("Soja (Chicago)" -> "soja", "Soja · Janeiro 2027" ->
-- "soja", "Farelo de soja (Chicago)" -> "farelo de soja") e perde o
-- acento; a regiao perde o acento e vira minuscula.
WITH base AS (
    SELECT
        id,
        fonte,
        translate(
            lower(regexp_replace(coalesce(produto, ''), '[^a-zA-ZáàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ ]+.*$', '')),
            'áàâãäéèêëíìîïóòôõöúùûüçñ',
            'aaaaaeeeeiiiiooooouuuucn'
        ) AS produto_base,
        translate(
            lower(coalesce(regiao, '')),
            'áàâãäéèêëíìîïóòôõöúùûüçñ',
            'aaaaaeeeeiiiiooooouuuucn'
        ) AS regiao_base
    FROM public.cotacoes
),
classificado AS (
    SELECT
        id,
        CASE
            WHEN produto_base LIKE 'farelo de soja%' THEN 'farelo_soja'
            WHEN produto_base LIKE 'soja%' THEN 'soja'
            WHEN produto_base LIKE 'milho%' THEN 'milho'
            WHEN produto_base LIKE 'algod%' THEN 'algodao'
            WHEN produto_base LIKE 'sorgo%' THEN 'sorgo'
            WHEN produto_base LIKE 'cafe%' THEN 'cafe'
            WHEN produto_base LIKE 'dolar%' THEN 'dolar'
            WHEN produto_base LIKE 'ibovespa%' THEN 'ibovespa'
            WHEN produto_base LIKE 'ouro%' THEN 'ouro'
            WHEN produto_base LIKE 'petroleo%' THEN 'petroleo'
            ELSE NULL
        END AS produto_chave,
        CASE
            WHEN lower(fonte) = 'imea' THEN 'MT'
            WHEN regiao_base = 'campinas' THEN 'SP'
            WHEN regiao_base LIKE '%itapetininga sp%' THEN 'SP'
            WHEN regiao_base LIKE '%assis sp%' THEN 'SP'
            WHEN regiao_base LIKE '%ribeirao preto%' THEN 'SP'
            WHEN regiao_base LIKE '%baiano%' THEN 'BA'
            WHEN regiao_base LIKE '%goiano%' THEN 'GO'
            WHEN regiao_base LIKE '%mato grosso do sul%' THEN 'MS'
            WHEN regiao_base LIKE '% ms%' THEN 'MS'
            WHEN regiao_base LIKE '%minas%' THEN 'MG'
            WHEN regiao_base LIKE '%mineiro%' THEN 'MG'
            WHEN regiao_base LIKE '%paranaense%' THEN 'PR'
            WHEN regiao_base LIKE '%rio-grandense%' THEN 'RS'
            WHEN regiao_base LIKE '%mato-grossense%' THEN 'MT'
            WHEN regiao_base = 'nordeste mt' THEN 'MT'
            WHEN regiao_base = 'sudeste mt' THEN 'MT'
            ELSE NULL
        END AS uf
    FROM base
)
UPDATE public.cotacoes
SET produto_chave = classificado.produto_chave,
    uf = classificado.uf
FROM classificado
WHERE classificado.id = public.cotacoes.id;
