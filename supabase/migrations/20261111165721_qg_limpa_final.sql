-- Limpeza final dos dados gerados pelo teste de integracao.
-- Reescrita para nunca apagar dado real: remove apenas leads de teste
-- e as visitas do caminho usado pelo teste automatizado.
-- (As visitas da verificacao visual ja se limpam sozinhas, pelo
-- identificador de visitante do navegador de teste.)
DELETE FROM public.leads WHERE email IN ('teste@qgraos.invalid', 'teste@exemplo.com.br');
DELETE FROM public.visitas WHERE path = '/teste-automated';
