/* =====================================================================
 * Q GRAOS — o grafico do painel agrupa pelo dia do site
 * ---------------------------------------------------------------------
 * PROBLEMA
 *   As vistas `vw_leads_por_dia` e `vw_visitas_por_dia` agrupavam
 *   com `date_trunc('day', criado_em)::date`, que e o dia **UTC** do
 *   Postgres. O site (e o painel) trabalham no dia de Mato Grosso
 *   (UTC-4). Entre 20h e 00h (horario de Brasilia) as visitas do
 *   fim da tarde caem no dia seguinte do grafico: o painel marcava
 *   "hoje" como um dia sem movimento e empurrava as visitas para o
 *   dia seguinte.
 *
 *   Confirmado no banco: com as visitas reais do projeto, a vista
 *   devolvia 11 pageviews em "2026-11-12" e 3 em "2026-11-13",
 *   quando as visitas de 13/11 (pela manha) sao do dia 13 no site e
 *   as da noite de 12/11 tambem.
 *
 * A CORRECAO
 *   `(criado_em AT TIME ZONE interval '-04:00')::date` devolve o
 *   dia no fuso do site. E a mesma regra usada pela migration da
 *   cota diaria de anuncios (20261113120000).
 *
 *   As views sao recriadas com as MESMAS colunas e os mesmos nomes
 *   (o painel le exatamente estes campos) e a MESMA janela de 90
 *   dias. Nenhum dado e apagado.
 *
 *   O REVOKE de PUBLIC e de anon e OBRIGATORIO aqui: o Postgres da
 *   a view o privilegio padrao "SELECT ... TO PUBLIC" — e o `GRANT`
 *   abaixo SOMA o privilegio do administrador, nao o substitui.
 *   Sem o revoke, a chave publica do site (papel anon) volta a ler
 *   as duas vistas do painel. A migration 20261113140000 ja revoga
 *   essas duas views, e recriar a view aqui nao desfaz a revogacao;
 *   o revoke fica explicito para que o resultado nao dependa da
 *   ordem em que as migrations rodaram.
 *
 * Idempotente: pode rodar em um banco novo ou em um banco que ja
 * tenha estas vistas.
 * ===================================================================== */

CREATE OR REPLACE VIEW public.vw_leads_por_dia WITH (security_invoker = true) AS
SELECT (criado_em AT TIME ZONE interval '-04:00')::date AS dia,
       count(*)::int AS leads
FROM public.leads
WHERE criado_em > now() - interval '90 days'
GROUP BY 1
ORDER BY 1;

GRANT SELECT ON public.vw_leads_por_dia TO authenticated;

REVOKE ALL ON public.vw_leads_por_dia FROM PUBLIC;
REVOKE ALL ON public.vw_leads_por_dia FROM anon;

CREATE OR REPLACE VIEW public.vw_visitas_por_dia WITH (security_invoker = true) AS
SELECT (criado_em AT TIME ZONE interval '-04:00')::date AS dia,
       count(*) FILTER (WHERE tipo = 'pageview')::int AS pageviews,
       count(*)::int AS eventos
FROM public.visitas
WHERE criado_em > now() - interval '90 days'
GROUP BY 1
ORDER BY 1;

GRANT SELECT ON public.vw_visitas_por_dia TO authenticated;

REVOKE ALL ON public.vw_visitas_por_dia FROM PUBLIC;
REVOKE ALL ON public.vw_visitas_por_dia FROM anon;
