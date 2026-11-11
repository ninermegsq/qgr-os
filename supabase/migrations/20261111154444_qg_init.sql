-- =====================================================================
-- Q GRAOS — schema inicial aplicado no Supabase em 2026-11-11
-- ---------------------------------------------------------------------
-- ATENCAO: a versao original deste arquivo repetia p_visitante_id no
-- INSERT de registrar_evento. O arquivo foi corrigido e a correcao
-- tambem esta registrada em 20261111154527_qg_fix_registrar_evento.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.administradores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    email text NOT NULL,
    nome text,
    ativo boolean NOT NULL DEFAULT true,
    criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.administradores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS administradores_leitura ON public.administradores;
DROP POLICY IF EXISTS administradores_insercao ON public.administradores;
DROP POLICY IF EXISTS administradores_atualizacao ON public.administradores;
DROP POLICY IF EXISTS administradores_exclusao ON public.administradores;

CREATE OR REPLACE FUNCTION public.e_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.administradores a
        WHERE a.user_id = auth.uid()
          AND a.ativo = true
    );
$$;

CREATE POLICY administradores_leitura ON public.administradores
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.e_admin());

CREATE POLICY administradores_insercao ON public.administradores
    FOR INSERT TO authenticated
    WITH CHECK (public.e_admin());

CREATE POLICY administradores_atualizacao ON public.administradores
    FOR UPDATE TO authenticated
    USING (public.e_admin())
    WITH CHECK (public.e_admin());

CREATE POLICY administradores_exclusao ON public.administradores
    FOR DELETE TO authenticated
    USING (public.e_admin());

GRANT SELECT ON public.administradores TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.administradores TO authenticated;

CREATE TABLE IF NOT EXISTS public.noticias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo text NOT NULL,
    resumo text,
    categoria text NOT NULL DEFAULT 'Geral',
    fonte text,
    url text,
    imagem_url text,
    publicado boolean NOT NULL DEFAULT false,
    destaque boolean NOT NULL DEFAULT false,
    cliques integer NOT NULL DEFAULT 0,
    publicado_em timestamptz NOT NULL DEFAULT now(),
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT noticias_titulo_check CHECK (char_length(titulo) BETWEEN 3 AND 220),
    CONSTRAINT noticias_categoria_check CHECK (
        categoria IN ('Soja', 'Milho', 'Sorgo', 'Milheto', 'Feijao', 'Gergelim',
                      'Safra', 'Logistica', 'Mercado', 'Exportacao', 'Geral')
    )
);

CREATE INDEX IF NOT EXISTS noticias_publicadas_idx
    ON public.noticias (publicado, publicado_em DESC);
CREATE INDEX IF NOT EXISTS noticias_categoria_idx
    ON public.noticias (categoria);

ALTER TABLE public.noticias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS noticias_leitura_publica ON public.noticias;
DROP POLICY IF EXISTS noticias_insercao_admin ON public.noticias;
DROP POLICY IF EXISTS noticias_atualizacao_admin ON public.noticias;
DROP POLICY IF EXISTS noticias_exclusao_admin ON public.noticias;

CREATE POLICY noticias_leitura_publica ON public.noticias
    FOR SELECT TO anon, authenticated
    USING (publicado = true);

CREATE POLICY noticias_insercao_admin ON public.noticias
    FOR INSERT TO authenticated
    WITH CHECK (public.e_admin());

CREATE POLICY noticias_atualizacao_admin ON public.noticias
    FOR UPDATE TO authenticated
    USING (public.e_admin())
    WITH CHECK (public.e_admin());

CREATE POLICY noticias_exclusao_admin ON public.noticias
    FOR DELETE TO authenticated
    USING (public.e_admin());

GRANT SELECT ON public.noticias TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.noticias TO authenticated;

CREATE TABLE IF NOT EXISTS public.leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    email text NOT NULL,
    telefone text NOT NULL,
    perfil text,
    busca text,
    mensagem text,
    origem_url text,
    referrer text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    consentimento boolean NOT NULL DEFAULT false,
    consentimento_em timestamptz,
    status text NOT NULL DEFAULT 'novo',
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT leads_status_check CHECK (
        status IN ('novo', 'em_andamento', 'convertido', 'descartado')
    ),
    CONSTRAINT leads_nome_check CHECK (char_length(nome) BETWEEN 2 AND 200),
    CONSTRAINT leads_email_check CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

