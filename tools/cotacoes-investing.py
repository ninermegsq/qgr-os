#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Q GRAOS — auxiliar Python para a coleta do Investing.com.

POR QUE EXISTE ESTE ARQUIVO
---------------------------
O Investing.com protege a API com TLS de navegador (bloqueia o
`requests`/`urllib` comum do Python). A biblioteca `curl_cffi` resolve
isso imitando o handshake de um Chrome de verdade. Como o site e o
painel sao 100% estaticos (sem Python no servidor), este script roda
apenas na hora da coleta, no servidor de quem publica.

O QUE ELE FAZ
-------------
1. Le no `stdin` um JSON com a lista de requisicoes:

       {
         "requisicoes": [
           {"chave": "ZS", "url": "https://...", "metodo": "GET",
            "corpo": null, "headers": {}}
         ]
       }

2. Executa cada requisicao com `curl_cffi` (impersonate="chrome").
3. Devolve no `stdout` um JSON:

       {
         "erro": null,
         "itens": [
           {"chave": "ZS", "status": 200, "url": "...",
            "json": {...}, "texto": "..."}
         ]
       }

O Node (tools/coletar-cotacoes.js) e quem interpreta o JSON e grava
no banco. Este arquivo nao decide preco nenhum: ele so busca.

INSTALACAO
----------
    pip install curl_cffi

SEM PYTHON / SEM curl_cffi
--------------------------
O script NAO quebra a coleta inteira: ele imprime um JSON com o erro
e sai com codigo 0. O coletor entao marca a fonte Investing.com como
"erro" no painel, sem apagar o que ja estava publicado.
"""

import json
import sys

# Cabecalho de navegador: a API do Investing recusa cliente desconhecido.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Tempo maximo de cada requisicao (segundos).
TIMEOUT = 25

# Quantos caracteres do corpo bruto sao guardados (util para depurar e
# para raspar o HTML das paginas de cotacao).
LIMITE_TEXTO = 600000


def carregar_especificacao():
    """Le a especificacao das requisicoes no stdin."""
    try:
        bruto = sys.stdin.read()
    except Exception:
        return []

    if not bruto or not bruto.strip():
        return []

    try:
        dados = json.loads(bruto)
    except Exception as erro:
        return {"erro": "JSON invalido no stdin: %s" % erro}

    if isinstance(dados, dict):
        return dados.get("requisicoes") or []

    if isinstance(dados, list):
        return dados

    return []


def responder(erro, itens):
    """Imprime a resposta no stdout, sempre em JSON."""
    payload = json.dumps({"erro": erro, "itens": itens}, ensure_ascii=False)

    try:
        sys.stdout.buffer.write(payload.encode("utf-8"))
        sys.stdout.buffer.flush()
    except Exception:
        # Windows pode ter o console em cp1252: escreve bytes de UTF-8
        # direto no buffer para nao quebrar na acentuacao.
        sys.stdout.buffer.write(
            json.dumps({"erro": erro, "itens": itens}, ensure_ascii=True).encode("ascii")
        )
        sys.stdout.buffer.flush()


def main():
    especificacao = carregar_especificacao()

    if isinstance(especificacao, dict):
        responder(especificacao.get("erro") or "Especificacao invalida.", [])
        return 0

    if not especificacao:
        responder("Nenhuma requisicao informada.", [])
        return 0

    try:
        from curl_cffi import requests as cffi_requests
    except Exception as erro:
        responder(
            "curl_cffi nao esta instalado (%s). Rode: pip install curl_cffi" % erro,
            []
        )
        return 0

    itens = []

    for requisicao in especificacao:
        chave = requisicao.get("chave") or requisicao.get("url") or ""
        url = requisicao.get("url") or ""
        metodo = (requisicao.get("metodo") or "GET").upper()
        corpo = requisicao.get("corpo")
        headers = requisicao.get("headers") or {}

        cabecalhos = {
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
            "Origin": "https://www.investing.com",
            "Referer": "https://www.investing.com/",
        }
        cabecalhos.update(headers)

        try:
            sessao = cffi_requests.Session(impersonate="chrome")

            if metodo == "GET":
                resposta = sessao.get(url, headers=cabecalhos, timeout=TIMEOUT)
            elif metodo == "POST":
                resposta = sessao.post(
                    url,
                    headers=cabecalhos,
                    data=corpo,
                    timeout=TIMEOUT,
                )
            else:
                resposta = sessao.request(
                    metodo, url, headers=cabecalhos, data=corpo, timeout=TIMEOUT
                )

            texto = ""
            try:
                texto = resposta.text or ""
            except Exception:
                texto = ""

            conteudo_json = None
            try:
                conteudo_json = resposta.json()
            except Exception:
                conteudo_json = None

            itens.append(
                {
                    "chave": chave,
                    "status": int(resposta.status_code),
                    "url": url,
                    "json": conteudo_json,
                    "texto": texto[:LIMITE_TEXTO],
                }
            )
        except Exception as erro:
            itens.append(
                {
                    "chave": chave,
                    "status": 0,
                    "url": url,
                    "json": None,
                    "texto": "",
                    "erro": str(erro),
                }
            )

    responder(None, itens)
    return 0


if __name__ == "__main__":
    sys.exit(main())
