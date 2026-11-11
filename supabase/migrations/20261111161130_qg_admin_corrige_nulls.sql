UPDATE auth.users
SET confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    phone_change = '',
    phone_change_token = '',
    email_change_token_current = '',
    reauthentication_token = '',
    raw_user_meta_data = jsonb_build_object(
        'sub', id::text,
        'email', email,
        'email_verified', true,
        'phone_verified', false,
        'nome', 'Administrador Q GRAOS'
    )
WHERE email = 'contato@qgraos.com.br';
