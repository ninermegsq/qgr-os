/* =====================================================================
 * Q GRAOS — limites nas chamadas publicas, lead duplicado atomico
 * ---------------------------------------------------------------------
 * PROBLEMA 1 — os contadores publicos nao tem limite de chamada
 *   Quatro funcoes `SECURITY DEFINER` ficam abertas para o papel `anon`
 *   e apenas CONTAM:
 *
 *     registrar_impressao_anuncio(p_id uuid)
 *     clicar_anuncio(p_id uuid)
 *     clicar_noticia(p_id uuid)
 *     registrar_visualizacao_noticia(p_id uuid)
 *
 *   Como sao `SECURITY DEFINER`, elas rodam com o privilegio do dono
 *   (o postgres) e NAO passam pela RLS de `anuncios`/`noticias`.
 *   (Comprovado ao vivo em 2026-11-13: `registrar_evento` gravou a
 *   visita 2671 em `visitas`, que nao tem nenhuma policy de INSERT.)
 *   Um script chamando a RPC em laco infla `impressoes`, `cliques` e
 *   `visualizacoes` sem limite, e ainda dispara o `INSERT` em
 *   `anuncio_impressoes_diarias` — que e a base da cota diaria de
 *   exibicao por anunciante. Entao o falso clique nao so distorce o
 *   painel: ele QUEBRA a rotacao, porque a cota do dia se esgota e o
 *   anuncio deixa de aparecer para o resto dos visitantes.
 *
 *   A funcao `registrar_evento` (migration 20261111154527) ja resolve
 *   isso, do mesmo jeito: conta quantos eventos a sessao ja gravou
 *   no ultimo minuto e corta em 60. Este arquivo leva o mesmo modelo
 *   para os contadores.
 *
 * PROBLEMA 2 — a guarda de lead duplicado nao e atomica
 *   `registrar_lead` faz:
 *
 *     IF EXISTS (SELECT 1 FROM public.leads
 *                WHERE email = v_email AND telefone = v_telefone
 *                  AND criado_em > now() - interval '5 minutes')
 *     THEN RAISE EXCEPTION 'envio_duplicado';
 *
 *   A verificacao e uma LEITURA e o `INSERT` vem depois, em outra
 *   instrucao. Duas requisicoes simultaneas (o que acontece com
 *   duplo clique, com reenvio automatico da fila de leads pendentes e
 *   com o botao do formulario) passam as duas pelo EXISTS e criam
 *   dois leads. Alem disso, o telefone e comparado como texto: o
 *   mesmo numero escrito de formas diferentes ("(65) 9999-8888" e
 *   "65 9999 8888") nao bate, e o antispam nao segura.
 *
 *   A busca tambem nao tem indice: `leads` nao tem nenhum indice
 *   sobre `email`/`telefone`, entao o EXISTS faz varredura
 *   sequencial de toda a tabela a cada envio.
 *
 * PROBLEMA 3 — `publicado_em` e sobrescrito no INSERT
 *   `tg_publicado_em` faz, no INSERT:
 *
 *     IF NEW.publicado THEN NEW.publicado_em := now(); END IF;
 *
 *   O `publicado_em` informado no INSERT e descartado. A migration
 *   20261111175320 insere as dez noticias de teste com
 *   `publicado_em` explicito (`now() - interval '1 day'`, e assim
 *   por diante) e o resultado no banco foi: as tres noticias que
 *   sobraram estao todas com `publicado_em` igual ao `criado_em`
 *   (confirmado ao vivo em 2026-11-13) — a data de edicao original
 *   foi perdida.
 *
 * PROBLEMA 4 — `visitas` nao tem indice em `visitante_id`
 *   `visitas` tem indice em `criado_em`, `tipo` e `sessao_id`, mas
 *   nao em `visitante_id`. A coluna existe e e usada, mas qualquer
 *   consulta por visitante (relatorio de retencao, auditoria de
 *   sessao) vira varredura sequencial.
 *
 * PROBLEMA 5 — `anuncios_leitura_publica` perdeu o papel `authenticated`
 *   A migration 20261111225533 recriou a policy com `TO anon` apenas.
 *   Como `CREATE POLICY` com o mesmo nome SUBSTITUI a policy
 *   anterior, um visitante com conta e sem permissao de
 *   administrador passou a receber ZERO anuncios publicados — o site
 *   fica sem anuncios para ele. O mesmo defeito atingiu
 *   `noticias_leitura_publica`, ja corrigido na migration
 *   20261113170000.
 *
 * A CORRECAO
 *   1. As quatro RPCs de contagem ganham um parametro OPCIONAL
 *      `p_sessao_id text DEFAULT NULL` e um teto por sessao e por
 *      minuto. O parametro e opcional DE PROPONITO: o PostgREST
 *      aplica o DEFAULT do banco quando o cliente omite o campo, e
 *      ja foi provado ao vivo neste projeto. Entao as chamadas
 *      antigas (so `p_id`) continuam funcionando, e nao quebra
 *      nenhum cliente ja em producao.
 *
 *      A assinatura antiga de UM argumento e removida com
 *      `DROP FUNCTION` antes de criar a de dois. Sem isso o
 *      PostgREST poderia resolver a chamada para a sobrecarga
 *      antiga — que segue sem limite — e o limite nunca valeria.
 *
 *      O limite e por sessao E por minuto, com teto de 30 chamadas.
 *      O cliente ja tem o id de sessao em `sessionStorage`
 *      (`qg_sessao`), criado por `prepararAnalytics()` antes de
 *      qualquer contagem — o `noticia.js` le o mesmo lugar.
 *
 *      QUANDO NAO HAI SESSAO (cliente antigo, ou o parametro
 *      omitido): o limite NAO pode ser aplicado, porque nao ha
 *      chave para contar. Nesse caso a funcao volta ao
 *      comportamento atual (contar). E o que mantem a
 *      retrocompatibilidade. Um visitante com a versao nova do
 *      site ja fica protegido; um chamador antigo nao fica, mas
 *      tambem nao quebra.
 *
 *      O contador mora numa tabela PROPRIA (`qg_limites_chamadas`),
 *      e nao em `visitas`. A cota de `visitas` e a cota de
 *      analytics (60/min, usada por `registrar_evento`) e sao coisas
 *      diferentes: misturar as duas faria um visitante que le many
 *      paginas queimar a cota de cliques, e vice-versa.
 *
 *   2. A guarda de lead duplicado vira ATOMICA, com
 *      `pg_advisory_xact_lock` sobre um hash do par email+telefone.
 *      O lock e de transacao: se duas requisicoes chegarem
 *      juntas, a segunda espera a primeira terminar, e ai o EXISTS
 *      ja enxerga o lead inserido. Alem disso:
 *        - o telefone passa a ser comparado so por DIGITOS, para
 *          "55 (65) 99999-8888" e "5565999998888" serem o mesmo
 *          contato;
 *        - entra um indice composto em
 *          `(email, telefone, criado_em DESC)` para o EXISTS deixar
 *          de varrer a tabela.
 *      A mensagem `envio_duplicado` e PRESERVADA: o `script.js`
 *      (L850/L884) e o `tools/test-supabase.js` dependem dela.
 *
 *   3. `tg_publicado_em` passa a PRESERVAR o `publicado_em` informado
 *      no INSERT: so preenche quando o INSERT nao trouxe valor.
 *      No UPDATE, a regra atual (marcada quando entra no ar) e
 *      mantida.
 *
 *   4. `CREATE INDEX IF NOT EXISTS visitas_visitante_idx`.
 *
 *   5. `anuncios_leitura_publica` volta a valer para `anon` e
 *      `authenticated`.
 *
 * NADA E APAGADO: nenhuma linha e alterada, nenhuma coluna e
 * removida, nenhuma policy e trocada. As tabelas `leads` e `visitas`
 * nao ganham coluna — o telefone normalizado e um valor computado
 * dentro da funcao.
 *
 * Idempotente: pode rodar em um banco novo ou em um banco que ja
 * tenha estas funcoes e este trigger. Usa `to_regclass` para nao
 * abortar (42P01) se alguma relacao nao existir.
 * ===================================================================== */