CREATE INDEX IF NOT EXISTS leads_criado_em_idx ON public.leads (criado_em DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads (status);
CREATE INDEX IF NOT EXISTS leads_email_idx ON public.leads (email);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_leitura_admin ON public.leads;
DROP POLICY IF EXISTS leads_atualizacao_admin ON public.leads;
DROP POLICY IF EXISTS leads_exclusao_admin ON public.leads;

CREATE POLICY leads_leitura_admin ON public.leads
    FOR SELECT TO authenticated
    USING (public.e_admin());

CREATE POLICY leads_atualizacao_admin ON public.leads
    FOR UPDATE TO authenticated
    USING (public.e_admin())
    WITH CHECK (public.e_admin());

CREATE POLICY leads_exclusao_admin ON public.leads
    FOR DELETE TO authenticated
    USING (public.e_admin());

GRANT SELECT ON public.leads TO authenticated;
GRANT UPDATE, DELETE ON public.leads TO authenticated;

CREATE TABLE IF NOT EXISTS public.visitas (
    id bigserial PRIMARY KEY,
    tipo text NOT NULL DEFAULT 'pageview',
    path text,
    referrer text,
    dispositivo text,
    visitante_id text,
    sessao_id text,
    secao text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    criado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT visitas_tipo_check CHECK (
        tipo IN ('pageview', 'secao', 'clique_whatsapp', 'clique_telefone',
                 'clique_email', 'abrir_formulario', 'lead_enviado', 'clique_noticia')
    )
);

CREATE INDEX IF NOT EXISTS visitas_criado_em_idx ON public.visitas (criado_em DESC);
CREATE INDEX IF NOT EXISTS visitas_tipo_idx ON public.visitas (tipo);
CREATE INDEX IF NOT EXISTS visitas_sessao_idx ON public.visitas (sessao_id);

ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visitas_leitura_admin ON public.visitas;
DROP POLICY IF EXISTS visitas_exclusao_admin ON public.visitas;

CREATE POLICY visitas_leitura_admin ON public.visitas
    FOR SELECT TO authenticated
    USING (public.e_admin());

CREATE POLICY visitas_exclusao_admin ON public.visitas
    FOR DELETE TO authenticated
    USING (public.e_admin());

GRANT SELECT ON public.visitas TO authenticated;
GRANT DELETE ON public.visitas TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.atualizado_em := now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER noticias_atualizado_em
BEFORE UPDATE ON public.noticias
FOR EACH ROW EXECUTE FUNCTION public.tg_atualizado_em();

CREATE OR REPLACE TRIGGER leads_atualizado_em
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_atualizado_em();

CREATE OR REPLACE FUNCTION public.tg_publicado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.publicado THEN
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

CREATE OR REPLACE TRIGGER noticias_publicado_em
BEFORE INSERT OR UPDATE OF publicado ON public.noticias
FOR EACH ROW EXECUTE FUNCTION public.tg_publicado_em();

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
BEGIN
    v_nome := trim(coalesce(p_nome, ''));
    v_email := lower(trim(coalesce(p_email, '')));
    v_telefone := trim(coalesce(p_telefone, ''));

    IF char_length(v_nome) < 2 OR char_length(v_nome) > 200 THEN
        RAISE EXCEPTION 'nome_invalido';
    END IF;

    IF v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
        RAISE EXCEPTION 'email_invalido';
    END IF;

    IF char_length(v_telefone) < 8 OR char_length(v_telefone) > 40 THEN
        RAISE EXCEPTION 'telefone_invalido';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.leads
        WHERE email = v_email
          AND telefone = v_telefone
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

CREATE OR REPLACE FUNCTION public.registrar_evento(
    p_tipo text,
    p_path text DEFAULT NULL,
    p_referrer text DEFAULT NULL,
    p_dispositivo text DEFAULT NULL,
    p_visitante_id text DEFAULT NULL,
    p_sessao_id text DEFAULT NULL,
    p_secao text DEFAULT NULL,
    p_utm_source text DEFAULT NULL,
    p_utm_medium text DEFAULT NULL,
    p_utm_campaign text DEFAULT NULL,
    p_utm_term text DEFAULT NULL,
    p_utm_content text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id bigint;
    v_total integer;
BEGIN
    IF p_tipo IS NULL OR p_tipo NOT IN (
        'pageview', 'secao', 'clique_whatsapp', 'clique_telefone',
        'clique_email', 'abrir_formulario', 'lead_enviado', 'clique_noticia'
    ) THEN
        RETURN NULL;
    END IF;

    IF p_sessao_id IS NOT NULL THEN
        SELECT count(*) INTO v_total
        FROM public.visitas
        WHERE sessao_id = p_sessao_id
          AND criado_em > now() - interval '1 minute';

        IF v_total >= 60 THEN
            RETURN NULL;
        END IF;
    END IF;

    INSERT INTO public.visitas (
        tipo, path, referrer, dispositivo, visitante_id, sessao_id, secao,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content
    )
    VALUES (
        p_tipo,
        nullif(trim(coalesce(p_path, '')), ''),
        nullif(trim(coalesce(p_referrer, '')), ''),
        nullif(trim(coalesce(p_dispositivo, '')), ''),
        nullif(trim(coalesce(p_visitante_id, '')), ''),
        nullif(trim(coalesce(p_sessao_id, '')), ''),
        nullif(trim(coalesce(p_secao, '')), ''),
        nullif(trim(coalesce(p_utm_source, '')), ''),
        nullif(trim(coalesce(p_utm_medium, '')), ''),
        nullif(trim(coalesce(p_utm_campaign, '')), ''),
        nullif(trim(coalesce(p_utm_term, '')), ''),
        nullif(trim(coalesce(p_utm_content, '')), '')
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_evento(text, text, text, text, text, text, text, text, text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.clicar_noticia(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.noticias
    SET cliques = cliques + 1
    WHERE id = p_id AND publicado = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clicar_noticia(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.noticias_publicas(
    p_limite integer DEFAULT 6,
    p_categoria text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    titulo text,
    resumo text,
    categoria text,
    fonte text,
    url text,
    imagem_url text,
    publicado_em timestamptz,
    destaque boolean,
    cliques integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT n.id, n.titulo, n.resumo, n.categoria, n.fonte, n.url, n.imagem_url,
           n.publicado_em, n.destaque, n.cliques
    FROM public.noticias n
    WHERE n.publicado = true
      AND (p_categoria IS NULL OR n.categoria = p_categoria)
    ORDER BY n.destaque DESC, n.publicado_em DESC
    LIMIT greatest(1, least(coalesce(p_limite, 6), 50));
$$;

GRANT EXECUTE ON FUNCTION public.noticias_publicas(integer, text) TO anon, authenticated;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

CREATE OR REPLACE VIEW public.vw_painel_resumo WITH (security_invoker = true) AS
SELECT
    (SELECT count(*)::int FROM public.leads) AS total_leads,
    (SELECT count(*)::int FROM public.leads WHERE status = 'novo') AS leads_novos,
    (SELECT count(*)::int FROM public.leads WHERE criado_em > now() - interval '30 days') AS leads_30d,
    (SELECT count(*)::int FROM public.visitas WHERE tipo = 'pageview') AS total_pageviews,
    (SELECT count(*)::int FROM public.visitas WHERE tipo = 'pageview' AND criado_em > now() - interval '30 days') AS pageviews_30d,
    (SELECT count(DISTINCT visitante_id)::int FROM public.visitas) AS visitantes,
    (SELECT count(*)::int FROM public.noticias WHERE publicado = true) AS noticias_publicadas;

GRANT SELECT ON public.vw_painel_resumo TO authenticated;

CREATE OR REPLACE VIEW public.vw_leads_por_dia WITH (security_invoker = true) AS
SELECT date_trunc('day', criado_em)::date AS dia,
       count(*)::int AS leads
FROM public.leads
WHERE criado_em > now() - interval '90 days'
GROUP BY 1
ORDER BY 1;

GRANT SELECT ON public.vw_leads_por_dia TO authenticated;

CREATE OR REPLACE VIEW public.vw_visitas_por_dia WITH (security_invoker = true) AS
SELECT date_trunc('day', criado_em)::date AS dia,
       count(*) FILTER (WHERE tipo = 'pageview')::int AS pageviews,
       count(*)::int AS eventos
FROM public.visitas
WHERE criado_em > now() - interval '90 days'
GROUP BY 1
ORDER BY 1;

GRANT SELECT ON public.vw_visitas_por_dia TO authenticated;

CREATE OR REPLACE VIEW public.vw_visitas_por_tipo WITH (security_invoker = true) AS
SELECT tipo,
       count(*)::int AS total
FROM public.visitas
WHERE criado_em > now() - interval '90 days'
GROUP BY tipo
ORDER BY total DESC;

GRANT SELECT ON public.vw_visitas_por_tipo TO authenticated;
