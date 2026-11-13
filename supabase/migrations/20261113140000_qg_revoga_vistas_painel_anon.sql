/* =====================================================================
 * Q GRAOS — as vistas do painel nao podem ser lidas pelo papel anon
 * ---------------------------------------------------------------------
 * PROBLEMA
 *   As quatro vistas do painel (vw_painel_resumo, vw_leads_por_dia,
 *   vw_visitas_por_dia, vw_visitas_por_tipo) foram criadas com
 *   `security_invoker = true`, o que e correto: a RLS das tabelas
 *   continua valendo. Porem, elas receberam apenas
 *   `GRANT SELECT ... TO authenticated`.
 *
 *   No Postgres, uma view recebe por padrao o privilegio
 *   `SELECT ... TO PUBLIC` (a.role_public). O `GRANT ... TO
 *   authenticated` **soma** um privilegio, nao substitui o
 *   padrao. Como `PUBLIC` inclui o papel `anon`, a chave publica do
 *   site conseguia ler as quatro vistas.
 *
 * COMO ISSO FOI CONFIRMADO
 *   Pedido com a chave publica (papel anon) para vw_painel_resumo
 *   devolveu HTTP 200 com os numeros reais do painel
 *   (noticias_publicadas, total_pageviews, visitantes, leads).
 *   As tabelas por tras (leads, visitas) devolvem [] para o anon,
 *   ou seja, a RLS esta certa: o vazamento vem do privilegio
 *   PADRAO da view, nao da RLS.
 *
 *   Isso importa: vw_leads_por_dia, vw_visitas_por_dia e
 *   vw_visitas_por_tipo nao devolvem linhas para o anon (a RLS filtra
 *   tudo), mas devolvem HTTP 200 e [] — a view continua sendo
 *   consultavel. E vw_painel_resumo devolve numeros agregados que
 *   nao dependem de linha visivel (por exemplo, a contagem de
 *   noticias publicadas, que o anon pode ler de qualquer jeito).
 *
 * A CORRECAO
 *   REVOKE ALL ... FROM anon nas quatro vistas. E preciso tambem
 *   revogar de PUBLIC, porque o privilegio padrao do Postgres e
 *   esse: sem `REVOKE ... FROM PUBLIC`, o `anon` volta a ler.
 *
 *   A RLS continua valendo para quem entra com conta: quem nao e
 *   administrador ve zero linhas (e nao ve os numeros agregados),
 *   exatamente como antes. O painel (administrador) continua lendo
 *   as quatro vistas sem mudanca.
 *
 * Idempotente: pode rodar em um banco novo ou em um banco que ja
 * tenha estas vistas.
 * ===================================================================== */

/* O privilegio padrao do Postgres vem de PUBLIC. Revogar de anon
   sozinho nao resolve: e preciso revogar de PUBLIC. */
REVOKE ALL ON public.vw_painel_resumo FROM PUBLIC;
REVOKE ALL ON public.vw_painel_resumo FROM anon;
GRANT SELECT ON public.vw_painel_resumo TO authenticated;

REVOKE ALL ON public.vw_leads_por_dia FROM PUBLIC;
REVOKE ALL ON public.vw_leads_por_dia FROM anon;
GRANT SELECT ON public.vw_leads_por_dia TO authenticated;

REVOKE ALL ON public.vw_visitas_por_dia FROM PUBLIC;
REVOKE ALL ON public.vw_visitas_por_dia FROM anon;
GRANT SELECT ON public.vw_visitas_por_dia TO authenticated;

REVOKE ALL ON public.vw_visitas_por_tipo FROM PUBLIC;
REVOKE ALL ON public.vw_visitas_por_tipo FROM anon;
GRANT SELECT ON public.vw_visitas_por_tipo TO authenticated;

/* A mesma regra vale para a view de anuncios criada na migration do
   dia da cota: ela foi criada sem `security_invoker` (precisa ler a
   tabela anuncios sem RLS), entao o privilegio padrao do Postgres
   a entregaria ao papel anon. A tabela anuncios, porem, tem
   `REVOKE ALL ... FROM anon` e uma politica de leitura publica que
   so mostra as colunas publicas; a view publica do painel, por
   sua vez, mostra a coluna `autorizacao` (o contato do anunciante).
   Por isso a view publica e do painel e do administrador. */
REVOKE ALL ON public.vw_anuncios_desempenho_publica FROM PUBLIC;
REVOKE ALL ON public.vw_anuncios_desempenho_publica FROM anon;
GRANT SELECT ON public.vw_anuncios_desempenho_publica TO authenticated;

REVOKE ALL ON public.vw_anuncios_desempenho FROM PUBLIC;
REVOKE ALL ON public.vw_anuncios_desempenho FROM anon;
GRANT SELECT ON public.vw_anuncios_desempenho TO authenticated;
