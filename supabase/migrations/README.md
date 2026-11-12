# Migrations do banco (Q GRÃOS)

Histórico do schema do Supabase, na ordem em que foi aplicado no projeto
`rppoiwrbxqdbtavhgdjk`.

| Arquivo | O que faz |
| --- | --- |
| `20260101000000_qg_init.sql` | **Arquivo de referência.** Schema completo: tabelas `administradores`, `noticias`, `leads`, `visitas`; RLS; funções `e_admin`, `registrar_lead`, `registrar_evento`, `clicar_noticia`, `noticias_publicas`; vistas `vw_painel_resumo`, `vw_leads_por_dia`, `vw_visitas_por_dia`, `vw_visitas_por_tipo`. É idempotente: pode rodar em um banco novo. |
| `20261111154444_qg_init.sql` | Primeira aplicação do schema no projeto (gerada a partir do arquivo de referência). |
| `20261111154527_qg_fix_registrar_evento.sql` | Corrige a função `registrar_evento`, que havia sido criada com um parâmetro duplicado. |
| `20261111160027_qg_admin_padrao.sql` | Cria o usuário administrador no Auth (`contato@qgraos.com.br`), a identidade e a linha em `administradores`. **A senha não é versionada**: defina `SET app.admin_senha = '...'` na mesma sessão antes de rodar. |
| `20261111161130_qg_admin_corrige_nulls.sql` | Normaliza para `''` as colunas de token do usuário no Auth (o GoTrue lê essas colunas como texto e falha com `NULL`). |
| `20261111162726_qg_limpa_leads_teste.sql` | Remove os leads do teste automatizado (`teste@qgraos.invalid`). |
| `20261111162953_qg_limpa_usuario_sonda.sql` | Remove o usuário de diagnóstico do Auth (`sonda-*@exemplo.com`). |
| `20261111163019_qg_limpa_visitas_teste.sql` | Remove as visitas do teste automatizado (`/teste-automated`). |
| `20261111163858_qg_noticia_verificacao.sql` | Notícia temporária usada para validar os cards no site e a aba "Notícias" do painel. Reescrita para só remover a própria linha de teste. |
| `20261111164909_qg_limpa_dados_verificacao.sql` | Limpeza final dos dados de verificação. Reescrita para apagar **somente** linhas de teste, nunca dados reais. |
| `20261111171841_20261112000000_qg_rota_senha_admin.sql` | Rotação da senha do administrador sem gravar a senha no repositório (`SET app.admin_senha = '...'`). |
| `20261111172805_20261112000000_qg_limpa_visitas_previa.sql` | Remove as visitas do navegador de teste e de prévia local (identificadores fixos, não apaga visita de visitante real). |
| `20261111174500_qg_limpa_visitas_teste_visual.sql` | Remove as visitas deixadas pela verificação visual (identificadores fixos do navegador de teste). |
| `20261111175320_qg_noticias_teste_paginacao.sql` | 10 notícias temporárias (`https://exemplo.test/%`) usadas para validar a paginação da página `noticias.html`. Sempre acompanhadas da limpeza abaixo. |
| `20261111175437_qg_limpa_noticias_teste_paginacao.sql` | Apaga as notícias de teste da paginação (`url LIKE 'https://exemplo.test/%'`). Não toca em notícia real. |
| `20261111175655_20261111180000_qg_limpa_visitas_teste_paginacao_sql.sql` | Remove as visitas do teste de paginação (visitante fixo do navegador de teste). |
| `20261111192112_qg_portal_noticias_e_anuncios.sql` | **Portal de notícias.** Adiciona `public.noticias.conteudo` (o texto completo da matéria, que passa a ser hospedado no site), limita `resumo` a 320 caracteres e cria a tabela `public.anuncios` (com `autorizacao` do anunciante, `posicao` `noticias`/`noticia`, `formato` `faixa`/`card`, `impressoes`, `cliques`) com RLS, políticas e as RPC `registrar_impressao_anuncio` e `clicar_anuncio`. |
| `20261111201122_qg_visualizacoes_noticia.sql` | Métrica de leitura: coluna `public.noticias.visualizacoes` (inteiro, padrão 0) e a RPC `registrar_visualizacao_noticia(p_id uuid)`, que soma 1 só em notícia publicada. Chamada por `noticia.js` quando a matéria abre. |
| `20261111214951_20261112030000_qg_rotacao_anuncios_sql.sql` | **Rodízio de anúncios (parte 1 — schema).** Colunas `peso` (1 a 10, padrão 1), `limite_impressoes` (cota total) e `limite_impressoes_dia` (cota diária) em `public.anuncios`; índice de rodízio; tabela `public.anuncio_impressoes_diarias` (impressões por dia, base da cota diária) com RLS e leitura só para admin. |
| `20261111224439_qg_rotacao_anuncios_funcoes.sql` | **Rodízio de anúncios (parte 2 — funções, políticas e visão).** RPC `anuncios_elegiveis(p_posicao, p_formato)` (devolve só o que pode aparecer agora: publicado, no prazo e com cota disponível); `registrar_impressao_anuncio` passa a contar o dia; políticas `anuncios_leitura_admin` e `noticias_leitura_admin` (o painel volta a enxergar o que está pausado); view `vw_anuncios_desempenho` (impressões de hoje, cota restante e CTR em uma consulta só). |
| `20261111225533_qg_privacidade_anuncios.sql` | **Privacidade dos anúncios (parte 1 — quem vê o quê).** O papel `anon` (o site) passa a ler **só** as colunas públicas do anúncio (`id`, `titulo`, `empresa`, `texto`, `url`, `imagem_url`, `posicao`, `formato`, `publicado`, `prioridade`, `peso`, `inicio_em`, `fim_em`, `criado_em`); `impressoes`, `cliques`, `autorizacao`, `limite_impressoes`, `limite_impressoes_dia` e `atualizado_em` ficam fora do alcance do público. A RPC `anuncios_elegiveis` é recriada sem a coluna `autorizacao` (o contato do anunciante não vaza), e as políticas públicas passam a valer para o papel `anon` (quem entra com conta sem ser administrador não enxerga nem o que está pausado). |
| `20261111225803_qg_privacidade_grants_efetivos.sql` | **Privacidade dos anúncios (parte 2 — permissões efetivas).** O papel `anon` perde a escrita em `noticias` (fica só com `SELECT`); `anuncio_impressoes_diarias` e `vw_anuncios_desempenho` ficam somente com `SELECT` para quem entrou com conta. O RLS continua sendo a segunda barreira. |
| `20261111232537_qg_limpa_anuncios_verificacao.sql` | **Limpeza dos anúncios de teste.** Apaga da tabela `anuncios` os espaços criados pela verificação automática (`titulo LIKE 'Verificação automática:%'`), que estavam publicados e apareciam no site como se fossem anúncios de clientes. A contagem diária desses anúncios some junto (FK em cascata). |
| `20261112010055_20261112010000_qg_limpa_visitas_e_anuncio_teste_final.sql` | **Limpeza final do painel.** Apaga as 194 visitas que sobraram dos navegadores headless (todas com `referrer` de `127.0.0.1`) e o anúncio de teste "INSUMOS / EMBRAPA", que estava publicado e aparecia no fim das matérias como propaganda de cliente. Só toca em identificadores fixos de teste: lead, notícia e visita real ficam intactos. |
| `20261112011131_20261112020000_qg_limpa_visitas_teste_local_sql.sql` | **Limpeza das visitas de teste remanescentes.** Apaga as visitas cujo `referrer` aponta para o servidor local (`127.0.0.1`), ou seja, as que o navegador de teste da verificação visual deixa para trás (o evento de analytics é enviado sem esperar resposta e chega ao banco depois da limpeza). Visita de visitante real, com `referrer` externo, fica intacta. |
| `20261112090000_qg_cotacoes.sql` | **Área de cotações (schema).** Cria `public.cotacoes` (fonte, mercado, símbolo, produto, região, preço, preço máx/mín, variação, unidade, referência, publicado, timestamps; único por `fonte`+`símbolo`) e `public.cotacoes_fontes` (estado de cada fonte: `ok`/`erro`/`pendente`, mensagem, itens, coletado em). Índices, trigger de `atualizado_em`, RLS e políticas: o público lê **somente** as cotações com `publicado = true`; escrever é do coletor (ou do painel), com conta de administrador. `anon` perde qualquer escrita e não enxerga `cotacoes_fontes`. É idempotente (pode rodar em um banco novo). |
| `20261112093000_qg_cotacoes_carga_imea.sql` | **Carga inicial do IMEA.** Publica os 86 preços de grão do IMEA (soja, milho e algodão em Mato Grosso e outros estados), com `preco_max`, `preco_min` e variação. Só entram indicadores de preço de grão: semente, frete, óleo, farelo e custos são descartados pelo coletor. |
| `20261112094000_qg_cotacoes_carga_grao_direto_investing.sql` | **Carga inicial do Grão Direto e do Investing.com.** Publica as cotações regionais e de futuros do Grão Direto (33 regionais, 8 futuros, 5 da B3 e 1 de câmbio) e as do Investing.com (5 futuros, 1 da B3, 1 de câmbio e 3 macro). |
| `20261112095000_qg_cotacoes_fontes_carga.sql` | **Estado das fontes.** Registra as três fontes em `cotacoes_fontes` com o resultado da coleta (quantidade de itens e data). Tabela interna: só o painel enxerga. |
| `20261112103000_qg_cotacoes_produto_uf.sql` | **Filtros de produto e de estado.** Adiciona `public.cotacoes.produto_chave` (soja, milho, algodao, sorgo, farelo_soja, cafe, dolar, ibovespa, ouro, petroleo) e `public.cotacoes.uf` (sigla do estado), com índice em cada coluna, e preenche as 143 cotações publicadas (143 com produto, 119 com estado — Chicago, BM&F, B3 e o dólar/macro não têm estado). É idempotente e a mesma regra de classificação fica no `classificacao-cotacoes.js`, que o coletor usa a cada nova coleta. |

## Aplicar em outro ambiente

1. Copie o arquivo `20260101000000_qg_init.sql` para o **SQL Editor** do Supabase Dashboard
   (ou rode `supabase db push`).
2. Crie o administrador: defina a senha na mesma sessão
   (`SET app.admin_senha = 'sua-senha-forte';`) e use
   `20261111160027_qg_admin_padrao.sql` e `20261111161130_qg_admin_corrige_nulls.sql`
   **ou** crie o usuário pela tela *Authentication → Users* e cadastre-o na tabela
   `administradores`.
3. Troque a senha do administrador.
4. Preencha `supabase.anonKey` em `site.config.js`.
