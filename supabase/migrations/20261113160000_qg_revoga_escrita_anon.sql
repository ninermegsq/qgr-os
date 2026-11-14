/* =====================================================================
 * Q GRAOS — o papel anon nao pode escrever em leads/visitas/administradores
 * ---------------------------------------------------------------------
 * PROBLEMA (confirmado ao vivo no banco de producao)
 *   As sondas com a chave publica do site (papel `anon`) contra o
 *   PostgREST devolveram:
 *
 *     PATCH  /rest/v1/leads?id=eq.<uuid>            -> HTTP 200 []
 *     PATCH  /rest/v1/visitas?id=eq.999999999        -> HTTP 200 []
 *     PATCH  /rest/v1/administradores?id=eq.<uuid>   -> HTTP 200 []
 *     DELETE /rest/v1/leads?id=eq.<uuid>            -> HTTP 204
 *     DELETE /rest/v1/visitas?id=eq.999999999        -> HTTP 204
 *     DELETE /rest/v1/administradores?id=eq.<uuid>   -> HTTP 204
 *
 *   HTTP 200/204 sem `42501` significa: o privilegio de tabela
 *   EXISTE para o papel `anon`. O resultado vazio vem da RLS (nao ha
 *   linha visivel para o anon), nao da falta de privilegio. As
 *   tabelas `noticias`, `anuncios`, `cotacoes`, `cotacoes_fontes` e
 *   `anuncio_impressoes_diarias` devolveram 42501 — essas foram
 *   corretamente revogadas nas migrations de privacidade.
 *
 *   De onde vem o privilegio: o Postgres, em um projeto novo,
 *   concede `ALL` nas tabelas ao papel `anon`. As migrations do
 *   projeto revogaram esse padrao em `noticias`, `anuncios`,
 *   `cotacoes`, `cotacoes_fontes` e `anuncio_impressoes_diarias`,
 *   mas esqueceram `leads`, `visitas` e `administradores`.
 *
 *   POR QUE ISSO E GRAVE
 *   A RLS dessas tres tabelas so barra o anon por enquanto. A
 *   `leads` tem RLS de escrita restrita ao administrador, a
 *   `visitas` nao tem nenhuma policy de INSERT (a escrita passa
 *   pelas funcoes SECURITY DEFINER) e a `administradores` tem
 *   policies de escrita que exigem `e_admin()`. Ate aqui o RLS
 *   segurou a linha. Mas RLS e o filtro de linhas, nao o
 *   permission check: qualquer policy malformada, um `security_
 *   definer` novo, ou um `ALTER TABLE ... DISABLE ROW LEVEL
 *   SECURITY` acidental passa a expor escrita publica. O privilegio
 *   nao deve existir para o papel anon em nenhuma tabela de dado.
 *
 * A CORRECAO
 *   REVOKE ALL ON <tabela> FROM anon nas tres tabelas, seguido do
 *   GRANT de leitura minima que o site realmente precisa:
 *
 *     leads          -> nenhuma. O lead entra pela RPC
 *                      `registrar_lead` (SECURITY DEFINER).
 *     visitas        -> nenhuma. A visita entra pela RPC
 *                      `registrar_evento` (SECURITY DEFINER).
 *     administradores -> SELECT apenas para `authenticated` (ja
 *                      estava assim). O `anon` nao precisa ler nada
 *                      de administrador.
 *
 *   Quem escreve em `leads` e `visitas` continua sendo as funcoes
 *   SECURITY DEFINER (elas rodam com o privilegio do dono da
 *   funcao, entao nao dependem do privilegio do papel anon).
 *   O painel (administrador autenticado) mantem SELECT/UPDATE/DELETE
 *   em `leads` e `visitas` como estava.
 *
 *   Nada e apagado: nenhuma linha e tocada. Nenhuma tabela perde
 *   coluna, indice ou policy.
 *
 * Idempotente: pode rodar em um banco novo ou em um banco que ja
 * tenha estas tabelas. Usa `to_regclass` para nao quebrar se a
 * tabela nao existir.
 * ===================================================================== */

DO $$
DECLARE
    v_tabela text;
    v_tabelas text[] := ARRAY['leads', 'visitas', 'administradores'];
BEGIN
    FOREACH v_tabela IN ARRAY v_tabelas LOOP
        IF to_regclass('public.' || v_tabela) IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_tabela);
            EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', v_tabela);
        END IF;
    END LOOP;
END;
$$;

/* O painel (papel `authenticated`, administrador) mantem o que tinha.
   Estas concessoes sao explicitas para nao depender do que veio do
   banco de origem: se um banco novo ja nasceu com menos privilegio,
   o painel nao quebra. */
DO $$
DECLARE
    v_tabela text;
    v_tabelas text[] := ARRAY['leads', 'visitas', 'administradores'];
BEGIN
    FOREACH v_tabela IN ARRAY v_tabelas LOOP
        IF to_regclass('public.' || v_tabela) IS NOT NULL THEN
            EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_tabela);
        END IF;
    END LOOP;
END;
$$;

/* A tabela de administradores fica restrita ao administrador logado:
   SELECT para quem tem conta, nada para o anon. */
DO $$
BEGIN
    IF to_regclass('public.administradores') IS NOT NULL THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.administradores TO authenticated';
    END IF;
END;
$$;

/* Para o painel: `leads` precisa de UPDATE e DELETE; `visitas` precisa
   de DELETE (a limpeza de dados de teste). */
DO $$
BEGIN
    IF to_regclass('public.leads') IS NOT NULL THEN
        EXECUTE 'GRANT UPDATE, DELETE ON public.leads TO authenticated';
    END IF;

    IF to_regclass('public.visitas') IS NOT NULL THEN
        EXECUTE 'GRANT DELETE ON public.visitas TO authenticated';
    END IF;
END;
$$;
