INSERT INTO public.cotacoes_fontes (fonte, nome, url, status, mensagem, itens, coletado_em)
SELECT * FROM jsonb_to_recordset($json$[
{"fonte":"imea","nome":"IMEA","url":"https://api1.imea.com.br/api/v2/mobile/cadeias","status":"ok","itens":86,"coletado_em":"2026-11-12T05:56:15.095Z"},
{"fonte":"grao_direto","nome":"Grão Direto","url":"https://www.graodireto.com.br/quotations/","status":"ok","itens":47,"coletado_em":"2026-11-12T05:56:15.096Z"},
{"fonte":"investing","nome":"Investing.com","url":"https://www.investing.com","status":"ok","itens":10,"coletado_em":"2026-11-12T05:56:15.096Z"}
]$json$::jsonb) AS x(fonte text, nome text, url text, status text, mensagem text, itens integer, coletado_em timestamptz);
