// =====================================================================
// Q GRAOS — Edge Function "cotacoes-trigger"
// ---------------------------------------------------------------------
// Dispara a coleta de cotações no GitHub Actions, a pedido do botão
// "Atualizar cotações agora" do painel /admin.
//
// POR QUE ELA EXISTE
//   O token do GitHub NÃO pode ficar no admin/admin.js: aquele arquivo
//   é público (baixa no navegador de qualquer visitante). Quem guarda
//   o token é esta função, no servidor do Supabase, como secret.
//   O painel só manda um POST autenticado; a função decide se quem
//   chamou é administrador e, se for, dispara a workflow.
//
// O que dispara
//   repository_dispatch (event_type "cotacoes") na workflow
//   .github/workflows/cotacoes.yml — a mesma que roda por schedule.
//
// Variáveis de ambiente (secrets da Edge Function):
//   QG_GITHUB_TOKEN        -> token com escopo "repo" (ou fine-grained)
//   QG_GITHUB_OWNER        -> dono do repositorio (ex.: ninermegsq)
//   QG_GITHUB_REPO         -> nome do repositorio (ex.: qgr-os)
//   QG_GITHUB_WORKFLOW     -> arquivo da workflow (ex.: cotacoes.yml)
//   SUPABASE_SERVICE_ROLE_KEY -> usada para conferir quem e admin
//
// Uso:
//   POST /functions/v1/cotacoes-trigger
//   Authorization: Bearer <token de sessao do painel>
//
// Resposta:
//   { "disparado": true, "detalhe": "..." }
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return json({ erro: "metodo_nao_permitido" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const token = Deno.env.get("QG_GITHUB_TOKEN") ?? "";
  const owner = Deno.env.get("QG_GITHUB_OWNER") ?? "";
  const repo = Deno.env.get("QG_GITHUB_REPO") ?? "";
  const workflow = Deno.env.get("QG_GITHUB_WORKFLOW") ?? "cotacoes.yml";

  if (!supabaseUrl || !serviceKey) {
    return json(
      {
        erro: "supabase_nao_configurado",
        mensagem:
          "Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas secrets da Edge Function.",
      },
      500,
    );
  }

  if (!token || !owner || !repo) {
    return json(
      {
        erro: "github_nao_configurado",
        mensagem:
          "Defina QG_GITHUB_TOKEN, QG_GITHUB_OWNER e QG_GITHUB_REPO nas secrets da Edge Function.",
      },
      500,
    );
  }

  // ---------- 1. Quem chamou? ----------

  const authorization = request.headers.get("Authorization") ?? "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ erro: "nao_autenticado" }, 401);
  }

  const sessao = authorization.slice(7).trim();

  if (!sessao) {
    return json({ erro: "nao_autenticado" }, 401);
  }

  const respostaUsuario = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${sessao}`,
    },
  });

  if (!respostaUsuario.ok) {
    return json({ erro: "nao_autenticado" }, 401);
  }

  const usuario = (await respostaUsuario.json()) as { id?: string };

  if (!usuario?.id) {
    return json({ erro: "nao_autenticado" }, 401);
  }

  // ---------- 2. E administrador? ----------

  const respostaAdmin = await fetch(
    `${supabaseUrl}/rest/v1/administradores?user_id=eq.` +
      `${encodeURIComponent(usuario.id)}&select=user_id,ativo&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );

  if (!respostaAdmin.ok) {
    return json(
      { erro: "falha_na_conferencia", mensagem: "Nao deu para conferir o administrador." },
      502,
    );
  }

  const administradores = (await respostaAdmin.json()) as Array<{
    user_id?: string;
    ativo?: boolean;
  }>;

  const eAdmin =
    Array.isArray(administradores) &&
    administradores.length > 0 &&
    administradores[0].ativo !== false;

  if (!eAdmin) {
    return json({ erro: "sem_permissao" }, 403);
  }

  // ---------- 3. Dispara a workflow ----------

  const resposta = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "q-graos-cotacoes-trigger",
      },
      body: JSON.stringify({
        event_type: "cotacoes",
        client_payload: { origem: "painel-admin" },
      }),
    },
  );

  if (!resposta.ok) {
    const detalhe = await resposta.text();

    return json(
      {
        erro: "falha_no_disparo",
        status: resposta.status,
        detalhe: detalhe.slice(0, 500),
      },
      502,
    );
  }

  return json({
    disparado: true,
    workflow: `${owner}/${repo}/${workflow}`,
    mensagem:
      "Coleta disparada. Os numeros novos aparecem no site em poucos minutos.",
  });
});
