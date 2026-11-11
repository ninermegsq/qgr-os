-- Cria o usuario administrador inicial do painel (Auth + tabela public.administradores).
--
-- IMPORTANTE: este repositorio e publico, entao a senha NAO fica versionada aqui.
-- Antes de rodar este arquivo, defina a senha na MESMA sessao:
--
--   SET app.admin_senha = 'crie-uma-senha-forte-aqui';
--
-- O bloco abaixo aborta se a variavel nao estiver definida.

DO $$
DECLARE
    senha text := current_setting('app.admin_senha', true);
BEGIN
    IF senha IS NULL OR senha = '' THEN
        RAISE EXCEPTION 'Defina app.admin_senha antes de rodar esta migration: SET app.admin_senha = ''...'';';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'contato@qgraos.com.br') THEN
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at
        )
        VALUES (
            '00000000-0000-0000-0000-000000000000',
            gen_random_uuid(),
            'authenticated',
            'authenticated',
            'contato@qgraos.com.br',
            crypt(senha, gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"nome":"Administrador Q GRAOS"}'::jsonb,
            now(),
            now()
        );

        INSERT INTO auth.identities (
            provider_id,
            user_id,
            identity_data,
            provider,
            last_sign_in_at,
            created_at,
            updated_at
        )
        SELECT
            u.id::text,
            u.id,
            jsonb_build_object(
                'sub', u.id::text,
                'email', u.email,
                'email_verified', true,
                'phone_verified', false
            ),
            'email',
            now(),
            now(),
            now()
        FROM auth.users u
        WHERE u.email = 'contato@qgraos.com.br';
    END IF;

    INSERT INTO public.administradores (user_id, email, nome)
    SELECT u.id, u.email, 'Administrador Q GRAOS'
    FROM auth.users u
    WHERE u.email = 'contato@qgraos.com.br'
      AND NOT EXISTS (
          SELECT 1 FROM public.administradores a WHERE a.user_id = u.id
      );
END $$;
