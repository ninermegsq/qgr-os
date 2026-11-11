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