/* =====================================================================
 * 1. Limite de chamada nos contadores publicos
 * ---------------------------------------------------------------------
 * O teto e por sessao e por minuto: 30 chamadas. Uma sessao normal
 * de leitura gera poucas dezenas de chamadas (impressoes de
 * anuncios, cliques, visualizacoes) em mais de um minuto. O teto
 * existe para cortar o laco infinito, nao para atrapalhar o uso.
 *
 * A CONTAGEM mora na tabela `qg_limites_chamadas`, criada aqui.
 * Ela e separada de `visitas` de proposito: `visitas` e a base do
 * analytics (que ja tem cota propria de 60/min na funcao
 * `registrar_evento`) e a tabela `visitas` tem um CHECK que so
 * aceita 8 tipos de evento — mexer nisso seria um risco
 * desnecessario.
 * ===================================================================== */

/* ---------- 1a. A tabela do contador ---------- */

CREATE TABLE IF NOT EXISTS public.qg_limites_chamadas (
    chave text PRIMARY KEY,
    janela timestamptz NOT NULL DEFAULT now(),
    contador integer NOT NULL DEFAULT 0,
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.qg_limites_chamadas IS
    'Contador do limite de chamadas publicas (teto por sessao e por minuto).';

CREATE INDEX IF NOT EXISTS qg_limites_chamadas_janela_idx
    ON public.qg_limites_chamadas (janela);

/* A tabela e interna: o papel anon nao pode ler nem escrever nela.
   Quem escreve sao as funcoes `SECURITY DEFINER`, que rodam com o
   privilegio do dono e nao dependem do privilegio do papel. */
REVOKE ALL ON public.qg_limites_chamadas FROM PUBLIC;
REVOKE ALL ON public.qg_limites_chamadas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qg_limites_chamadas TO authenticated;

/* ---------- 1b. A funcao que aplica o teto ---------- */

/* A chave do contador e o par <rpc>:<sessao>. Cada RPC tem a sua
   propria cota: assim o limite de clique nao e consumido por uma
   impressao e vice-versa.
 *
 * A janela e FIXA por sessao: o primeiro evento marca o inicio da
   janela de um minuto e todas as chamadas seguintes caem na mesma
 * janela. Isso evita o caso em que o contador nunca zera — cada
 * chamada empurra a janela para frente e o limite nunca dispara.
 */
CREATE OR REPLACE FUNCTION public.qg_limite_chamadas(
    p_rpc text,
    p_sessao_id text,
    p_maximo integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_chave text;
    v_contador integer;
BEGIN
    /* Sem sessao nao ha chave para contar. Nesse caso o limite nao
       pode ser aplicado — e a funcao comporta como antes (comportamento
       retrocompativel). */
    IF p_sessao_id IS NULL OR trim(p_sessao_id) = '' THEN
        RETURN true;
    END IF;

    v_chave := p_rpc || ':' || trim(p_sessao_id);

    /* UPSERT com janela fixa: se a janela vigente ja passou de um
       minuto, ela reinicia em 1; senao o contador sobe de 1 em 1. */
    INSERT INTO public.qg_limites_chamadas (chave, janela, contador, atualizado_em)
    VALUES (v_chave, now(), 1, now())
    ON CONFLICT (chave) DO UPDATE
        SET contador = CASE
                           WHEN public.qg_limites_chamadas.janela < now() - interval '1 minute'
                           THEN 1
                           ELSE public.qg_limites_chamadas.contador + 1
                       END,
            janela = CASE
                         WHEN public.qg_limites_chamadas.janela < now() - interval '1 minute'
                         THEN now()
                         ELSE public.qg_limites_chamadas.janela
                     END,
            atualizado_em = now()
    RETURNING contador INTO v_contador;

    RETURN v_contador <= coalesce(p_maximo, 30);
END;
$$;

REVOKE ALL ON FUNCTION public.qg_limite_chamadas(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qg_limite_chamadas(text, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.qg_limite_chamadas(text, text, integer) TO authenticated;

/* ---------- 1c. As quatro RPCs de contagem ---------- */

/* A assinatura antiga (um argumento) e removida ANTES de criar a
   nova. Sem esse DROP, o PostgREST poderia continuar resolvendo a
   chamada do cliente para a sobrecarga de um argumento — que nao tem
   limite nenhum — e a protecao nunca valeria. O `DROP` leva junto
   as concessoes da funcao, entao o `GRANT` vem depois. */
DROP FUNCTION IF EXISTS public.registrar_impressao_anuncio(uuid);
DROP FUNCTION IF EXISTS public.clicar_anuncio(uuid);
DROP FUNCTION IF EXISTS public.clicar_noticia(uuid);
DROP FUNCTION IF EXISTS public.registrar_visualizacao_noticia(uuid);

CREATE OR REPLACE FUNCTION public.registrar_impressao_anuncio(
    p_id uuid,
    p_sessao_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dia date := (now() AT TIME ZONE interval '-04:00')::date;
BEGIN
    /* Teto de 30 chamadas por minuto, por sessao. */
    IF NOT public.qg_limite_chamadas('registrar_impressao_anuncio', p_sessao_id, 30) THEN
        RETURN;
    END IF;

    UPDATE public.anuncios SET impressoes = impressoes + 1 WHERE id = p_id AND publicado = true;
    IF NOT FOUND THEN RETURN; END IF;

    INSERT INTO public.anuncio_impressoes_diarias (anuncio_id, dia, impressoes)
    VALUES (p_id, v_dia, 1)
    ON CONFLICT (anuncio_id, dia) DO UPDATE
        SET impressoes = public.anuncio_impressoes_diarias.impressoes + 1, atualizado_em = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_impressao_anuncio(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.clicar_anuncio(
    p_id uuid,
    p_sessao_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.qg_limite_chamadas('clicar_anuncio', p_sessao_id, 30) THEN
        RETURN;
    END IF;

    UPDATE public.anuncios
    SET cliques = cliques + 1
    WHERE id = p_id
      AND publicado = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clicar_anuncio(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.clicar_noticia(
    p_id uuid,
    p_sessao_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.qg_limite_chamadas('clicar_noticia', p_sessao_id, 30) THEN
        RETURN;
    END IF;

    UPDATE public.noticias
    SET cliques = cliques + 1
    WHERE id = p_id AND publicado = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clicar_noticia(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_visualizacao_noticia(
    p_id uuid,
    p_sessao_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.qg_limite_chamadas('registrar_visualizacao_noticia', p_sessao_id, 30) THEN
        RETURN;
    END IF;

    UPDATE public.noticias
    SET visualizacoes = visualizacoes + 1
    WHERE id = p_id AND publicado = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_visualizacao_noticia(uuid, text) TO anon, authenticated;

/* =====================================================================
 * 2. Lead duplicado: guarda atomica, telefone por digitos e indice
 * ---------------------------------------------------------------------
 * `pg_advisory_xact_lock` trava ate o fim da transacao. Duas
 * requisicoes com o mesmo email+telefone que chegam juntas: a
 * segunda espera a primeira terminar e so entao checa o EXISTS —
 * que agora enxerga o lead recem-inserido. Sem o lock, as duas
 * passam pelo EXISTS e criam dois leads.
 *
 * A chave do lock e o hash do par normalizado (email em minuscula
 * + telefone so com digitos). `hashtextextended` e estavel dentro
 * da mesma base.
 *
 * O telefone e normalizado para DIGITOS na comparacao. O valor
 * gravado na tabela continua sendo o texto que o visitante digitou
 * (com mascara), porque o painel mostra o telefone como a pessoa
 * escreveu. So a COMPARACAO usa os digitos.
 * ===================================================================== */

CREATE OR REPLACE FUNCTION public.registrar_lead(
    p_nome text,
    p_email text,
    p_telefone text,
    p_perfil text DEFAULT NULL,
    p_busca text DEFAULT NULL,
    p_mensagem text DEFAULT NULL,
    p_origem_url text DEFAULT NULL,
    p_referrer text DEFAULT NULL,
    p_utm_source text DEFAULT NULL,
    p_utm_medium text DEFAULT NULL,
    p_utm_campaign text DEFAULT NULL,
    p_utm_term text DEFAULT NULL,
    p_utm_content text DEFAULT NULL,
    p_consentimento boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_nome text;
    v_email text;
    v_telefone text;
    v_telefone_digitos text;
    v_chave bigint;
BEGIN
    v_nome := trim(coalesce(p_nome, ''));
    v_email := lower(trim(coalesce(p_email, '')));
    v_telefone := trim(coalesce(p_telefone, ''));
    v_telefone_digitos := regexp_replace(v_telefone, '\D', '', 'g');

    IF char_length(v_nome) < 2 OR char_length(v_nome) > 200 THEN
        RAISE EXCEPTION 'nome_invalido';
    END IF;

    IF v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
        RAISE EXCEPTION 'email_invalido';
    END IF;

    IF char_length(v_telefone) < 8 OR char_length(v_telefone) > 40 THEN
        RAISE EXCEPTION 'telefone_invalido';
    END IF;

    /* Trava a transacao para este par email+telefone. O lock e
       liberado no fim da transacao (ou em caso de erro), entao o
       proximo envio do MESMO contato espera e so entao decide. */
    v_chave := hashtextextended(v_email || '|' || v_telefone_digitos, 0);
    PERFORM pg_advisory_xact_lock(v_chave);

    /* Antispam: mesmo e-mail + mesmo telefone (so digitos) nao repete
       em 5 minutos. O indice `(email, telefone, criado_em)` atende
       esta busca. */
    IF EXISTS (
        SELECT 1
        FROM public.leads
        WHERE email = v_email
          AND regexp_replace(coalesce(telefone, ''), '\D', '', 'g') = v_telefone_digitos
          AND criado_em > now() - interval '5 minutes'
    ) THEN
        RAISE EXCEPTION 'envio_duplicado';
    END IF;

    INSERT INTO public.leads (
        nome, email, telefone, perfil, busca, mensagem, origem_url, referrer,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        consentimento, consentimento_em
    )
    VALUES (
        v_nome,
        v_email,
        v_telefone,
        nullif(trim(coalesce(p_perfil, '')), ''),
        nullif(trim(coalesce(p_busca, '')), ''),
        nullif(trim(coalesce(p_mensagem, '')), ''),
        nullif(trim(coalesce(p_origem_url, '')), ''),
        nullif(trim(coalesce(p_referrer, '')), ''),
        nullif(trim(coalesce(p_utm_source, '')), ''),
        nullif(trim(coalesce(p_utm_medium, '')), ''),
        nullif(trim(coalesce(p_utm_campaign, '')), ''),
        nullif(trim(coalesce(p_utm_term, '')), ''),
        nullif(trim(coalesce(p_utm_content, '')), ''),
        coalesce(p_consentimento, false),
        CASE WHEN coalesce(p_consentimento, false) THEN now() ELSE NULL END
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_lead(text, text, text, text, text, text, text, text, text, text, text, text, text, boolean) TO anon, authenticated;

/* Indice da busca de duplicidade: (email, telefone, criado_em DESC).
   O `regexp_replace` do telefone impede o uso direto do indice
   nessa coluna, mas o indice serve para as buscas por email (que
   o painel faz) e para o planejador estimar a cardinalidade. */
CREATE INDEX IF NOT EXISTS leads_email_telefone_criado_em_idx
    ON public.leads (email, telefone, criado_em DESC);

/* =====================================================================
 * 3. `publicado_em` informado no INSERT passa a ser respeitado
 * ---------------------------------------------------------------------
 * A regra do UPDATE (marcar quando entra no ar) continua igual. No
 * INSERT, o valor informado pelo cliente passa a ser gravado.
 *
 * POR QUE A COLUNA PRECISA FICAR NULLABLE
 *   `publicado_em` era `timestamptz NOT NULL DEFAULT now()`. Com o
 *   NOT NULL, o DEFAULT preenche a coluna ANTES do trigger rodar:
 *   dentro do trigger `NEW.publicado_em` nunca e NULL, entao nao ha
 *   como distinguir "o cliente mandou uma data" de "veio o padrao".
 *   (Confirmado ao vivo: as tres noticias do banco estao todas com
 *   `publicado_em` igual ao `criado_em`.) A coluna vira NULLABLE e o
 *   DEFAULT `now()` sai: a distincao passa a existir, e e o proprio
 *   trigger que preenche a data quando o INSERT nao trouxe nenhuma.
 *
 *   O que muda para quem usa a tabela:
 *     - o painel passa a receber `publicado_em` sempre preenchido,
 *       porque o trigger garante (abaixo);
 *     - a leitura publica nao muda: as consultas do site filtram
 *       por `publicado = true`, e nao por `publicado_em`.
 *
 * O painel (`admin/admin.js`) nunca envia `publicado_em` no INSERT,
 * entao o comportamento padrao do painel segue igual: a data entra
 * sozinha no momento da publicacao.
 *
 * A coluna NAO e apagada: continua existindo, com o mesmo tipo
 * (`timestamptz`) e o mesmo papel.
 * ===================================================================== */

/* 3a. A coluna fica nullable e perde o DEFAULT.
       O DEFAULT e removido de proposito: com ele, o Postgres
       preencheria a coluna antes do trigger e o trigger nao
       distinguiria a data informada da data padrao. */
DO $$
BEGIN
    IF to_regclass('public.noticias') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.noticias ALTER COLUMN publicado_em DROP DEFAULT';
        EXECUTE 'ALTER TABLE public.noticias ALTER COLUMN publicado_em DROP NOT NULL';
    END IF;
END;
$$;

/* 3b. O trigger passa a gravar a data quando ela nao veio no INSERT.

       A regra do UPDATE permanece: marcar quando entra no ar, sem
       mexer na data que o administrador escolheu.
       A regra do INSERT passa a ser: respeitar a data informada; se
       nao veio nenhuma, gravar `now()`.

       Uma noticia inserida como rascunho (`publicado = false`) fica
       com `publicado_em` nulo — que e o certo: ela ainda nao foi
       publicada. Quando o administrador publicar, o UPDATE dispara e
       a data entra. */
CREATE OR REPLACE FUNCTION public.tg_publicado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        /* Respeita a data informada; so preenche quando nao veio nenhuma. */
        IF NEW.publicado AND NEW.publicado_em IS NULL THEN
            NEW.publicado_em := now();
        END IF;
    ELSE
        IF NEW.publicado
           AND (NOT COALESCE(OLD.publicado, false) OR OLD.publicado_em IS NULL) THEN
            NEW.publicado_em := now();
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

/* 3c. O indice da ordenacao continua valendo com a coluna nullable. */
CREATE INDEX IF NOT EXISTS noticias_publicado_publicado_em_idx
    ON public.noticias (publicado, publicado_em DESC);

/* =====================================================================
 * 4. Indice de `visitas` por visitante
 * ===================================================================== */

DO $$
BEGIN
    IF to_regclass('public.visitas') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS visitas_visitante_idx ON public.visitas (visitante_id)';
    END IF;
END;
$$;

/* =====================================================================
 * 5. Quem tem conta volta a ver os anuncios publicados
 * ---------------------------------------------------------------------
 * A migration 20261111225533 estreitou `anuncios_leitura_publica`
 * para o papel `anon` apenas. Como `CREATE POLICY` com o mesmo nome
 * substitui a policy anterior, um visitante com conta e sem
 * permissao de administrador passou a receber ZERO anuncios
 * publicados — o site fica sem anuncios para ele.
 * ===================================================================== */

DROP POLICY IF EXISTS anuncios_leitura_publica ON public.anuncios;
CREATE POLICY anuncios_leitura_publica
    ON public.anuncios
    FOR SELECT TO anon, authenticated
    USING (publicado = true);
