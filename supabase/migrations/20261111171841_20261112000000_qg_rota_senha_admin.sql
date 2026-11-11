-- Rotacao da senha do administrador.
--
-- Este repositorio e publico, entao a senha NAO fica versionada.
-- Defina a senha na MESMA sessao, antes de rodar o arquivo:
--
--   SET app.admin_senha = 'sua-senha-forte-aqui';
--
-- Sem essa variavel a sentenca nao altera nada (no-op seguro).

UPDATE auth.users
SET encrypted_password = crypt(current_setting('app.admin_senha', true), gen_salt('bf')),
    updated_at = now()
WHERE email = 'contato@qgraos.com.br'
  AND current_setting('app.admin_senha', true) IS NOT NULL;
