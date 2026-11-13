// =====================================================================
// Q GRAOS — Edge Function "noticias"
// ---------------------------------------------------------------------
// Serve o feed público de notícias do agronegócio.
//
// Por que existe: a seção de notícias do site é alimentada por ela.
// A função roda no servidor (sem CORS para o navegador, sem expor a
// service role key no site) e devolve o JSON já normalizado.
//
// Uso:
//   GET /functions/v1/noticias?limite=6&categoria=Soja
//   GET /functions/v1/noticias?categoria=Soja,Milho&limite=9
//   GET /functions/v1/noticias?id=<uuid>&completa=1   (materia completa)
//
// Resposta:
//   { "noticias": [ ... ], "total": 3, "gerado_em": "2026-01-01T00:00:00Z" }
//
// Variáveis de ambiente (já existem no projeto Supabase):
//   SUPABASE_URL       -> URL do projeto
//   SUPABASE_ANON_KEY  -> chave pública (a RLS garante que só sai
//                         o que está publicado)
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CATEGORIAS = [
  "Soja",
  "Milho",
  "Sorgo",
  "Milheto",
  "Feijao",
  "Gergelim",
  "Safra",
  "Logistica",
  "Mercado",
  "Exportacao",
  "Geral",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache,
    },
  });
}

// Converte para texto plano. Não escapamos HTML aqui: a resposta é JSON
// e quem consome insere o conteúdo com textContent, nunca com innerHTML.
function texto(valor: unknown): string {
  return String(valor ?? "");
}

serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (request.method !== "GET") {
    return json({ erro: "metodo_nao_permitido" }, 405);
  }

  const url = new URL(request.url);
  const limiteBruto = Number.parseInt(url.searchParams.get("limite") ?? "6", 10);
  const limite = Number.isFinite(limiteBruto)
    ? Math.min(Math.max(limiteBruto, 1), 50)
    : 6;

  const categoriaParam = url.searchParams.get("categoria");
  // Aceita uma ou varias categorias: "Soja" ou "Soja,Milho".
  const categorias = categoriaParam
    ? categoriaParam
        .split(",")
        .map((valor) => valor.trim())
        .filter((valor) => CATEGORIAS.includes(valor))
        .filter((valor, indice, lista) => lista.indexOf(valor) === indice)
    : [];

  // "completa=1" devolve tambem o texto integral da materia (noticia.html).
  const completaParam = url.searchParams.get("completa");
  const incluirConteudo = completaParam === "1" || completaParam === "true";

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !anonKey) {
    return json(
      {
        erro: "supabase_nao_configurado",
        mensagem:
          "Defina SUPABASE_URL e SUPABASE_ANON_KEY nas secrets da Edge Function.",
      },
      500,
    );
  }

  const campos = [
    "id",
    "titulo",
    "resumo",
    "categoria",
    "fonte",
    "url",
    "imagem_url",
    "publicado_em",
    "destaque",
    "cliques",
  ];

  if (incluirConteudo) campos.push("conteudo");

  const filtros = [
    "publicado=eq.true",
    `select=${campos.join(",")}`,
    // O id no fim da ordenacao e o desempate: duas noticias publicadas
    // no mesmo instante nao podem trocar de lugar entre duas chamadas
    // (o site usa a mesma ordem).
    "order=destaque.desc,publicado_em.desc,id.desc",
    `limit=${limite}`,
  ];

  if (categorias.length === 1) {
    filtros.push(`categoria=eq.${encodeURIComponent(categorias[0])}`);
  } else if (categorias.length > 1) {
    const alternativas = categorias
      .map((valor) => `categoria.eq.${encodeURIComponent(valor)}`)
      .join(",");
    filtros.push(`or=(${alternativas})`);
  }

  const resposta = await fetch(
    `${supabaseUrl}/rest/v1/noticias?${filtros.join("&")}`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    },
  );

  if (!resposta.ok) {
    const detalhe = await resposta.text();
    return json(
      { erro: "falha_na_consulta", detalhe: detalhe.slice(0, 500) },
      502,
    );
  }

  const linhas = (await resposta.json()) as Array<Record<string, unknown>>;

  const noticias = linhas.map((linha) => ({
    id: linha.id,
    titulo: texto(linha.titulo),
    resumo: texto(linha.resumo),
    categoria: texto(linha.categoria) || "Geral",
    fonte: texto(linha.fonte),
    url: texto(linha.url),
    imagem_url: texto(linha.imagem_url),
    publicado_em: linha.publicado_em ?? null,
    destaque: Boolean(linha.destaque),
    cliques: Number(linha.cliques ?? 0),
    conteudo: incluirConteudo ? texto(linha.conteudo) : "",
  }));

  return json(
    {
      noticias,
      total: noticias.length,
      gerado_em: new Date().toISOString(),
    },
    200,
    "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  );
});
